// Slow-phone work (docs/PERFORMANCE.md): the speed-ups change no result. The filter and facet-count
// outputs on 5,000 synthetic picks are the same, byte for byte, as before the work (the digest was
// taken with the previous code); memoLast returns the same object for the same keys; a fetched feed
// with the sheet-read time of the one on screen is recognised as the same answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { bigFeed } from '../../scripts/perf/big-feed.mjs';
import { normalizeFeed } from '../../src/data/normalize.js';
import { applyFilters, facetCounts, fromQueryString } from '../../src/data/filters.js';
import { memoLast, clearMemo } from '../../src/data/memo.js';
import { sameFeed } from '../../src/data/store.js';

/** Filter states that reach every branch of applyFilters and facetCounts. */
const STATES = [
  '', 'src=shadow', 'tag=near_value', 'tag=value,near_value&src=shadow', 'price=le200', 'price=170_200&src=grok', 'pmin=1.8&pmax=2.4',
  'date=last_slate', 'date=7d', 'date=30d&tag=cards_under', 'date=this_month', 'date=since&from=2026-10-01', 'from=2026-09-01&to=2026-10-15', 'slate=2026-11-14',
  'q=racing', 'q=tarjetas under', 'q=Córners&src=shadow', 'close=1', 'close=0', 'close2=1', 'pass=1', 'pass=0', 'side=under', 'line=cards:under:4.5',
  'mkt=cards_total&lg=Liga%20Austral', 'book=Betano', 'st=won,lost', 'ref=feed', 'sample=10%2B', 'fz=keeps', 'why=f4', 'evmin=0.02', 'prmin=0.5&prmax=0.6',
  'src=shadow&tag=value&price=le250&date=30d&close2=1&q=a',
];
/** sha256 of the outputs computed with the code before the slow-phone work (commit 6fe7930). */
const DIGEST_BEFORE = '11e431cac76a15a83d2f0138c6f5aa9acebd2b961d00de5a39ea1b8f0cc40b0d';

test('5,000 picks: filters and facet counts give exactly what they gave before the speed-ups', () => {
  const data = normalizeFeed(bigFeed(5000));
  const ctx = { today: '2026-11-15' };
  const h = createHash('sha256');
  const t0 = performance.now();
  for (const q of STATES) {
    const f = fromQueryString(q);
    const list = applyFilters(data.picks, f, ctx).map((p) => p.uid);
    h.update(JSON.stringify([list, facetCounts(data.picks, f, ctx)]));
  }
  const ms = performance.now() - t0;
  assert.equal(h.digest('hex'), DIGEST_BEFORE);
  // 34 filter changes with every facet count: generous (a few hundred ms on a laptop).
  assert.ok(ms < 6000, `took ${Math.round(ms)} ms`);
});

test('memoLast: same keys give the same object, new keys compute again, old entries fall out', () => {
  clearMemo();
  let n = 0;
  const a = {};
  const one = memoLast('t', [a, 'x'], () => ({ n: ++n }));
  assert.equal(memoLast('t', [a, 'x'], () => ({ n: ++n })), one);
  assert.notEqual(memoLast('t', [{}, 'x'], () => ({ n: ++n })), one);
  for (let i = 0; i < 4; i++) memoLast('t', [i], () => ++n, 4);
  const before = n;
  memoLast('t', [a, 'x'], () => ({ n: ++n }), 4);
  assert.equal(n, before + 1, 'pushed out after four newer entries');
});

test('sameFeed: the same sheet read is the same answer; anything else is new', () => {
  const f = /** @type {any} */ ({ schema: 1, generatedAt: '2026-11-15T16:00:00Z' });
  assert.equal(sameFeed(null, f), false);
  assert.equal(sameFeed(f, { ...f }), true);
  assert.equal(sameFeed(f, { ...f, generatedAt: '2026-11-15T16:05:00Z' }), false);
  assert.equal(sameFeed({ ...f, generatedAt: '' }, { ...f, generatedAt: '' }), false);
});

test('the dataset built in the worker is plain data: a structured clone of it is equal, deeply', () => {
  const data = normalizeFeed(bigFeed(1500));
  assert.deepStrictEqual(structuredClone(data), data);
});
