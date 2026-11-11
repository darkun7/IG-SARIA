(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.IGSariaComparison = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalizeUsername(value) {
    if (value == null) return "";
    var text = String(value).trim();
    if (!text) return "";
    var match = text.match(/instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)/i);
    if (match) text = match[1];
    text = text.replace(/^@+/, "").replace(/\/$/, "");
    return text.toLowerCase();
  }

  function displayUsername(value) {
    if (value == null) return "";
    var text = String(value).trim();
    var match = text.match(/instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)/i);
    if (match) text = match[1];
    return text.replace(/^@+/, "").replace(/\/$/, "");
  }

  function uniqueDisplayMap(values) {
    var map = new Map();
    (values || []).forEach(function (value) {
      var display = displayUsername(value);
      var key = normalizeUsername(display);
      if (key && !map.has(key)) map.set(key, display);
    });
    return map;
  }

  function sort(values) {
    return values.sort(function (a, b) { return a.localeCompare(b); });
  }

  function compareLists(followers, following) {
    var followerMap = uniqueDisplayMap(followers);
    var followingMap = uniqueDisplayMap(following);
    var mutual = [];
    var fans = [];
    var notback = [];

    followerMap.forEach(function (display, key) {
      if (followingMap.has(key)) mutual.push(display);
      else fans.push(display);
    });
    followingMap.forEach(function (display, key) {
      if (!followerMap.has(key)) notback.push(display);
    });

    return {
      mutual: sort(mutual),
      notback: sort(notback),
      fans: sort(fans),
      allf: sort(Array.from(followerMap.values())),
      allg: sort(Array.from(followingMap.values()))
    };
  }

  return { normalizeUsername: normalizeUsername, compareLists: compareLists };
});
