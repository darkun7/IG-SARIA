(function () {
  "use strict";

  var data = null;
  var views = {};
  var activeTab = "mutual";

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
  }

  function render() {
    renderSummary();
    renderCounts();
    renderHeader();
    renderList();
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

  function init() {
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        activateTab(this.getAttribute("data-tab"));
      });
    }

    $("searchInput").addEventListener("input", renderList);
    $("exportBtn").addEventListener("click", exportCsv);
    $("refreshBtn").addEventListener("click", function () {
      chrome.tabs.create({
        url: "https://www.instagram.com/" + ((data && data.username) || "") + "/"
      });
    });

    window.onLangChanged = function () {
      I18n.applyToDocument();
      if (data) render(); else renderNoData();
    };

    I18n.load(function () {
      I18n.applyToDocument();
      I18n.bindLangSelect($("langSelect"));

      chrome.storage.local.get("igData", function (res) {
        data = res.igData || null;
        if (!data) { renderNoData(); return; }
        buildViews();
        render();
      });
    });
  }

  init();
})();
