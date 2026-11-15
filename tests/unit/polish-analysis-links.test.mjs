// Analysis breakdown links (src/data/analysis.js exactRowFilter / exactCellFilter): every row that has a
// link opens in the Explorer exactly the picks the row counts, for every dimension, under several
// filter states; and the line dimension.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeFeed } from '../../src/data/normalize.js';
import { applyFilters, defaultFilters } from '../../src/data/filters.js';
import { isCountable, isGraded } from '../../src/data/stats.js';
import { DIMENSION_IDS, dimension, breakdown, exactRowFilter, exactCellFilter, twoWay, sortRows } from '../../src/data/analysis.js';
import { compareLineKeys } from '../../src/data/lines.js';
import { loadAllStrings } from './helpers/strings.mjs';

loadAllStrings('es');
const feed = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));
const data = normalizeFeed(feed);
const ctx = { today: '2026-11-15' };
const counted = (p) => isCountable(p) && isGraded(p) && p.price != null;
const inGroup = (dimId, key) => (p) => {
  const k = dimension(dimId).key(p);
  return Array.isArray(k) ? k.includes(key) : k === key;
};

const STATES = {
  all: defaultFilters(),
  shadow: { ...defaultFilters(), sources: ['shadow'] },
  last30: { ...defaultFilters(), datePreset: '30d' },
  le200: { ...defaultFilters(), pricePreset: 'le200' },
  custom: { ...defaultFilters(), price: { min: 1.8, max: 3 }, prob: { min: 0.35, max: null } },
  betano: { ...defaultFilters(), books: ['Betano'] },
  pendingToo: { ...defaultFilters(), statuses: ['won', 'pending'] },
};

test('every linked breakdown row selects exactly its counted picks (every dimension, several filters)', () => {
  let linked = 0;
  let unlinked = 0;
  for (const [name, f] of Object.entries(STATES)) {
    const filtered = applyFilters(data.picks, f, ctx);
    for (const dimId of DIMENSION_IDS) {
      for (const row of breakdown(filtered, dimId).rows) {
        const link = exactRowFilter(data.picks, filtered, f, dimId, row.key, ctx);
        const want = filtered.filter((p) => inGroup(dimId, row.key)(p) && counted(p)).map((p) => p.uid).sort();
        assert.equal(want.length, row.summary.n, `${name} ${dimId} ${row.key}: the row counts its graded, priced picks`);
        if (!link) {
          unlinked++;
          continue;
        }
        linked++;
        const got = applyFilters(data.picks, link, ctx).map((p) => p.uid).sort();
        assert.deepEqual(got, want, `${name} ${dimId} ${row.key}`);
      }
    }
  }
  assert.ok(linked > 500, `links built: ${linked}`);
  assert.ok(unlinked < linked / 5, `rows without a link: ${unlinked}`);
});

test('with no filter every row of every linkable dimension has a link; weekday never does', () => {
  const f = defaultFilters();
  const filtered = applyFilters(data.picks, f, ctx);
  for (const dimId of DIMENSION_IDS) {
    for (const row of breakdown(filtered, dimId).rows) {
      const link = exactRowFilter(data.picks, filtered, f, dimId, row.key, ctx);
      if (dimId === 'weekday') assert.equal(link, null);
      else if (row.summary.n > 0) assert.ok(link, `${dimId} ${row.key}`);
    }
  }
});

test('ranges are intersected with the current filter (month under 30 days, a band under a price preset)', () => {
  for (const [name, dimId] of [['last30', 'month'], ['le200', 'priceBand'], ['custom', 'probBand'], ['custom', 'priceBand']]) {
    const f = STATES[name];
    const filtered = applyFilters(data.picks, f, ctx);
    const rows = breakdown(filtered, dimId).rows.filter((r) => r.summary.n > 0);
    assert.ok(rows.length, `${name} ${dimId} has rows`);
    for (const row of rows) assert.ok(exactRowFilter(data.picks, filtered, f, dimId, row.key, ctx), `${name} ${dimId} ${row.key}`);
  }
});

test('two-way cells link exactly too', () => {
  const f = STATES.shadow;
  const filtered = applyFilters(data.picks, f, ctx);
  for (const [a, b] of [['tag', 'priceBand'], ['market', 'month'], ['line', 'book']]) {
    const tw = twoWay(filtered, a, b);
    for (const r of tw.rows) {
      for (const c of tw.cols) {
        if (!tw.cells[r][c]) continue;
        const link = exactCellFilter(data.picks, filtered, f, [[a, r], [b, c]], ctx);
        const want = filtered.filter((p) => inGroup(a, r)(p) && inGroup(b, c)(p) && counted(p)).map((p) => p.uid).sort();
        if (link) assert.deepEqual(applyFilters(data.picks, link, ctx).map((p) => p.uid).sort(), want, `${a}=${r} ${b}=${c}`);
      }
    }
  }
});

test('line dimension: lineKey groups in line order', () => {
  assert.ok(DIMENSION_IDS.includes('line'));
  const rows = breakdown(data.picks, 'line').rows;
  assert.ok(rows.length > 3);
  const keys = rows.map((r) => r.key);
  assert.deepEqual(keys, [...keys].sort(compareLineKeys));
  assert.ok(keys.every((k) => /:/.test(k)));
  const desc = sortRows(rows, 'natural', 'desc', 'line').map((r) => r.key);
  assert.deepEqual(desc, [...keys].reverse());
});
