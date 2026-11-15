// feed.js (validation, fetch, cache) and store.js (cache first, then live; errors keep the data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFeed, fetchFeed, feedMode, feedUrl, readCache, writeCache, clearCache } from '../../src/data/feed.js';
import { feedStore, startFeed, refreshFeed } from '../../src/data/store.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(fixture));
const okFetch = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test('validation: shape, schema guard, script error', () => {
  assert.equal(validateFeed(clone()).ok, true);
  assert.deepEqual(validateFeed({ ...clone(), schema: 2 }), { ok: false, code: 'schema_newer', detail: 'schema 2' });
  assert.equal(/** @type {any} */ (validateFeed({ ...clone(), schema: 0 })).code, 'schema_older');
  assert.equal(/** @type {any} */ (validateFeed({ schema: 1, error: 'boom' })).code, 'feed_error');
  assert.equal(/** @type {any} */ (validateFeed(null)).code, 'invalid');
  const noTab = clone();
  delete noTab.tabs.grok;
  assert.equal(/** @type {any} */ (validateFeed(noTab)).detail, 'tab grok');
  const noMeta = clone();
  delete noMeta.meta;
  const v = /** @type {any} */ (validateFeed(noMeta));
  assert.ok(v.ok && Array.isArray(v.feed.meta.missingHeaders));
});

test('fetch: follows redirects, no browser cache, clear error codes', async () => {
  let opts;
  const r = await fetchFeed('https://x', async (_u, o) => {
    opts = o;
    return { ok: true, status: 200, json: async () => clone() };
  });
  assert.equal(r.ok, true);
  assert.equal(opts.redirect, 'follow');
  assert.equal(opts.cache, 'no-store');
  assert.equal((await fetchFeed('u', async () => { throw new TypeError('Failed to fetch'); })).code, 'offline');
  assert.equal((await fetchFeed('u', async () => ({ ok: false, status: 500 }))).code, 'http');
  assert.equal((await fetchFeed('u', async () => ({ ok: true, json: async () => { throw new SyntaxError('x'); } }))).code, 'parse');
});

test('mode and URL', () => {
  assert.equal(feedMode('?feed=fixture'), 'fixture');
  assert.equal(feedMode(''), 'live');
  assert.equal(feedUrl('fixture'), 'tests/fixtures/feed.json');
  assert.equal(feedUrl('live', ''), '');
});

test('cache entries are kept apart per mode', async () => {
  await clearCache();
  await writeCache('fixture', { feed: clone(), fetchedAt: 'x' });
  assert.equal(await readCache('live'), null);
  assert.equal((await readCache('fixture')).fetchedAt, 'x');
  await clearCache();
  assert.equal(await readCache('fixture'), null);
});

test('store: unconfigured, then cache first, live swap, failure keeps the data', async () => {
  await clearCache();
  await startFeed({ mode: 'live', url: '' });
  assert.equal(feedStore.get().status, 'unconfigured');

  await startFeed({ mode: 'fixture', url: 'f', fetchImpl: okFetch(clone()) });
  let s = feedStore.get();
  assert.equal(s.status, 'ready');
  assert.equal(s.fromCache, false);
  assert.ok(s.data.picks.length > 200);
  const v = s.version;

  await startFeed({ mode: 'fixture', url: 'f', fetchImpl: async () => { throw new TypeError('offline'); } });
  s = feedStore.get();
  assert.equal(s.status, 'ready', 'the cached copy is shown');
  assert.equal(s.fromCache, true);
  assert.equal(s.error.code, 'offline');
  assert.ok(s.version >= 1 && s.data.picks.length > 200);

  await refreshFeed({ url: 'f', fetchImpl: okFetch({ ...clone(), schema: 5 }) });
  s = feedStore.get();
  assert.equal(s.error.code, 'schema_newer');
  assert.ok(s.data, 'a bad answer never drops the shown data');
  assert.ok(v > 0);

  await clearCache();
  await startFeed({ mode: 'fixture', url: 'f', fetchImpl: async () => { throw new TypeError('offline'); } });
  assert.equal(feedStore.get().status, 'error');
});
