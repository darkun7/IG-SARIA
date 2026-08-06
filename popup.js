(function () {
  "use strict";

  var activeTab = null;
  var port = null;
  var scraping = false;
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

  async function start() {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) return;
    activeTab = tabs[0];

    if (!activeTab.url || activeTab.url.indexOf("instagram.com") === -1) {
      setStatus(I18n.t("statusNotOnIg"));
      return;
    }
    scan();
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

  function onPortMessage(msg) {
    if (msg.type === "PROGRESS") {
      var isFollowing = msg.stage === "following";
      $("barFill").style.width = isFollowing ? "85%" : "40%";
      $("progressText").textContent = I18n.t("getting", {
        stage: stageLabel(msg.stage),
        count: msg.count
      });
    } else if (msg.type === "DONE") {
      finishScrape();
      $("done").classList.remove("hidden");
      setStatus(I18n.t("openingDashboard"));

      chrome.storage.local.set(
        {
          igData: {
            username: currentUsername,
            followers: msg.followers,
            following: msg.following,
            date: Date.now()
          }
        },
        function () {
          chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
        }
      );
    } else if (msg.type === "ERROR") {
      finishScrape();
      $("actions").classList.remove("hidden");
      setStatus(I18n.t("statusError", { msg: msg.message }));
    }
  }

  function finishScrape() {
    scraping = false;
    $("barFill").style.width = "100%";
    setTimeout(function () { $("barFill").style.width = "0%"; }, 400);
    $("progress").classList.add("hidden");
    if (port) { try { port.disconnect(); } catch (e) {} port = null; }
  }

  async function beginAnalysis() {
    if (scraping || !activeTab) return;

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

    scraping = true;
    $("actions").classList.add("hidden");
    $("progress").classList.remove("hidden");
    $("done").classList.add("hidden");

    port = chrome.tabs.connect(activeTab.id, { name: "ig-port" });
    port.onMessage.addListener(onPortMessage);
    port.postMessage({ type: "SCRAPE_ALL" });
  }

  function cancelScrape() {
    if (port) {
      try { port.postMessage({ type: "STOP" }); } catch (e) {}
      try { port.disconnect(); } catch (e) {}
      port = null;
    }
    scraping = false;
    $("progress").classList.add("hidden");
    $("actions").classList.remove("hidden");
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

  window.onLangChanged = function () {
    I18n.applyToDocument();
    if (activeTab) scan(); else setStatus(I18n.t("statusNotOnIg"));
  };

  I18n.load(function () {
    I18n.applyToDocument();
    I18n.bindLangSelect($("langSelect"));
    start();
  });
})();
