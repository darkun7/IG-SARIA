const assert = require('node:assert/strict');
const test = require('node:test');
const { buildProfileSnapshot } = require('../scrape-checkpoint.js');

test('builds a resumable profile snapshot from partial scrape state', () => {
  const snapshot = buildProfileSnapshot({
    username: 'Example_User',
    followers: ['alice', 'alice'],
    following: ['bob'],
    expectedF: 1200,
    expectedG: 300,
    expectedFApproximate: true,
    expectedGApproximate: false,
    startedAt: 1700000000000
  }, 1700000005000, false, 'Network interrupted');

  assert.equal(snapshot.username, 'Example_User');
  assert.deepEqual(snapshot.followers, ['alice']);
  assert.deepEqual(snapshot.following, ['bob']);
  assert.equal(snapshot.collectedAt, 1700000000000);
  assert.equal(snapshot.updatedAt, 1700000005000);
  assert.equal(snapshot.incomplete, true);
  assert.equal(snapshot.done, false);
  assert.equal(snapshot.error, 'Network interrupted');
  assert.equal(snapshot.expectedFApproximate, true);
});

test('marks a completed profile snapshot as complete', () => {
  const snapshot = buildProfileSnapshot({
    username: 'complete_user',
    followers: ['alice'],
    following: ['bob'],
    startedAt: 1700000000000
  }, 1700000005000, true);

  assert.equal(snapshot.incomplete, false);
  assert.equal(snapshot.done, true);
  assert.equal(snapshot.error, null);
});
