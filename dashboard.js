(function () {
  "use strict";

  var data = null;
  var savedProfiles = {};
  var activeProfileKey = null;
  var views = {};
  var activeTab = "mutual";
  var port = null;
  var resuming = false;
  var uploadState = { followers: null, following: null };
  var uploadMode = "zip";
  var theme = "light";

  var TAB_LABEL_KEYS = {
    mutual: "mutual",
    notback: "notFollowingBack",
    fans: "fans",
    allf: "allFollowers",
    allg: "allFollowing"
  };

  var REPORT_CSS = [
    "*{box-sizing:border-box}",
    "body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#262626;background:#fafafa}",
    "header{padding:20px 24px;background:#fff;border-bottom:1px solid #dbdbdb}",
    "h1{margin:0;font-size:22px;background:linear-gradient(45deg,#10b981,#8b5cf6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}",
    ".subtitle{margin:2px 0 0;font-size:12px;color:#8e8e8e}",
    ".summary{display:flex;flex-wrap:wrap;gap:12px;max-width:1000px;margin:0 auto;padding:20px 24px 8px}",
    ".stat{flex:1;min-width:130px;text-align:center;padding:14px 8px;background:#fff;border:1px solid #dbdbdb;border-radius:10px}",
    ".stat b{display:block;font-size:24px}",
    ".stat span{font-size:12px;color:#8e8e8e}",
    ".stat.good b{color:#2e7d32}",
    ".stat.bad b{color:#c62828}",
    ".stat.warn b{color:#e65100}",
    ".content{max-width:1000px;margin:0 auto;padding:12px 24px 40px}",
    "section{margin-top:24px}",
    "h2{font-size:16px;margin:0 0 10px}",
    ".count{font-size:12px;color:#8e8e8e;font-weight:400}",
    ".accounts{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}",
    ".accounts li{background:#fff;border:1px solid #dbdbdb;border-radius:8px;overflow:hidden}",
    ".accounts a{display:block;padding:10px 12px;text-decoration:none;color:#262626;font-weight:600}",
    ".accounts a:hover{background:#f8f9fa;color:#7c3aed}",
    ".empty{color:#8e8e8e}",
    "footer{text-align:center;padding:16px;color:#8e8e8e;font-size:12px}"
  ].join("\n");

  var $ = function (id) { return document.getElementById(id); };

  function fmt(n) {
    return n >= 1000 ? n.toLocaleString() : String(n);
  }

  function populateSavedProfiles() {
    var select = $("savedProfileSelect");
    if (!select) return;
    select.innerHTML = "";

    var keys = Object.keys(savedProfiles).sort(function (a, b) {
      var aDate = savedProfiles[a].collectedAt || savedProfiles[a].date || 0;
      var bDate = savedProfiles[b].collectedAt || savedProfiles[b].date || 0;
      return bDate - aDate;
    });

    if (!keys.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = I18n.t("noSavedProfiles");
      select.appendChild(empty);
      return;
    }

    keys.forEach(function (key) {
      var profile = savedProfiles[key];
      var option = document.createElement("option");
      var collectedAt = profile.collectedAt || profile.date;
      option.value = key;
      option.textContent = "@" + (profile.username || key) + (collectedAt ? " · " + new Date(collectedAt).toLocaleDateString() : "");
      option.selected = key === activeProfileKey;
      select.appendChild(option);
    });
  }

  function selectSavedProfile(key) {
    if (!key) return;
    IGSariaStorage.activateProfile(key, function (profile, result) {
      if (!profile) return;
      savedProfiles = result.profiles;
      activeProfileKey = key;
      data = profile;
      resuming = false;
      buildViews();
      populateSavedProfiles();
      render();
    });
  }

  function applyTheme(nextTheme) {
    theme = nextTheme === "dark" ? "dark" : "light";
    document.body.classList.toggle("dark", theme === "dark");
    var button = $("themeToggle");
    if (button) {
      button.textContent = I18n.t(theme === "dark" ? "themeLight" : "themeDark");
      button.setAttribute("title", I18n.t("themeToggle"));
    }
  }

  function toggleTheme() {
    var nextTheme = theme === "dark" ? "light" : "dark";
    chrome.storage.local.set({ igTheme: nextTheme }, function () {
      applyTheme(nextTheme);
    });
  }

  function buildViews() {
    var followers = data.followers || [];
    var following = data.following || [];
    views = IGSariaComparison.compareLists(followers, following);
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

    if (needsMoreData()) {
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

  function needsMoreData() {
    if (!data) return false;
    var followersNeedMore = data.expectedF != null && (data.followers || []).length < data.expectedF;
    var followingNeedMore = data.expectedG != null && (data.following || []).length < data.expectedG;
    return !!(data.incomplete || followersNeedMore || followingNeedMore);
  }

  function render() {
    renderSummary();
    renderCounts();
    renderHeader();
    renderList();
    updateExportLabel();
  }

  function renderNoData() {
    ["stFollowers", "stFollowing", "stMutual", "stNotBack", "stFans",
      "countMutual", "countNotBack", "countFans", "countAllF", "countAllG"].forEach(function (id) {
      $(id).textContent = "0";
    });
    $("noteIncomplete").classList.add("hidden");
    $("empty").classList.remove("hidden");
    $("empty").textContent = I18n.t("noData");
    $("list").innerHTML = "";
  }

  function setUploadStatus(role, text, kind) {
    var ids = {
      followers: "followersFileStatus",
      following: "followingFileStatus",
      zip: "zipFileStatus"
    };
    var el = $(ids[role]);
    el.textContent = text;
    el.className = "upload-status" + (kind ? " " + kind : "");
  }

  function setUploadMessage(text, kind) {
    var el = $("uploadStatus");
    el.textContent = text || "";
    el.className = "upload-message" + (kind ? " " + kind : "");
  }

  function applyImportedLists() {
    data = {
      username: "export",
      followers: uploadState.followers,
      following: uploadState.following,
      date: Date.now()
    };
    buildViews();
    render();
    setUploadMessage(I18n.t("uploadReady"), "ready");
  }

  function resetUploads() {
    uploadState = { followers: null, following: null };
    ["followersFile", "followingFile", "zipFile"].forEach(function (id) {
      $(id).value = "";
    });
    ["followers", "following", "zip"].forEach(function (role) {
      setUploadStatus(role, I18n.t("noFileChosen"));
    });
    data = null;
    views = {};
    renderNoData();
    setUploadMessage("");
  }

  function syncUploadMode(mode) {
    uploadMode = mode;
    $("pairUploadGrid").classList.toggle("hidden", mode === "zip");
    $("zipUploadCard").classList.toggle("hidden", mode !== "zip");
    $("followersFile").accept = mode === "html" ? ".html,.htm,text/html" : ".json,application/json";
    $("followingFile").accept = mode === "html" ? ".html,.htm,text/html" : ".json,application/json";
    resetUploads();
  }

  async function handleUpload(role, input) {
    var file = input.files && input.files[0];
    if (!file) {
      uploadState[role] = null;
      setUploadStatus(role, I18n.t("noFileChosen"));
      if (!uploadState.followers || !uploadState.following) {
        data = null;
        views = {};
        renderNoData();
        setUploadMessage(I18n.t("uploadBothFiles"));
      }
      return;
    }

    setUploadStatus(role, I18n.t("readingFile"), "");
    setUploadMessage("");
    try {
      var result = await IGSariaImport.parseFile(file, role);
      uploadState[role] = result.usernames;
      setUploadStatus(role, file.name + " (" + result.usernames.length.toLocaleString() + ")", "ready");

      if (!uploadState.followers || !uploadState.following) {
        data = null;
        views = {};
        renderNoData();
        setUploadMessage(I18n.t("uploadBothFiles"));
        return;
      }

      applyImportedLists();
    } catch (error) {
      uploadState[role] = null;
      setUploadStatus(role, error && error.message ? error.message : I18n.t("uploadError"), "error");
      setUploadMessage(I18n.t("uploadError"), "error");
    }
  }

  async function handleZipUpload(input) {
    var file = input.files && input.files[0];
    if (!file) {
      uploadState = { followers: null, following: null };
      setUploadStatus("zip", I18n.t("noFileChosen"));
      data = null;
      views = {};
      renderNoData();
      return;
    }

    setUploadStatus("zip", I18n.t("readingFile"), "");
    setUploadMessage("");
    try {
      var buffer = await file.arrayBuffer();
      var results = await Promise.all([
        IGSariaImport.parseFileBuffer(buffer, file.name, "followers"),
        IGSariaImport.parseFileBuffer(buffer, file.name, "following")
      ]);
      uploadState.followers = results[0].usernames;
      uploadState.following = results[1].usernames;
      setUploadStatus("zip", file.name + " (" +
        uploadState.followers.length.toLocaleString() + " / " +
        uploadState.following.length.toLocaleString() + ")", "ready");
      applyImportedLists();
    } catch (error) {
      uploadState = { followers: null, following: null };
      setUploadStatus("zip", error && error.message ? error.message : I18n.t("uploadError"), "error");
      setUploadMessage(I18n.t("uploadError"), "error");
    }
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function accountListHtml(items) {
    if (!items.length) {
      return '<p class="empty">' + escapeHtml(I18n.t("noAccounts")) + "</p>";
    }
    var out = '<ul class="accounts">';
    items.forEach(function (u) {
      out += '<li><a href="https://www.instagram.com/' + encodeURIComponent(u) +
        '/" target="_blank" rel="noopener">@' + escapeHtml(u) + "</a></li>";
    });
    return out + "</ul>";
  }

  function sectionHtml(title, items) {
    return "<section><h2>" + escapeHtml(title) +
      ' <span class="count">' + items.length + "</span></h2>" +
      accountListHtml(items) + "</section>";
  }

  function buildHtmlReport() {
    var f = data.followers || [];
    var g = data.following || [];

    var subtitle = I18n.t("analyzedOn", {
      user: data.username || "?",
      date: new Date(data.date).toLocaleString()
    });
    var footnote = I18n.t("footnote", {
      f: f.length,
      g: g.length,
      date: new Date(data.date).toDateString()
    });

    var stats = [
      { cls: "", value: f.length, label: I18n.t("followers") },
      { cls: "", value: g.length, label: I18n.t("following") },
      { cls: "good", value: views.mutual.length, label: I18n.t("mutual") },
      { cls: "bad", value: views.notback.length, label: I18n.t("notFollowingBack") },
      { cls: "warn", value: views.fans.length, label: I18n.t("fans") }
    ];
    var statsHtml = "";
    stats.forEach(function (s) {
      statsHtml += '<div class="stat ' + s.cls + '"><b>' + s.value +
        "</b><span>" + escapeHtml(s.label) + "</span></div>";
    });

    var sectionsHtml =
      sectionHtml(I18n.t("mutual"), views.mutual) +
      sectionHtml(I18n.t("notFollowingBack"), views.notback) +
      sectionHtml(I18n.t("fans"), views.fans) +
      sectionHtml(I18n.t("allFollowers"), views.allf) +
      sectionHtml(I18n.t("allFollowing"), views.allg);

    return "<!DOCTYPE html>\n" +
      '<html lang="' + I18n.lang + '">\n<head>\n<meta charset="utf-8" />\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
      "<title>" + escapeHtml(I18n.t("title")) + " - @" + escapeHtml(data.username || "?") + "</title>\n" +
      "<style>\n" + REPORT_CSS + "\n</style>\n</head>\n<body>\n" +
      "<header><h1>" + escapeHtml(I18n.t("title")) + "</h1>" +
      '<p class="subtitle">' + escapeHtml(subtitle) + "</p></header>\n" +
      '<section class="summary">' + statsHtml + "</section>\n" +
      '<main class="content">' + sectionsHtml + "</main>\n" +
      "<footer><p>" + escapeHtml(footnote) + "</p></footer>\n" +
      "</body>\n</html>\n";
  }

  function exportHtml() {
    var blob = new Blob([buildHtmlReport()], { type: "text/html;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (data.username || "ig") + "-report.html";
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
        IGSariaStorage.readProfiles(function (result) {
          savedProfiles = result.profiles;
          activeProfileKey = result.active;
          data = savedProfiles[activeProfileKey] || null;
          populateSavedProfiles();
          if (data) {
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

  function readCurrentInstagramProfile(callback) {
    if (!data || !data.username || !chrome.tabs || !chrome.tabs.query) {
      callback(null);
      return;
    }

    chrome.tabs.query({ url: ["https://www.instagram.com/*"] }, function (tabs) {
      var wanted = IGSariaStorage.profileKey(data.username);
      var candidate = null;
      for (var i = 0; i < tabs.length; i++) {
        var match = String(tabs[i].url || "").match(/instagram\.com\/([A-Za-z0-9._]+)/i);
        if (match && IGSariaStorage.profileKey(match[1]) === wanted) {
          candidate = tabs[i];
          break;
        }
      }
      if (!candidate) {
        callback(null);
        return;
      }

      chrome.tabs.sendMessage(candidate.id, { type: "SCAN" }, function (response) {
        if (chrome.runtime.lastError || !response || !response.ok) {
          callback(null);
          return;
        }
        callback(response.profile || null);
      });
    });
  }

  function updateResumeTargets(profile, callback) {
    if (!profile || IGSariaStorage.profileKey(profile.username) !== activeProfileKey) {
      callback({});
      return;
    }

    var targets = {
      username: profile.username,
      expectedF: profile.followersApproximate ? profile.followersTarget : profile.followers,
      expectedG: profile.followingApproximate ? profile.followingTarget : profile.following,
      expectedFApproximate: !!profile.followersApproximate,
      expectedGApproximate: !!profile.followingApproximate
    };
    data.expectedF = targets.expectedF;
    data.expectedG = targets.expectedG;
    data.expectedFApproximate = targets.expectedFApproximate;
    data.expectedGApproximate = targets.expectedGApproximate;
    savedProfiles[activeProfileKey] = data;
    IGSariaStorage.saveProfile(data, function () { callback(targets); });
  }

  function startResume() {
    resuming = true;
    $("continueBtn").disabled = true;
    $("collectingBar").classList.remove("hidden");
    $("collectingFill").style.width = "0%";
    $("collectingText").textContent = I18n.t("resuming");
    var resume = function (targets) {
      connectPort();
      var message = { type: "RESUME" };
      for (var key in targets) message[key] = targets[key];
      chrome.runtime.sendMessage(message);
    };
    if (activeProfileKey) {
      IGSariaStorage.activateProfile(activeProfileKey, function () {
        readCurrentInstagramProfile(function (profile) {
          updateResumeTargets(profile, resume);
        });
      });
    } else {
      resume({});
    }
  }

  function init() {
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        activateTab(this.getAttribute("data-tab"));
      });
    }

    $("searchInput").addEventListener("input", renderList);
    $("savedProfileSelect").addEventListener("change", function () {
      selectSavedProfile(this.value);
    });
    $("followersFile").addEventListener("change", function () { handleUpload("followers", this); });
    $("followingFile").addEventListener("change", function () { handleUpload("following", this); });
    $("zipFile").addEventListener("change", function () { handleZipUpload(this); });
    var formatInputs = document.querySelectorAll("input[name='uploadFormat']");
    for (var f = 0; f < formatInputs.length; f++) {
      formatInputs[f].addEventListener("change", function () { syncUploadMode(this.value); });
    }
    syncUploadMode(uploadMode);
    $("exportBtn").addEventListener("click", exportCsv);
    $("exportHtmlBtn").addEventListener("click", exportHtml);
    $("continueBtn").addEventListener("click", startResume);
    $("refreshBtn").addEventListener("click", function () {
      if (needsMoreData()) {
        if (!resuming) startResume();
        return;
      }
      chrome.tabs.create({
        url: "https://www.instagram.com/" + ((data && data.username) || "") + "/"
      });
    });

    connectPort();

    window.onLangChanged = function () {
      I18n.applyToDocument();
      applyTheme(theme);
      updateExportLabel();
      if (data) render(); else renderNoData();
    };

    I18n.load(function () {
      I18n.applyToDocument();
      I18n.bindLangButtons($("langIdBtn"), $("langEnBtn"));
      $("themeToggle").addEventListener("click", toggleTheme);

      chrome.storage.local.get("igTheme", function (res) {
        applyTheme(res.igTheme || "light");
        IGSariaStorage.readProfiles(function (result) {
          savedProfiles = result.profiles;
          activeProfileKey = result.active;
          data = savedProfiles[activeProfileKey] || null;
          populateSavedProfiles();
          if (!data) { renderNoData(); updateExportLabel(); return; }
          buildViews();
          render();
        });
      });
    });
  }

  init();
})();
