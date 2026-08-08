(function () {
  "use strict";

  function getUsernameFromUrl() {
    var parts = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    return parts[0] || "";
  }

  function parseCount(str) {
    if (!str) return null;
    var cleaned = String(str).replace(/,/g, "").trim().toLowerCase();
    var num = parseFloat(cleaned);
    if (isNaN(num)) return null;
    if (cleaned.endsWith("b")) return num * 1000000000;
    if (cleaned.endsWith("m")) return num * 1000000;
    if (cleaned.endsWith("k")) return num * 1000;
    return num;
  }

  function getProfileInfo() {
    var username = getUsernameFromUrl();
    var followers = null;
    var following = null;
    var posts = null;

    var meta = document.querySelector('meta[property="og:description"]');
    if (meta && meta.content) {
      var t = meta.content;
      var mf = t.match(/([\d.,]+[KkMmBb]?)\s*Followers/i);
      var mg = t.match(/([\d.,]+[KkMmBb]?)\s*Following/i);
      var mp = t.match(/([\d.,]+[KkMmBb]?)\s*Posts/i);
      if (mf) followers = parseCount(mf[1]);
      if (mg) following = parseCount(mg[1]);
      if (mp) posts = parseCount(mp[1]);
    }

    if (followers === null || following === null) {
      var spans = document.querySelectorAll("span[title]");
      for (var i = 0; i < spans.length; i++) {
        var title = spans[i].getAttribute("title") || "";
        var m = title.match(/([\d.,]+[KkMmBb]?)/);
        if (!m) continue;
        if (/followers/i.test(title) && followers === null) followers = parseCount(m[1]);
        if (/following/i.test(title) && following === null) following = parseCount(m[1]);
        if (/posts/i.test(title) && posts === null) posts = parseCount(m[1]);
      }
    }

    return { username: username, followers: followers, following: following, posts: posts };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === "PING") {
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === "SCAN") {
      try {
        sendResponse({ ok: true, profile: getProfileInfo() });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    }
  });
})();
