(function () {
  "use strict";

  var TRANSLATIONS = {
    en: {
      title: "IG-SARIA",
      tagline: "Instagram follower analysis tool",
      placeholder: "Enter username or URL",
      go: "Go",
      followers: "Followers",
      following: "Following",
      loggedIn: "Logged in",
      notLoggedIn: "Not logged in",
      loginHint: "Log in to Instagram in this browser first for complete results.",
      warningTitle: "Not recommended",
      warningText:
        "This account has more than 10,000 total followers and following. Using this tool on large accounts is not recommended - scraping can take a very long time and may get your account flagged.",
      exportHintTitle: "Large account",
      exportHintText:
        "This account has more than 5,000 total followers and following. For faster and safer results, use the IG-SARIA export tool website instead.",
      exportHintLink: "Open export tool (ig-saria.vercel.app)",
      analyze: "Analyze Followers & Following",
      cancel: "Cancel",
      getting: "Getting {stage}... {count} found",
      analyzingDone: "Analysis complete. Opening dashboard...",
      scanning: "Scanning profile...",
      opening: "Opening @{user}...",
      openingDashboard: "Opening dashboard...",
      statusNotOnIg: "Enter a username above to open an Instagram profile.",
      statusCannotRead: "Could not read this page. Make sure you are on an Instagram profile.",
      statusNotReady: "Page not ready yet. Press Go to reload.",
      statusError: "Error: {msg}",
      statusOpenFirst: "Open an Instagram profile first, or type a username and press Go.",
      statusNotRecommended: "Not recommended: account has more than 10,000 total followers and following.",
      statusCancelled: "Cancelled.",
      statusEnterValid: "Enter a valid Instagram username.",
      statusCannotReadAuto: "Could not read the profile automatically. Press Go again.",
      reAnalyze: "Re-analyze",
      exportCsv: "Export CSV",
      mutual: "Mutual",
      notFollowingBack: "Not following back",
      fans: "Fans (not followed)",
      allFollowers: "All followers",
      allFollowing: "All following",
      filterPlaceholder: "Filter list...",
      noAccounts: "No accounts in this view.",
      noData: "No data found. Open the popup on an Instagram profile and click Analyze.",
      analyzedOn: "@{user} - analyzed {date}",
      footnote: "Scraped {f} followers and {g} following on {date}"
    },
    id: {
      title: "IG-SARIA",
      tagline: "Alat analisis pengikut Instagram",
      placeholder: "Masukkan username atau URL",
      go: "Buka",
      followers: "Pengikut",
      following: "Mengikuti",
      loggedIn: "Sudah masuk",
      notLoggedIn: "Belum masuk",
      loginHint: "Masuk ke Instagram di browser ini terlebih dahulu untuk hasil yang lengkap.",
      warningTitle: "Tidak disarankan",
      warningText:
        "Akun ini memiliki total pengikut dan mengikuti lebih dari 10.000. Menggunakan alat ini pada akun besar tidak disarankan - pengambilan data bisa memakan waktu sangat lama dan dapat menyebabkan akun Anda ditandai.",
      exportHintTitle: "Akun besar",
      exportHintText:
        "Akun ini memiliki total pengikut dan mengikuti lebih dari 5.000. Untuk hasil yang lebih cepat dan aman, gunakan website alat ekspor IG-SARIA sebagai gantinya.",
      exportHintLink: "Buka alat ekspor (ig-saria.vercel.app)",
      analyze: "Analisis Pengikut & Mengikuti",
      cancel: "Batal",
      getting: "Mengambil {stage}... {count} ditemukan",
      analyzingDone: "Analisis selesai. Membuka dashboard...",
      scanning: "Memindai profil...",
      opening: "Membuka @{user}...",
      openingDashboard: "Membuka dashboard...",
      statusNotOnIg: "Masukkan username di atas untuk membuka profil Instagram.",
      statusCannotRead: "Tidak dapat membaca halaman ini. Pastikan Anda berada di profil Instagram.",
      statusNotReady: "Halaman belum siap. Tekan Buka untuk memuat ulang.",
      statusError: "Kesalahan: {msg}",
      statusOpenFirst: "Buka profil Instagram terlebih dahulu, atau ketik username lalu tekan Buka.",
      statusNotRecommended: "Tidak disarankan: akun memiliki total pengikut dan mengikuti lebih dari 10.000.",
      statusCancelled: "Dibatalkan.",
      statusEnterValid: "Masukkan username Instagram yang valid.",
      statusCannotReadAuto: "Tidak dapat membaca profil secara otomatis. Tekan Buka lagi.",
      reAnalyze: "Analisis Ulang",
      exportCsv: "Ekspor CSV",
      mutual: "Saling Mengikuti",
      notFollowingBack: "Tidak Follow Balik",
      fans: "Penggemar",
      allFollowers: "Semua Pengikut",
      allFollowing: "Semua Mengikuti",
      filterPlaceholder: "Filter daftar...",
      noAccounts: "Tidak ada akun di tampilan ini.",
      noData: "Tidak ada data. Buka popup di profil Instagram lalu klik Analisis.",
      analyzedOn: "@{user} - dianalisis {date}",
      footnote: "Mengambil {f} pengikut dan {g} mengikuti pada {date}"
    }
  };

  var LANG_KEY = "igLang";
  var currentLang = "en";

  function t(key, params) {
    var dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    var str = dict[key] != null ? dict[key] : (TRANSLATIONS.en[key] != null ? TRANSLATIONS.en[key] : key);
    if (params) {
      for (var k in params) {
        str = str.split("{" + k + "}").join(params[k]);
      }
    }
    return str;
  }

  function applyToDocument() {
    var els = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = t(els[i].getAttribute("data-i18n"));
    }
    var phs = document.querySelectorAll("[data-i18n-placeholder]");
    for (var j = 0; j < phs.length; j++) {
      phs[j].setAttribute("placeholder", t(phs[j].getAttribute("data-i18n-placeholder")));
    }
    var titles = document.querySelectorAll("[data-i18n-title]");
    for (var k = 0; k < titles.length; k++) {
      titles[k].setAttribute("title", t(titles[k].getAttribute("data-i18n-title")));
    }
    var bodies = document.querySelectorAll("title");
    if (bodies.length) bodies[0].textContent = t("title");
  }

  function bindLangSelect(selectEl) {
    var labels = { en: "English", id: "Indonesia" };
    var langs = ["en", "id"];
    selectEl.innerHTML = "";
    for (var i = 0; i < langs.length; i++) {
      var opt = document.createElement("option");
      opt.value = langs[i];
      opt.textContent = labels[langs[i]];
      if (langs[i] === currentLang) opt.selected = true;
      selectEl.appendChild(opt);
    }
    selectEl.onchange = function () {
      var obj = {};
      obj[LANG_KEY] = selectEl.value;
      chrome.storage.local.set(obj, function () {
        currentLang = selectEl.value;
        applyToDocument();
        if (window.onLangChanged) window.onLangChanged();
      });
    };
  }

  function load(cb) {
    chrome.storage.local.get(LANG_KEY, function (res) {
      var v = res[LANG_KEY];
      currentLang = TRANSLATIONS[v] ? v : "en";
      if (cb) cb(currentLang);
    });
  }

  window.I18n = {
    t: t,
    applyToDocument: applyToDocument,
    bindLangSelect: bindLangSelect,
    load: load,
    get lang() { return currentLang; }
  };
})();
