// The feed script version (fixes): stamped from Feed.gs's own content, returned as meta.scriptVersion,
// part of the cache keys, logged by the self-test, and compared by the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFeedGs, FEED_GS_SOURCE } from './helpers/feed-gs.mjs';
import { feedScriptVersion, stampStatus } from '../../scripts/stamp-feed.mjs';
import { FEED_SCRIPT_VERSION } from '../../src/feed-version.js';
import { scriptVersionStatus, validateFeed } from '../../src/data/feed.js';

const NOW = new Date('2026-11-15T16:00:00Z');

test('stamp: Feed.gs, src/feed-version.js and the fixture hold the version of Feed.gs as it is (run npm run feed:stamp)', () => {
  const s = stampStatus();
  assert.match(s.version, /^[0-9a-f]{12}$/);
  assert.equal(s.feedGs, s.version, 'apps-script/Feed.gs BT_FEED_SCRIPT_VERSION is stale: run npm run feed:stamp');
  assert.equal(s.app, s.version, 'src/feed-version.js is stale: run npm run feed:stamp');
  assert.equal(s.fixture, s.version, 'tests/fixtures/feed.json meta.scriptVersion is stale: run npm run feed:stamp');
  assert.equal(FEED_SCRIPT_VERSION, s.version);
});

test('stamp: the version changes with any other change to the file, never with the value itself', () => {
  const v = feedScriptVersion(FEED_GS_SOURCE);
  const restamped = FEED_GS_SOURCE.replace(/(var BT_FEED_SCRIPT_VERSION = ')[0-9a-f]*(';)/, (_, head, tail) => `${head}${'0'.repeat(12)}${tail}`);
  assert.equal(feedScriptVersion(restamped), v, 'the value is blanked before hashing');
  assert.equal(feedScriptVersion(FEED_GS_SOURCE.replace(/\n/g, '\r\n')), v, 'line endings do not matter');
  assert.notEqual(feedScriptVersion(FEED_GS_SOURCE.replace('var BT_FEED_CACHE_TTL = 300;', 'var BT_FEED_CACHE_TTL = 301;')), v);
  assert.notEqual(feedScriptVersion(`${FEED_GS_SOURCE}\n// a comment\n`), v, 'comments count too');
  assert.throws(() => feedScriptVersion('var x = 1;'), /no BT_FEED_SCRIPT_VERSION/);
});

test('Feed.gs: meta.scriptVersion is the stamped constant; the name keeps the btFeed / BT_FEED_ prefix', () => {
  const gs = loadFeedGs();
  assert.equal(gs.BT_FEED_SCRIPT_VERSION, FEED_SCRIPT_VERSION);
  const feed = gs.btFeedBuild({}, 'America/Bogota', NOW);
  assert.equal(feed.meta.scriptVersion, FEED_SCRIPT_VERSION);
  assert.match(FEED_GS_SOURCE, /^var BT_FEED_SCRIPT_VERSION = '[0-9a-f]{12}';$/m);
});

test('Feed.gs: the cache keys carry the schema and the script version', () => {
  const gs = loadFeedGs();
  assert.equal(gs.BT_FEED_CACHE_PREFIX, `btFeed:s1:v${FEED_SCRIPT_VERSION}:`);
  assert.ok(gs.btFeedCacheIndexKey().includes(`:v${FEED_SCRIPT_VERSION}:`));
  // A copy cached by another version is a miss for this one: same cache, other prefix.
  const store = new Map();
  const cache = {
    get: (k) => store.get(k) ?? null,
    getAll: (keys) => Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
    put: (k, v) => store.set(k, v),
    putAll: (values) => { for (const [k, v] of Object.entries(values)) store.set(k, v); },
  };
  const other = loadFeedGs();
  other.BT_FEED_CACHE_PREFIX = 'btFeed:s1:vaaaaaaaaaaaa:';
  let builds = 0;
  const build = () => { builds++; return { schema: 1, generatedAt: 'x', meta: { rows: {}, redactions: 0, missingHeaders: [], scriptVersion: 'old' }, tabs: {} }; };
  other.btFeedServe({ cache, lock: null, build });
  assert.equal(builds, 1);
  const served = JSON.parse(gs.btFeedServe({ cache, lock: null, build: () => { builds++; return gs.btFeedBuild({}, 'America/Bogota', NOW); } }));
  assert.equal(builds, 2, 'the previous version\'s copy is not served');
  assert.equal(served.meta.scriptVersion, FEED_SCRIPT_VERSION);
  assert.equal(served.meta.cached, false);
  const again = JSON.parse(gs.btFeedServe({ cache, lock: null, build: () => { builds++; return {}; } }));
  assert.equal(builds, 2, 'its own copy is');
  assert.equal(again.meta.cached, true);
  assert.equal(again.meta.scriptVersion, FEED_SCRIPT_VERSION);
});

test('Feed.gs: the self-test logs the script version', () => {
  const logs = [];
  // A spreadsheet with none of the tabs: enough to run the self-test in Node.
  const gs = loadFeedGs({
    Logger: { log: (s) => logs.push(String(s)) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null, getSpreadsheetTimeZone: () => 'America/Bogota' }) },
  });
  gs.btFeedSelfTest();
  assert.ok(logs.includes(`script version: ${FEED_SCRIPT_VERSION}`), logs.join('\n'));
});

test('app: scriptVersionStatus compares the feed with the expected version', () => {
  assert.deepEqual(scriptVersionStatus({ scriptVersion: 'abc123abc123' }, 'abc123abc123'), { state: 'current', deployed: 'abc123abc123', expected: 'abc123abc123' });
  assert.deepEqual(scriptVersionStatus({ scriptVersion: 'abc123abc123' }, 'fff000fff000'), { state: 'different', deployed: 'abc123abc123', expected: 'fff000fff000' });
  assert.deepEqual(scriptVersionStatus({ rows: {} }, 'fff000fff000'), { state: 'missing', deployed: null, expected: 'fff000fff000' });
  assert.equal(scriptVersionStatus(null, 'x').state, 'missing');
  assert.equal(scriptVersionStatus({ scriptVersion: '' }, 'x').state, 'missing');
  assert.equal(scriptVersionStatus({ scriptVersion: FEED_SCRIPT_VERSION }).state, 'current', 'defaults to the stamped version');
});

test('app: validateFeed keeps meta.scriptVersion and sets null when it is missing (the currently deployed script)', () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));
  const v = validateFeed(structuredClone(fixture));
  assert.equal(v.ok, true);
  assert.equal(v.feed.meta.scriptVersion, FEED_SCRIPT_VERSION);
  assert.equal(scriptVersionStatus(v.feed.meta).state, 'current', 'the fixture never shows the banner');
  const old = structuredClone(fixture);
  delete old.meta.scriptVersion;
  const w = validateFeed(old);
  assert.equal(w.ok, true, 'an older script is still a valid feed');
  assert.equal(w.feed.meta.scriptVersion, null);
  assert.equal(scriptVersionStatus(w.feed.meta).state, 'missing');
});
