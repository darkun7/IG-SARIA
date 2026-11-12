(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.IGSariaCheckpoint = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function unique(values) {
    return Array.from(new Set(Array.isArray(values) ? values : []));
  }

  function buildProfileSnapshot(state, now, complete, error) {
    var collectedAt = state.collectedAt || state.startedAt || now;
    return {
      username: state.username,
      followers: unique(state.followers),
      following: unique(state.following),
      date: collectedAt,
      collectedAt: collectedAt,
      updatedAt: now,
      incomplete: complete ? !!state.incomplete : true,
      done: !!complete,
      error: error || null,
      expectedF: state.expectedF,
      expectedG: state.expectedG,
      expectedFApproximate: !!state.expectedFApproximate,
      expectedGApproximate: !!state.expectedGApproximate
    };
  }

  return {
    buildProfileSnapshot: buildProfileSnapshot
  };
});
