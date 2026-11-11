const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { parseJsonText, parseHtmlText, parseZipBuffer, parseFileBuffer } = require('../file-import.js');
const { compareLists } = require('../comparison.js');

const sampleDir = path.join(__dirname, '..', 'sample');

test('parses Instagram JSON exports with both follower shapes', () => {
  const followers = JSON.parse(fs.readFileSync(path.join(sampleDir, 'followers_1.json'), 'utf8'));
  const following = JSON.parse(fs.readFileSync(path.join(sampleDir, 'following.json'), 'utf8'));

  assert.equal(parseJsonText(followers).length, 1903);
  assert.equal(parseJsonText(following).length, 1352);
});

test('parses Instagram HTML exports without counting unrelated links', () => {
  const followers = fs.readFileSync(path.join(sampleDir, 'followers_1.html'), 'utf8');
  const following = fs.readFileSync(path.join(sampleDir, 'following.html'), 'utf8');

  assert.equal(parseHtmlText(followers).length, 1903);
  assert.equal(parseHtmlText(following).length, 1352);
});

test('auto-detects the requested list inside JSON and HTML ZIP exports', async () => {
  const jsonZip = fs.readFileSync(path.join(sampleDir, 'instagram-0x5879-2026-10-20-vO94pBtf-json.zip'));
  const htmlZip = fs.readFileSync(path.join(sampleDir, 'instagram-0x5879-2026-10-20-yJzZsvdh-html.zip'));

  const jsonEntries = await parseZipBuffer(jsonZip);
  const htmlEntries = await parseZipBuffer(htmlZip);
  assert.ok(jsonEntries.some((entry) => entry.name.endsWith('followers_1.json')));
  assert.ok(htmlEntries.some((entry) => entry.name.endsWith('following.html')));

  assert.equal((await parseFileBuffer(jsonZip, 'export.zip', 'followers')).usernames.length, 1903);
  assert.equal((await parseFileBuffer(htmlZip, 'export.zip', 'following')).usernames.length, 1352);
});

test('a single ZIP input can provide both lists', async () => {
  const zip = fs.readFileSync(path.join(sampleDir, 'instagram-0x5879-2026-10-20-vO94pBtf-json.zip'));
  const followers = await parseFileBuffer(zip, 'export.zip', 'followers');
  const following = await parseFileBuffer(zip, 'export.zip', 'following');

  assert.equal(followers.usernames.length, 1903);
  assert.equal(following.usernames.length, 1352);
});

test('compares lists after normalizing Instagram URLs, @ prefixes, and case', () => {
  const result = compareLists(
    ['Alice', 'https://www.instagram.com/bob/', '@Carla'],
    ['alice', 'bob', 'dora']
  );

  assert.deepEqual(result.mutual, ['Alice', 'bob']);
  assert.deepEqual(result.notback, ['dora']);
  assert.deepEqual(result.fans, ['Carla']);
});

test('produces the expected relationship totals from the sample export', () => {
  const followers = parseJsonText(JSON.parse(fs.readFileSync(path.join(sampleDir, 'followers_1.json'), 'utf8')));
  const following = parseJsonText(JSON.parse(fs.readFileSync(path.join(sampleDir, 'following.json'), 'utf8')));
  const result = compareLists(followers, following);

  assert.equal(result.mutual.length, 853);
  assert.equal(result.notback.length, 499);
  assert.equal(result.fans.length, 1050);
});
