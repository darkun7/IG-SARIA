(function () {
  "use strict";

  var RESERVED = new Set([
    "explore", "direct", "accounts", "session", "reels", "stories", "p", "reel",
    "tv", "graphql", "i", "ads", "legal", "about", "about-us", "press", "privacy",
    "terms", "login", "signup", "web", "support", "blog", "developers", "help",
    "usertags", "notifications", "settings", "saved", "tagged", "discover",
    "people", "topical-explore", "maps", "threads", "igtv", "guide", "location",
    "emails", "password", "challenge", "two_factor"
  ]);

  var stopRequested = false;

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

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

  function getCsrfToken() {
    var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? m[1] : null;
  }

  async function getUserId(username) {
    var csrf = getCsrfToken();

    try {
      var res = await fetch(
        "https://www.instagram.com/api/v1/users/web_profile_info/?username=" + encodeURIComponent(username),
        {
          method: "GET",
          credentials: "include",
          headers: {
            "X-CSRFToken": csrf || "",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://www.instagram.com/" + username + "/"
          }
        }
      );
      if (res.ok) {
        var data = await res.json();
        if (data && data.data && data.data.user && data.data.user.id) {
          return String(data.data.user.id);
        }
      }
    } catch (e) {}

    try {
      var res2 = await fetch(
        "https://www.instagram.com/web/search/topsearch/?query=" + encodeURIComponent(username),
        { method: "GET", credentials: "include" }
      );
      if (res2.ok) {
        var d2 = await res2.json();
        var users = d2.users || [];
        for (var i = 0; i < users.length; i++) {
          var u = users[i].user || {};
          if (u.username === username && u.pk) {
            return String(u.pk);
          }
        }
      }
    } catch (e) {}

    try {
      if (window._sharedData && window._sharedData.entry_data) {
        var pages = window._sharedData.entry_data.ProfilePage;
        if (pages && pages[0] && pages[0].graphql && pages[0].graphql.user && pages[0].graphql.user.id) {
          return String(pages[0].graphql.user.id);
        }
      }
    } catch (e) {}

    try {
      var html = document.documentElement.innerHTML;
      var idx = html.indexOf('"username":"' + username + '"');
      if (idx !== -1) {
        var chunk = html.slice(idx, idx + 800);
        var mid = chunk.match(/"pk":"(\d+)"|"pk":(\d+)/) || chunk.match(/"id":"(\d+)"|"id":(\d+)/);
        if (mid) return String(mid[1]);
      }
    } catch (e) {}

    throw new Error(
      "Could not resolve the account id for @" + username + ". Make sure you are logged in, " +
      "reload the profile page, and try again."
    );
  }

  async function apiScrapeList(type, onProgress) {
    var username = getUsernameFromUrl();
    var userId = await getUserId(username);
    var csrf = getCsrfToken();
    if (!csrf) throw new Error("Missing session token. Make sure you are logged in.");

    var path = type === "followers" ? "followers" : "following";
    var users = [];
    var nextMaxId = null;
    var hasMore = true;
    var iterations = 0;
    var count = 200;
    var gotAny = false;

    while (hasMore && !stopRequested) {
      var params = "?count=" + count + "&search_surface=follow_list_page";
      if (nextMaxId) params += "&max_id=" + encodeURIComponent(nextMaxId);
      var url =
        "https://www.instagram.com/api/v1/friendships/" + userId + "/" + path + "/" + params;

      var res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "X-CSRFToken": csrf,
          "X-Requested-With": "XMLHttpRequest",
          "X-IG-App-ID": "936619743392459",
          "Referer": "https://www.instagram.com/" + username + "/"
        }
      });

      if (res.status === 400 && count === 200) {
        count = 12;
        continue;
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Instagram blocked the request (HTTP " + res.status + "). Make sure you are logged in and try again.");
        }
        if (res.status === 429) {
          throw new Error("Rate limited by Instagram (HTTP 429). Wait a bit and try again.");
        }
        throw new Error("Instagram API error (HTTP " + res.status + ").");
      }

      var data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error("Instagram returned an unexpected response for " + type + ". Make sure you are logged in.");
      }
      gotAny = true;

      var batch = data.users || [];
      for (var i = 0; i < batch.length; i++) {
        if (batch[i] && batch[i].username) users.push(batch[i].username);
      }
      users = Array.from(new Set(users));
      if (onProgress) onProgress({ count: users.length });

      hasMore = !!data.has_more && !!data.next_max_id;
      nextMaxId = data.next_max_id || null;

      if (++iterations > 500) break;
      await sleep(400);
    }

    if (!gotAny) {
      throw new Error("No " + type + " found. Make sure you are logged in and the account is not private.");
    }
    return { users: users };
  }

  function getDialog() {
    return document.querySelector('div[role="dialog"]');
  }

  function isDialogPage() {
    return /^\/([A-Za-z0-9._]+)\/(followers|following)\/?$/.test(location.pathname);
  }

  function getScrollContainer(dialog) {
    var divs = dialog.querySelectorAll("div");
    var candidates = [];
    for (var i = 0; i < divs.length; i++) {
      var el = divs[i];
      if (el.scrollHeight > el.clientHeight + 30) {
        var cs = window.getComputedStyle(el);
        if (cs.overflowY === "auto" || cs.overflowY === "scroll") {
          candidates.push(el);
        }
      }
    }
    candidates.sort(function (a, b) { return b.scrollHeight - a.scrollHeight; });
    return candidates[0] || dialog;
  }

  function collectUsernames(set, currentUser) {
    var dialog = getDialog();
    if (!dialog) return;
    var links = dialog.querySelectorAll('a[href^="/"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      var m = href.match(/^\/([A-Za-z0-9._]+)\/?$/);
      if (!m) continue;
      var name = m[1];
      if (RESERVED.has(name) || name === currentUser) continue;
      set.add(name);
    }
  }

  function dialogHasUsers(currentUser) {
    var set = new Set();
    collectUsernames(set, currentUser);
    return set.size > 0;
  }

  function safeClick(el) {
    if (!el) return;
    if (typeof el.click === "function") {
      try { el.click(); } catch (e) {}
    } else {
      try {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      } catch (e) {}
    }
  }

  function closeDialog() {
    var d = getDialog();
    if (!d) return;
    var btn = d.querySelector('[aria-label="Close"], button[aria-label="Close"]');
    safeClick(btn);
  }

  function findStatElements(type) {
    var label = type.toLowerCase();
    var out = [];
    var all = document.querySelectorAll("span, div, a, li");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length > 0) continue;
      var t = (el.textContent || "").trim().toLowerCase();
      if (t === label) out.push(el);
    }
    return out;
  }

  function tryOpenDialog(username, type) {
    var href = "/" + username + "/" + type + "/";
    var link = document.querySelector('a[href^="' + href + '"]');
    if (link) { safeClick(link); return; }

    var cands = findStatElements(type);
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      var clickable = el.closest('a, button, div[role="button"], li');
      safeClick(clickable || el);
      return;
    }

    throw new Error("Could not find the " + type + " link. Reload the profile and try again.");
  }

  function waitForDialogWithContent(type) {
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      var currentUser = getUsernameFromUrl();
      var iv = setInterval(function () {
        var d = getDialog();
        if (d) {
          var set = new Set();
          collectUsernames(set, currentUser);
          if (set.size > 0) {
            clearInterval(iv);
            resolve(d);
            return;
          }
        }
        if (Date.now() - start > 15000) {
          clearInterval(iv);
          reject(new Error("Instagram did not load the " + type + " list. Make sure you are logged in."));
        }
      }, 500);
    });
  }

  async function scrapeListDom(type, onProgress) {
    var username = getUsernameFromUrl();
    if (!username) throw new Error("Not on an Instagram profile page.");

    var dialog = getDialog();
    if (dialog && dialogHasUsers(username)) {
      // dialog already open with content (e.g. /username/followers/ page)
    } else {
      if (!isDialogPage()) {
        closeDialog();
        await sleep(600);
      }
      tryOpenDialog(username, type);
      dialog = await waitForDialogWithContent(type);
    }

    var scrollBox = getScrollContainer(dialog);
    var users = new Set();
    var idle = 0;
    var maxIterations = 1500;

    for (var i = 0; i < maxIterations; i++) {
      if (stopRequested) break;
      scrollBox.scrollTop = scrollBox.scrollHeight;
      document.documentElement.scrollTop = document.body.scrollTop = document.documentElement.scrollHeight;
      await sleep(900);
      var before = users.size;
      collectUsernames(users, username);
      if (users.size === before) idle++; else idle = 0;
      if (onProgress) onProgress({ count: users.size });
      if (idle >= 3) break;
    }

    closeDialog();

    if (users.size === 0) {
      throw new Error("No " + type + " found. Make sure you are logged in and try again.");
    }
    return { users: Array.from(users) };
  }

  async function scrapeAll(onProgress) {
    stopRequested = false;

    var followers, following;

    try {
      followers = (await apiScrapeList("followers", function (p) {
        if (onProgress) onProgress({ stage: "followers", count: p.count });
      })).users;
    } catch (apiErr) {
      try {
        followers = (await scrapeListDom("followers", function (p) {
          if (onProgress) onProgress({ stage: "followers", count: p.count });
        })).users;
      } catch (e) {
        throw new Error(apiErr.message);
      }
    }
    if (stopRequested) throw new Error("Stopped");

    try {
      following = (await apiScrapeList("following", function (p) {
        if (onProgress) onProgress({ stage: "following", count: p.count });
      })).users;
    } catch (apiErr) {
      try {
        following = (await scrapeListDom("following", function (p) {
          if (onProgress) onProgress({ stage: "following", count: p.count });
        })).users;
      } catch (e) {
        throw new Error(apiErr.message);
      }
    }
    if (stopRequested) throw new Error("Stopped");

    return { followers: followers, following: following };
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

  chrome.runtime.onConnect.addListener(function (port) {
    if (port.name !== "ig-port") return;

    port.onMessage.addListener(function (msg) {
      if (msg && msg.type === "STOP") {
        stopRequested = true;
        return;
      }
      if (msg && msg.type === "SCRAPE_ALL") {
        scrapeAll(function (progress) {
          try {
            port.postMessage({ type: "PROGRESS", stage: progress.stage, count: progress.count });
          } catch (e) {}
        })
          .then(function (result) {
            try {
              port.postMessage({ type: "DONE", followers: result.followers, following: result.following });
            } catch (e) {}
          })
          .catch(function (err) {
            try {
              port.postMessage({ type: "ERROR", message: err.message || String(err) });
            } catch (e) {}
          });
      }
    });
  });
})();
