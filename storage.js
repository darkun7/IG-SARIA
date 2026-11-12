(function (root) {
  "use strict";

  var PROFILES_KEY = "igProfiles";
  var ACTIVE_KEY = "igActiveUsername";
  var LEGACY_KEY = "igData";

  function profileKey(username) {
    return String(username || "").trim().toLowerCase();
  }

  function readProfiles(callback) {
    chrome.storage.local.get([PROFILES_KEY, ACTIVE_KEY, LEGACY_KEY, "igScrape"], function (res) {
      var profiles = res[PROFILES_KEY] && typeof res[PROFILES_KEY] === "object"
        ? res[PROFILES_KEY]
        : {};
      var legacy = res[LEGACY_KEY];
      var scrape = res.igScrape;

      if (legacy && legacy.username && !profiles[profileKey(legacy.username)]) {
        profiles[profileKey(legacy.username)] = legacy;
      }

      if (scrape && scrape.username && !scrape.done) {
        var scrapeKey = profileKey(scrape.username);
        if (!profiles[scrapeKey]) {
          var collectedAt = scrape.collectedAt || scrape.startedAt || Date.now();
          profiles[scrapeKey] = {
            username: scrape.username,
            followers: Array.isArray(scrape.followers) ? scrape.followers : [],
            following: Array.isArray(scrape.following) ? scrape.following : [],
            date: collectedAt,
            collectedAt: collectedAt,
            updatedAt: Date.now(),
            incomplete: true,
            done: false,
            error: scrape.error || null,
            expectedF: scrape.expectedF,
            expectedG: scrape.expectedG,
            expectedFApproximate: !!scrape.expectedFApproximate,
            expectedGApproximate: !!scrape.expectedGApproximate
          };
        }
      }

      var active = res[ACTIVE_KEY] || profileKey(legacy && legacy.username);
      if (!active) {
        var keys = Object.keys(profiles);
        keys.sort(function (a, b) {
          return (profiles[b].collectedAt || profiles[b].date || 0) - (profiles[a].collectedAt || profiles[a].date || 0);
        });
        active = keys[0] || null;
      }
      callback({ profiles: profiles, active: active });
    });
  }

  function saveProfile(profile, callback) {
    readProfiles(function (result) {
      var key = profileKey(profile && profile.username);
      if (!key) {
        if (callback) callback();
        return;
      }

      result.profiles[key] = profile;
      chrome.storage.local.set({
        igProfiles: result.profiles,
        igActiveUsername: key,
        igData: profile
      }, callback || function () {});
    });
  }

  function activateProfile(key, callback) {
    readProfiles(function (result) {
      var profile = result.profiles[key];
      if (!profile) {
        if (callback) callback(null, result);
        return;
      }

      chrome.storage.local.set({
        igActiveUsername: key,
        igData: profile
      }, function () {
        if (callback) callback(profile, result);
      });
    });
  }

  root.IGSariaStorage = {
    profileKey: profileKey,
    readProfiles: readProfiles,
    saveProfile: saveProfile,
    activateProfile: activateProfile
  };
})(typeof self !== "undefined" ? self : this);
