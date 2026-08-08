(function () {
  "use strict";

  var activeTab = null;
  var port = null;
  var scrapeActive = false;
  var currentUsername = null;

  var $ = function (id) { return document.getElementById(id); };

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return "\u2013";
    return n >= 1000 ? n.toLocaleString() : String(n);
  }

  function setStatus(text) {
    $("status").textContent = text || "";
  }

  function stageLabel(stage) {
    return I18n.t(stage === "following" ? "following" : "followers");
  }

  function connectPort() {
    try { if (port) port.disconnect(); } catch (e) {}
    port = chrome.runtime.connect({ name: "ig-status" });
    port.onMessage.addListener(onPortMessage);
    port.onDisconnect.addListener(function () { port = null; });
  }

  function showIdle() {
    scrapeActive = false;
    $("progress").classList.add("hidden");
    $("resumeCard").classList.add("hidden");
    $("actions").classList.remove("hidden");
  }

  function showProgress(reconnected) {
    scrapeActive = true;
    $("actions").classList.add("hidden");
    $("resumeCard").classList.add("hidden");
    $("progress").classList.remove("hidden");
    $("reconnectNote").classList.toggle("hidden", !reconnected);
  }

  function showReport() {
    scrapeActive = false;
    $("actions").classList.add("hidden");
    $("progress").classList.add("hidden");
    $("resumeCard").classList.remove("hidden");
    $("resumeText").textContent = I18n.t("reportReady");
    $("viewReportBtn").textContent = I18n.t("openDashboard");
  }

  function setProgressText(stage, count) {
    $("progressText").textContent = I18n.t("getting", {
      stage: stageLabel(stage),
      count: count
    });
  }

  function onPortMessage(msg) {
    if (!msg) return;
    if (msg.type === "PROGRESS") {
      var isFollowing = msg.stage === "following";
      $("barFill").style.width = isFollowing ? "85%" : "40%";
      setProgressText(msg.stage, msg.count);
    } else if (msg.type === "STATUS") {
      if (msg.text === "rateLimited") {
        $("progressText").textContent = I18n.t("rateLimited");
      } else if (msg.text === "retryingStage") {
        $("progressText").textContent = I18n.t("retryingStage");
      } else if (msg.text === "resuming") {
        $("progressText").textContent = I18n.t("resuming");
      }
    } else if (msg.type === "DONE") {
      if (msg.resumed) {
        showReport();
        setStatus(I18n.t("statusUpdated"));
      } else {
        showReport();
        setStatus(I18n.t("openingDashboard"));
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
      }
    } else if (msg.type === "ERROR") {
      showIdle();
      if (msg.message === "Stopped") {
        setStatus(I18n.t("statusCancelled"));
      } else {
        setStatus(I18n.t("statusError", { msg: msg.message }));
      }
    }
  }

  async function start() {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) return;
    activeTab = tabs[0];

    connectPort();

    var res = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
    var st = res && res.status;

    var onIg = !!(activeTab.url && activeTab.url.indexOf("instagram.com") !== -1);
    var p = null;
    if (onIg) {
      try {
        var sr = await chrome.tabs.sendMessage(activeTab.id, { type: "SCAN" });
        if (sr && sr.ok) p = sr.profile;
      } catch (e) {}
    }

    if (st && st.active) {
      showProgress(true);
      if (st.stage) setProgressText(st.stage, st.count);
    } else if (st && st.done && p && p.username && st.username === p.username) {
      renderProfile(p);
      showReport();
    } else {
      showIdle();
      if (!onIg) {
        setStatus(I18n.t("statusNotOnIg"));
      } else if (p) {
        renderProfile(p);
        setStatus("");
      } else {
        setStatus(I18n.t("statusNotReady"));
      }
    }
  }

  async function scan() {
    if (!activeTab) return;
    setStatus(I18n.t("scanning"));
    try {
      var res = await chrome.tabs.sendMessage(activeTab.id, { type: "SCAN" });
      if (res && res.ok) {
        renderProfile(res.profile);
        setStatus("");
      } else {
        setStatus(I18n.t("statusCannotRead"));
      }
    } catch (e) {
      setStatus(I18n.t("statusNotReady"));
    }
  }

  function renderProfile(p) {
    currentUsername = p.username || null;
    $("profile").classList.remove("hidden");
    $("profileUsername").textContent = "@" + (p.username || "?");
    $("followersCount").textContent = fmt(p.followers);
    $("followingCount").textContent = fmt(p.following);

    chrome.runtime.sendMessage({ type: "CHECK_LOGIN" }, function (r) {
      var loggedIn = !!(r && r.loggedIn);
      $("loginStatus").textContent = loggedIn ? I18n.t("loggedIn") : I18n.t("notLoggedIn");
      $("loginStatus").className = "badge " + (loggedIn ? "ok" : "warn");
      $("loginHint").classList.toggle("hidden", loggedIn);
    });

    var total = (p.followers || 0) + (p.following || 0);
    var big = total > 10000;
    var bigEnough = total > 5000;
    $("warning").classList.toggle("hidden", !big);
    $("exportHint").classList.toggle("hidden", !bigEnough);
    $("actions").classList.toggle("hidden", big);
  }

  async function beginAnalysis() {
    if (scrapeActive || !activeTab) return;

    setStatus(I18n.t("scanning"));
    var p = null;
    try {
      var res = await chrome.tabs.sendMessage(activeTab.id, { type: "SCAN" });
      if (res && res.ok) p = res.profile;
    } catch (e) {}

    if (!p || !p.username) {
      setStatus(I18n.t("statusOpenFirst"));
      return;
    }

    currentUsername = p.username;
    renderProfile(p);

    if ((p.followers || 0) + (p.following || 0) > 10000) {
      setStatus(I18n.t("statusNotRecommended"));
      return;
    }

    connectPort();
    chrome.runtime.sendMessage({
      type: "SCRAPE",
      username: p.username,
      expectedF: p.followers,
      expectedG: p.following
    });
    showProgress(false);
    setProgressText("followers", 0);
    setStatus("");
  }

  function cancelScrape() {
    chrome.runtime.sendMessage({ type: "CANCEL" });
    showIdle();
    setStatus(I18n.t("statusCancelled"));
  }

  function extractUsername(input) {
    input = input.trim();
    var m = input.match(/instagram\.com\/([A-Za-z0-9._]+)/);
    if (m) return m[1];
    return input.replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "");
  }

  async function goToProfile() {
    var raw = $("usernameInput").value;
    var username = extractUsername(raw);
    if (!username) {
      setStatus(I18n.t("statusEnterValid"));
      return;
    }
    setStatus(I18n.t("opening", { user: username }));
    await chrome.tabs.update(activeTab.id, { url: "https://www.instagram.com/" + username + "/" });
    await pollScan(25);
  }

  async function pollScan(tries) {
    for (var i = 0; i < tries; i++) {
      await sleep(1000);
      try {
        var res = await chrome.tabs.sendMessage(activeTab.id, { type: "SCAN" });
        if (res && res.ok) {
          renderProfile(res.profile);
          setStatus("");
          return;
        }
      } catch (e) {}
    }
    setStatus(I18n.t("statusCannotReadAuto"));
  }

  $("goBtn").addEventListener("click", goToProfile);
  $("usernameInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") goToProfile();
  });
  $("analyzeBtn").addEventListener("click", beginAnalysis);
  $("cancelBtn").addEventListener("click", cancelScrape);
  $("viewReportBtn").addEventListener("click", function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });

  window.onLangChanged = function () {
    I18n.applyToDocument();
    if (activeTab && !scrapeActive) {
      if (!activeTab.url || activeTab.url.indexOf("instagram.com") === -1) {
        setStatus(I18n.t("statusNotOnIg"));
      } else {
        scan();
      }
    }
  };

  I18n.load(function () {
    I18n.applyToDocument();
    I18n.bindLangSelect($("langSelect"));
    start();
  });
})();
