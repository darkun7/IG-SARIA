(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.IGSariaImport = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_UPLOAD_SIZE = 200 * 1024 * 1024;
  var MAX_ENTRY_SIZE = MAX_UPLOAD_SIZE;
  var MAX_TOTAL_SIZE = MAX_UPLOAD_SIZE;
  var USERNAME_RE = /^[A-Za-z0-9._]+$/;

  function textDecoder(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  function usernameFromHref(href) {
    if (!href) return "";
    var match = String(href).match(/instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)/i);
    return match ? match[1] : "";
  }

  function addCandidate(out, value) {
    if (typeof value !== "string") return;
    var text = value.trim();
    var fromHref = usernameFromHref(text);
    if (fromHref) text = fromHref;
    text = text.replace(/^@+/, "");
    if (USERNAME_RE.test(text)) out.push(text);
  }

  function parseJsonText(data) {
    var items = [];
    var addItem = function (item) {
      if (!item || typeof item !== "object") return;
      addCandidate(items, item.title);
      var list = Array.isArray(item.string_list_data) ? item.string_list_data : [];
      list.forEach(function (entry) {
        if (!entry || typeof entry !== "object") return;
        addCandidate(items, entry.value);
        addCandidate(items, entry.href);
      });
    };

    if (Array.isArray(data)) data.forEach(addItem);
    else if (data && typeof data === "object") {
      Object.keys(data).forEach(function (key) {
        if (/^relationships_(followers|following)$/i.test(key) && Array.isArray(data[key])) {
          data[key].forEach(addItem);
        }
      });
    }
    var seen = new Set();
    return items.filter(function (item) {
      var key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function parseHtmlText(html) {
    var items = [];
    if (typeof DOMParser !== "undefined") {
      var doc = new DOMParser().parseFromString(String(html), "text/html");
      var links = doc.querySelectorAll("a[href]");
      for (var i = 0; i < links.length; i++) {
        addCandidate(items, links[i].getAttribute("href"));
      }
    } else {
      var re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
      var match;
      while ((match = re.exec(String(html)))) addCandidate(items, match[1]);
    }
    return items;
  }

  function extension(name) {
    var match = String(name || "").toLowerCase().match(/\.(json|html?|zip)$/);
    return match ? match[1] : "";
  }

  function parseText(text, name) {
    var ext = extension(name);
    if (ext === "json") return parseJsonText(JSON.parse(text));
    if (ext === "html" || ext === "htm") return parseHtmlText(text);
    throw new Error("Unsupported file format. Use JSON, HTML, or ZIP.");
  }

  function readUint32(view, offset) { return view.getUint32(offset, true); }
  function readUint16(view, offset) { return view.getUint16(offset, true); }

  function findEndOfCentralDirectory(view) {
    var start = Math.max(0, view.byteLength - 65557);
    for (var i = view.byteLength - 22; i >= start; i--) {
      if (readUint32(view, i) === 0x06054b50) return i;
    }
    return -1;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "undefined") {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (typeof require === "function") return new Uint8Array(require("node:zlib").inflateRawSync(Buffer.from(bytes)));
    throw new Error("This browser cannot decompress ZIP entries.");
  }

  async function parseZipBuffer(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = findEndOfCentralDirectory(view);
    if (eocd < 0) throw new Error("Invalid ZIP file.");
    var count = readUint16(view, eocd + 10);
    var centralOffset = readUint32(view, eocd + 16);
    var offset = centralOffset;
    var entries = [];
    var totalSize = 0;

    for (var i = 0; i < count; i++) {
      if (readUint32(view, offset) !== 0x02014b50) throw new Error("Invalid ZIP directory.");
      var method = readUint16(view, offset + 10);
      var compressedSize = readUint32(view, offset + 20);
      var uncompressedSize = readUint32(view, offset + 24);
      var nameLength = readUint16(view, offset + 28);
      var extraLength = readUint16(view, offset + 30);
      var commentLength = readUint16(view, offset + 32);
      var localOffset = readUint32(view, offset + 42);
      var name = textDecoder(bytes.slice(offset + 46, offset + 46 + nameLength));
      offset += 46 + nameLength + extraLength + commentLength;
      if (!name || name.endsWith("/")) continue;
      if (uncompressedSize > MAX_ENTRY_SIZE || compressedSize > MAX_ENTRY_SIZE) {
        throw new Error("ZIP entry is too large.");
      }
      totalSize += uncompressedSize;
      if (totalSize > MAX_TOTAL_SIZE) throw new Error("ZIP contents are too large.");
      if (readUint32(view, localOffset) !== 0x04034b50) throw new Error("Invalid ZIP entry.");
      var localNameLength = readUint16(view, localOffset + 26);
      var localExtraLength = readUint16(view, localOffset + 28);
      var dataStart = localOffset + 30 + localNameLength + localExtraLength;
      var compressed = bytes.slice(dataStart, dataStart + compressedSize);
      var content;
      if (method === 0) content = compressed;
      else if (method === 8) content = await inflateRaw(compressed);
      else continue;
      if (content.byteLength > MAX_ENTRY_SIZE) throw new Error("ZIP entry is too large.");
      entries.push({ name: name, bytes: content, text: (function (entryBytes) {
        return function () { return textDecoder(entryBytes); };
      })(content) });
    }
    return entries;
  }

  function scoreEntry(name, role) {
    var lower = String(name).toLowerCase();
    var score = 0;
    if (lower.indexOf(role) >= 0) score += 10;
    if (role === "followers" && lower.indexOf("following") >= 0) score -= 5;
    if (role === "followers" && /(^|[\\/_-])followers(?:_\d+)?\.(json|html?)$/.test(lower)) score += 5;
    if (/(^|[\\/_-])following\.(json|html?)$/.test(lower) && role === "following") score += 5;
    return score;
  }

  function isExactEntry(name, role) {
    var base = String(name).split(/[\\/]/).pop().toLowerCase();
    if (role === "followers") return /^followers(?:_\d+)?\.(json|html?)$/.test(base);
    return /^following(?:_\d+)?\.(json|html?)$/.test(base);
  }

  async function parseFileBuffer(buffer, name, role) {
    var sourceBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (sourceBytes.byteLength > MAX_UPLOAD_SIZE) throw new Error("File is too large. Maximum size is 200 MB.");
    var ext = extension(name);
    if (ext !== "zip") return { usernames: parseText(textDecoder(sourceBytes), name), source: name };
    var entries = await parseZipBuffer(sourceBytes);
    var candidates = entries.filter(function (entry) { return extension(entry.name) === "json" || extension(entry.name) === "html" || extension(entry.name) === "htm"; });
    candidates.sort(function (a, b) { return scoreEntry(b.name, role) - scoreEntry(a.name, role); });
    var parsedCandidates = [];
    candidates.forEach(function (entry) {
      var usernames;
      try { usernames = parseText(entry.text(), entry.name); } catch (e) { return; }
      if (!usernames.length) return;
      parsedCandidates.push({ usernames: usernames, source: entry.name, score: scoreEntry(entry.name, role) });
    });
    if (!parsedCandidates.length) throw new Error("ZIP does not contain a readable followers/following export.");
    var exactCandidates = parsedCandidates.filter(function (candidate) { return isExactEntry(candidate.source, role); });
    var selected = exactCandidates.length ? exactCandidates : [parsedCandidates[0]];
    var seen = Object.create(null);
    var usernames = [];
    selected.forEach(function (candidate) {
      candidate.usernames.forEach(function (username) {
        var key = String(username).toLowerCase();
        if (!seen[key]) {
          seen[key] = true;
          usernames.push(username);
        }
      });
    });
    return { usernames: usernames, source: selected.map(function (candidate) { return candidate.source; }).join(", ") };
  }

  async function parseFile(file, role) {
    return parseFileBuffer(await file.arrayBuffer(), file.name, role);
  }

  return {
    parseJsonText: parseJsonText,
    parseHtmlText: parseHtmlText,
    parseZipBuffer: parseZipBuffer,
    parseFileBuffer: parseFileBuffer,
    parseFile: parseFile
  };
});
