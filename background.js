(function () {
  "use strict";

  var RETRY_ALARM = "ig-retry";

  var state = {
    username: null,
    expectedF: null,
    expectedG: null,
    followers: [],
    following: [],
    followersDone: false,
    followingDone: false,
    nextMaxId: null,
    hasMore: true,
    stageCount: 0,
    iterations: 0,
    running: false,
    waitingForRetry: false,
    error: null,
    done: false,
    startedAt: null
  };

  var ports = [];
  var stopRequested = false;

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function loadState(cb) {
    chrome.storage.local.get("igScrape", function (res) {
      if (res.igScrape) state = res.igScrape;
      if (state.maxPasses == null) state.maxPasses = 3;
      if (state.stagePass == null) state.stagePass = 0;
      if (state.consecutiveEmpty == null) state.consecutiveEmpty = 0;
      if (cb) cb();
    });
  }

  function saveState(cb) {
    var obj = {};
    obj.igScrape = state;
    chrome.storage.local.set(obj, cb || function () {});
  }

  function post(msg) {
    try {
      for (var i = 0; i < ports.length; i++) {
        try { ports[i].postMessage(msg); } catch (e) {}
      }
    } catch (e) {}
  }

  function getCsrfToken() {
    return new Promise(function (resolve) {
      chrome.cookies.get({ url: "https://www.instagram.com/", name: "csrftoken" }, function (cookie) {
        resolve(cookie ? cookie.value : null);
      });
    });
  }

  async function getUserId(username) {
    var csrf = await getCsrfToken();

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
          if (u.username === username && u.pk) return String(u.pk);
        }
      }
    } catch (e) {}

    try {
      var html = await (await fetch("https://www.instagram.com/" + username + "/", { credentials: "include" })).text();
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

  function expectedForStage() {
    return state.stage === "followers" ? state.expectedF : state.expectedG;
  }

  function setStage(stage) {
    state.stage = stage;
    state.nextMaxId = null;
    state.hasMore = true;
    state.stageCount = 0;
    state.iterations = 0;
    state.stagePass = 0;
    state.consecutiveEmpty = 0;
    if (stage === "followers") state.followersDone = false;
    else state.followingDone = false;
  }

  async function fetchPage(stage) {
    var username = state.username;
    var csrf = await getCsrfToken();
    if (!csrf) throw new Error("Missing session token. Make sure you are logged in.");

    var path = stage === "followers" ? "followers" : "following";
    var userId = await getUserId(username);
    var count = 200;

    var params = "?count=" + count + "&search_surface=follow_list_page";
    if (state.nextMaxId) params += "&max_id=" + encodeURIComponent(state.nextMaxId);
    var url = "https://www.instagram.com/api/v1/friendships/" + userId + "/" + path + "/" + params;

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

    if (res.status === 429) {
      throw new RateLimitError();
    }

    if (res.status === 400 && count === 200) {
      count = 12;
      params = "?count=" + count + "&search_surface=follow_list_page";
      if (state.nextMaxId) params += "&max_id=" + encodeURIComponent(state.nextMaxId);
      url = "https://www.instagram.com/api/v1/friendships/" + userId + "/" + path + "/" + params;
      res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "X-CSRFToken": csrf,
          "X-Requested-With": "XMLHttpRequest",
          "X-IG-App-ID": "936619743392459",
          "Referer": "https://www.instagram.com/" + username + "/"
        }
      });
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("Instagram blocked the request (HTTP " + res.status + "). Make sure you are logged in and try again.");
      }
      throw new Error("Instagram API error (HTTP " + res.status + ").");
    }

    var data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error("Instagram returned an unexpected response for " + stage + ". Make sure you are logged in.");
    }

    return data;
  }

  function RateLimitError() {
    this.name = "RateLimitError";
  }

  function applyBatch(data) {
    var target = state.stage === "followers" ? state.followers : state.following;
    var batch = data.users || [];
    for (var i = 0; i < batch.length; i++) {
      if (batch[i] && batch[i].username) target.push(batch[i].username);
    }
    target = Array.from(new Set(target));
    if (state.stage === "followers") state.followers = target;
    else state.following = target;

    state.hasMore = !!data.has_more && !!data.next_max_id;
    state.nextMaxId = data.next_max_id || null;
    state.stageCount = target.length;
    state.iterations++;
  }

  function completeStage() {
    if (state.stage === "followers") state.followersDone = true;
    else state.followingDone = true;
  }

  async function step() {
    if (stopRequested) {
      finishScrape(false, new Error("Stopped"));
      return;
    }
    if (state.error) {
      finishScrape(false, new Error(state.error));
      return;
    }

    var stage = state.stage;
    var data;
    try {
      data = await fetchPage(stage);
    } catch (err) {
      if (err instanceof RateLimitError) {
        scheduleRetry();
        return;
      }
      finishScrape(false, err);
      return;
    }

    var batchLen = (data.users || []).length;
    applyBatch(data);

    // Empty page while more should exist -> likely soft block
    if (batchLen === 0 && state.hasMore && state.iterations > 0) {
      state.consecutiveEmpty = (state.consecutiveEmpty || 0) + 1;
      if (state.consecutiveEmpty >= 3) {
        state.hasMore = false;
      }
    }

    post({ type: "PROGRESS", stage: stage, count: state.stageCount });

    // Stage completed (or stopped early by a soft block)
    if (!state.hasMore || state.stageCount >= expectedForStage()) {
      var expected = expectedForStage();
      var short = expected != null && state.stageCount < expected * 0.98;

      if (!state.hasMore && short && state.stagePass < state.maxPasses) {
        // Incomplete - run this stage again from scratch and merge results
        state.stagePass++;
        state.nextMaxId = null;
        state.hasMore = true;
        state.iterations = 0;
        state.consecutiveEmpty = 0;
        post({ type: "STATUS", text: "retryingStage" });
        saveState(function () {
          chrome.alarms.create("ig-tick", { when: Date.now() + 3000 });
        });
        return;
      }

      completeStage();
      if (stage === "followers" && !state.followingDone) {
        setStage("following");
      } else if (state.followingDone) {
        finishScrape(true);
        return;
      }
    }

    saveState(function () {
      if (stopRequested) {
        finishScrape(false, new Error("Stopped"));
        return;
      }
      scheduleNextStep();
    });
  }

  function scheduleNextStep() {
    chrome.alarms.create("ig-tick", { when: Date.now() + 2000 });
    state.running = true;
    saveState();
  }

  function scheduleRetry() {
    var attempt = (state.iterations || 0) > 0 ? 1 : 0;
    state.waitingForRetry = true;
    state.retryAttempt = (state.retryAttempt || 0) + 1;
    state.running = false;

    if (state.retryAttempt > 3) {
      finishScrape(false, new Error("Rate limited by Instagram after multiple attempts. Wait a few minutes and try again."));
      return;
    }

    var delay = state.retryAttempt * 30 * 1000; // 30s, 60s, 90s
    post({ type: "STATUS", text: "rateLimited" });
    saveState(function () {
      chrome.alarms.create(RETRY_ALARM, { when: Date.now() + delay });
    });
  }

  function finishScrape(success, err) {
    chrome.alarms.clear("ig-tick");
    chrome.alarms.clear(RETRY_ALARM);

    state.running = false;
    state.waitingForRetry = false;
    state.retryAttempt = 0;

    if (!success) {
      state.error = (err && err.message) || String(err);
      saveState(function () {
        post({ type: "ERROR", message: state.error });
      });
      return;
    }

    state.done = true;
    state.error = null;
    state.followers = Array.from(new Set(state.followers));
    state.following = Array.from(new Set(state.following));

    var incomplete = (state.expectedF !== null && state.followers.length < state.expectedF) ||
                     (state.expectedG !== null && state.following.length < state.expectedG);

    var igData = {
      username: state.username,
      followers: state.followers,
      following: state.following,
      date: Date.now(),
      incomplete: incomplete,
      expectedF: state.expectedF,
      expectedG: state.expectedG
    };

    chrome.storage.local.set({ igData: igData }, function () {
      saveState(function () {
        post({ type: "DONE", followers: state.followers, following: state.following, resumed: !!state.resumed });
      });
    });
  }

  function getStatus() {
    return {
      active: state.running || state.waitingForRetry,
      stage: state.stage,
      count: state.stageCount,
      followersCount: state.followers.length,
      followingCount: state.following.length,
      done: state.done,
      error: state.error,
      username: state.username,
      lastDone: !!(state.done || (state.username))
    };
  }

  function startScrape(msg) {
    stopRequested = false;
    state = {
      username: msg.username,
      expectedF: msg.expectedF != null ? msg.expectedF : null,
      expectedG: msg.expectedG != null ? msg.expectedG : null,
      followers: [],
      following: [],
      followersDone: false,
      followingDone: false,
      nextMaxId: null,
      hasMore: true,
      stageCount: 0,
      iterations: 0,
      running: false,
      waitingForRetry: false,
      error: null,
      done: false,
      retryAttempt: 0,
      maxPasses: 3,
      stagePass: 0,
      consecutiveEmpty: 0,
      resumed: false,
      startedAt: Date.now()
    };
    setStage("followers");
    saveState(function () {
      state.running = true;
      saveState();
      step();
    });
  }

  function resumeScrape() {
    chrome.storage.local.get("igData", function (res) {
      var prev = res.igData || null;
      stopRequested = false;

      var followers = prev && prev.followers ? prev.followers.slice() : [];
      var following = prev && prev.following ? prev.following.slice() : [];
      var expectedF = prev && prev.expectedF != null ? prev.expectedF : null;
      var expectedG = prev && prev.expectedG != null ? prev.expectedG : null;

      var needsFollowers = expectedF !== null && followers.length < expectedF;
      var needsFollowing = expectedG !== null && following.length < expectedG;

      if (!needsFollowers && !needsFollowing) {
        post({ type: "DONE", followers: followers, following: following });
        return;
      }

      state = {
        username: prev ? prev.username : state.username,
        expectedF: expectedF,
        expectedG: expectedG,
        followers: followers,
        following: following,
        followersDone: !needsFollowers,
        followingDone: !needsFollowing,
        nextMaxId: null,
        hasMore: true,
        stageCount: 0,
        iterations: 0,
        running: false,
        waitingForRetry: false,
        error: null,
        done: false,
        retryAttempt: 0,
        maxPasses: 3,
        stagePass: 0,
        consecutiveEmpty: 0,
        resumed: true,
        startedAt: Date.now()
      };

      if (!needsFollowers && needsFollowing) {
        state.followersDone = true;
        setStage("following");
      } else {
        state.followersDone = false;
        setStage("followers");
      }

      post({ type: "STATUS", text: "resuming" });
      saveState(function () {
        state.running = true;
        saveState();
        step();
      });
    });
  }

  function resumeIfNeeded() {
    loadState(function () {
      if (state.running || state.waitingForRetry) {
        if (state.waitingForRetry) {
          // schedule alarm again
          var delay = (state.retryAttempt || 1) * 30 * 1000;
          chrome.alarms.create(RETRY_ALARM, { when: Date.now() + delay });
        } else {
          state.running = true;
          step();
        }
      }
    });
  }

  chrome.runtime.onInstalled.addListener(resumeIfNeeded);
  chrome.runtime.onStartup.addListener(resumeIfNeeded);

  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === "ig-tick") {
      step();
    } else if (alarm.name === RETRY_ALARM) {
      state.waitingForRetry = false;
      state.running = true;
      saveState();
      step();
    }
  });

  chrome.runtime.onConnect.addListener(function (port) {
    if (port.name !== "ig-status") return;
    ports.push(port);
    port.onDisconnect.addListener(function () {
      var idx = ports.indexOf(port);
      if (idx !== -1) ports.splice(idx, 1);
    });
    port.postMessage({ type: "STATUS_SNAPSHOT", status: getStatus() });
  });

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === "CHECK_LOGIN") {
      chrome.cookies.get({ url: "https://www.instagram.com/", name: "sessionid" }, function (cookie) {
        sendResponse({ loggedIn: !!cookie });
      });
      return true;
    }
    if (msg && msg.type === "SCRAPE") {
      startScrape(msg);
      sendResponse({ ok: true });
      return false;
    }
    if (msg && msg.type === "RESUME") {
      resumeScrape();
      sendResponse({ ok: true });
      return false;
    }
    if (msg && msg.type === "GET_STATUS") {
      sendResponse({ status: getStatus() });
      return false;
    }
    if (msg && msg.type === "CANCEL") {
      stopRequested = true;
      sendResponse({ ok: true });
      return false;
    }
  });
})();
