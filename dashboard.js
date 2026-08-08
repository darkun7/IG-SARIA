(function () {
  "use strict";

  var data = null;
  var views = {};
  var activeTab = "mutual";
  var port = null;
  var resuming = false;

  var TAB_LABEL_KEYS = {
    mutual: "mutual",
    notback: "notFollowingBack",
    fans: "fans",
    allf: "allFollowers",
    allg: "allFollowing"
  };

  var $ = function (id) { return document.getElementById(id); };

  function fmt(n) {
    return n >= 1000 ? n.toLocaleString() : String(n);
  }

  function buildViews() {
    var followers = data.followers || [];
    var following = data.following || [];
    var fSet = new Set(followers);
    var gSet = new Set(following);

    var mutual = [];
    var fans = [];
    followers.forEach(function (u) {
      if (gSet.has(u)) mutual.push(u); else fans.push(u);
    });

    var notBack = [];
    following.forEach(function (u) {
      if (!fSet.has(u)) notBack.push(u);
    });

    views = {
      mutual: mutual.sort(function (a, b) { return a.localeCompare(b); }),
      notback: notBack.sort(function (a, b) { return a.localeCompare(b); }),
      fans: fans.sort(function (a, b) { return a.localeCompare(b); }),
      allf: followers.slice().sort(function (a, b) { return a.localeCompare(b); }),
      allg: following.slice().sort(function (a, b) { return a.localeCompare(b); })
    };
  }

  function renderSummary() {
    var f = data.followers || [];
    var g = data.following || [];
    $("stFollowers").textContent = fmt(f.length);
    $("stFollowing").textContent = fmt(g.length);
    $("stMutual").textContent = fmt(views.mutual.length);
    $("stNotBack").textContent = fmt(views.notback.length);
    $("stFans").textContent = fmt(views.fans.length);
  }

  function renderCounts() {
    $("countMutual").textContent = fmt(views.mutual.length);
    $("countNotBack").textContent = fmt(views.notback.length);
    $("countFans").textContent = fmt(views.fans.length);
    $("countAllF").textContent = fmt(views.allf.length);
    $("countAllG").textContent = fmt(views.allg.length);
  }

  function renderList() {
    var list = $("list");
    list.innerHTML = "";

    var q = $("searchInput").value.trim().toLowerCase();
    var items = (views[activeTab] || []).filter(function (u) {
      return !q || u.toLowerCase().indexOf(q) !== -1;
    });

    $("empty").classList.toggle("hidden", items.length > 0);
    $("empty").textContent = I18n.t("noAccounts");

    var frag = document.createDocumentFragment();
    items.forEach(function (u) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "https://www.instagram.com/" + encodeURIComponent(u) + "/";
      a.target = "_blank";
      a.rel = "noopener";
      a.title = "@" + u;
      a.textContent = "@" + u;
      li.appendChild(a);
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

  function renderHeader() {
    $("subtitle").textContent = I18n.t("analyzedOn", {
      user: data.username || "?",
      date: new Date(data.date).toLocaleString()
    });
    $("footnote").textContent = I18n.t("footnote", {
      f: (data.followers || []).length,
      g: (data.following || []).length,
      date: new Date(data.date).toDateString()
    });

    if (data.incomplete) {
      var expected = Math.max(data.expectedF || 0, data.expectedG || 0);
      var got = Math.max((data.followers || []).length, (data.following || []).length);
      $("noteIncomplete").textContent = I18n.t("noteIncomplete", {
        fetched: got,
        expected: expected
      });
      $("noteIncomplete").classList.remove("hidden");
      $("continueBtn").classList.remove("hidden");
    } else {
      $("noteIncomplete").classList.add("hidden");
      $("continueBtn").classList.add("hidden");
    }
  }

  function render() {
    renderSummary();
    renderCounts();
    renderHeader();
    renderList();
    updateExportLabel();
  }

  function renderNoData() {
    $("empty").classList.remove("hidden");
    $("empty").textContent = I18n.t("noData");
    $("list").innerHTML = "";
  }

  function activateTab(name) {
    activeTab = name;
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === name);
    }
    renderList();
    updateExportLabel();
  }

  function updateExportLabel() {
    var key = TAB_LABEL_KEYS[activeTab] || "allFollowers";
    $("exportBtn").textContent = I18n.t("exportCsv") + " (" + I18n.t(key) + ")";
  }

  function exportCsv() {
    var rows = [["instagram_username", "relationship"]];
    var labels = {
      mutual: "mutual",
      notback: "not_following_back",
      fans: "follower_not_followed",
      allf: "follower",
      allg: "following"
    };
    var items = views[activeTab] || [];
    items.forEach(function (u) {
      rows.push([u, labels[activeTab] || "unknown"]);
    });
    var csv = rows.map(function (r) { return r.join(","); }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (data.username || "ig") + "-" + activeTab + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function connectPort() {
    try { if (port) port.disconnect(); } catch (e) {}
    port = chrome.runtime.connect({ name: "ig-status" });
    port.onMessage.addListener(onPortMessage);
    port.onDisconnect.addListener(function () { port = null; });
  }

  function onPortMessage(msg) {
    if (!msg) return;
    if (msg.type === "PROGRESS") {
      if (resuming) updateCollectingProgress(msg.stage, msg.count);
    } else if (msg.type === "STATUS") {
      if (msg.text === "resuming") {
        $("collectingText").textContent = I18n.t("resuming");
      } else if (msg.text === "retryingStage") {
        $("collectingText").textContent = I18n.t("retryingStage");
      } else if (msg.text === "rateLimited") {
        $("collectingText").textContent = I18n.t("rateLimited");
      }
    } else if (msg.type === "DONE") {
      if (resuming) {
        resuming = false;
        $("collectingBar").classList.add("hidden");
        $("continueBtn").classList.remove("hidden");
        $("continueBtn").disabled = false;
        chrome.storage.local.get("igData", function (res) {
          if (res.igData) {
            data = res.igData;
            buildViews();
            render();
            if (data.incomplete) {
              $("collectingText").textContent = I18n.t("stillIncomplete");
              $("collectingBar").classList.remove("hidden");
            }
          }
        });
      }
    }
  }

  function updateCollectingProgress(stage, count) {
    var expected = stage === "following" ? data.expectedG : data.expectedF;
    var stageLabel = I18n.t(stage === "following" ? "following" : "followers");
    if (expected != null && expected > 0) {
      $("collectingText").textContent = I18n.t("collectingProgress", {
        stage: stageLabel,
        count: count,
        expected: expected
      });
      var pct = Math.min(100, Math.round((count / expected) * 100));
      $("collectingFill").style.width = pct + "%";
    } else {
      $("collectingText").textContent = I18n.t("getting", {
        stage: stageLabel,
        count: count
      });
    }
  }

  function startResume() {
    resuming = true;
    $("continueBtn").disabled = true;
    $("collectingBar").classList.remove("hidden");
    $("collectingFill").style.width = "0%";
    $("collectingText").textContent = I18n.t("resuming");
    connectPort();
    chrome.runtime.sendMessage({ type: "RESUME" });
  }

  function init() {
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        activateTab(this.getAttribute("data-tab"));
      });
    }

    $("searchInput").addEventListener("input", renderList);
    $("exportBtn").addEventListener("click", exportCsv);
    $("continueBtn").addEventListener("click", startResume);
    $("refreshBtn").addEventListener("click", function () {
      chrome.tabs.create({
        url: "https://www.instagram.com/" + ((data && data.username) || "") + "/"
      });
    });

    connectPort();

    window.onLangChanged = function () {
      I18n.applyToDocument();
      updateExportLabel();
      if (data) render(); else renderNoData();
    };

    I18n.load(function () {
      I18n.applyToDocument();
      I18n.bindLangSelect($("langSelect"));

      chrome.storage.local.get("igData", function (res) {
        data = res.igData || null;
        if (!data) { renderNoData(); updateExportLabel(); return; }
        buildViews();
        render();
      });
    });
  }

  init();
})();
