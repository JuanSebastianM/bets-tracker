// Data-layer additions made for the Explorer and the shared filter panel: facet counts, active
// entries, stored query strings, built-in presets, tag groups and slugs, sorting, the Pinnacle join
// and previous / next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyFilters, defaultFilters, facetCounts, FACET_FIELDS, activeEntries, removeEntry, fromQueryString, toQueryString,
  BUILTIN_PRESETS, builtinPreset, PRICE_PRESETS, DATE_PRESETS, countActive,
} from '../../src/data/filters.js';
import { TAGS, TAG_GROUPS, tagSlug } from '../../src/data/tags.js';
import { sortPicks, SORT_KEYS, SORT_DEFAULT_DIR, pinnacleFor, neighbours } from '../../src/data/explore.js';
import { normalizeFeed } from '../../src/data/normalize.js';
import { mkPick } from './helpers/picks.mjs';

const ctx = { today: '2026-11-15' };

test('facetCounts: each field counted under the other filters, not its own', () => {
  const ps = [
    mkPick({ source: 'shadow', tag: 'value', price: 1.8, date: '2026-11-14' }),
    mkPick({ source: 'shadow', tag: 'near_value', price: 2.2, date: '2026-11-15' }),
    mkPick({ source: 'grok', tag: 'grok_priced', price: 1.9, date: '2026-11-15', closePrice: 1.8 }),
    mkPick({ source: 'bets', tag: 'bet', price: 3.0, date: '2026-11-01', books: ['Betano', 'Stake'] }),
  ];
  const f = { ...defaultFilters(), sources: ['shadow'], pricePreset: 'le200' };
  const c = facetCounts(ps, f, ctx);
  assert.equal(c.total, 1);
  // sources ignore the source filter but keep the price filter
  assert.deepEqual(c.sources, { shadow: 1, grok: 1 });
  // tags keep both
  assert.deepEqual(c.tags, { value: 1 });
  // price presets ignore the price filter but keep the source filter
  assert.equal(c.pricePresets.le200, 1);
  assert.equal(c.pricePresets['200_250'], 1);
  assert.equal(c.pricePresets.gt400, 0);
  assert.equal(c.datePresets.last_slate, 0, 'last slate is the newest date of all picks (15 nov), the shadow ≤2.0 pick is from 14 nov');
  assert.deepEqual(c.slates, { '2026-11-14': 1 });
  assert.deepEqual(c.hasClose, { yes: 0, no: 1 });
  for (const field of FACET_FIELDS) assert.ok(c[field], field);
  assert.deepEqual(Object.keys(c.pricePresets), PRICE_PRESETS.map((p) => p.id));
  assert.deepEqual(Object.keys(c.datePresets), DATE_PRESETS);
  // a pick in two books counts once per book; text search narrows every facet
  const all = facetCounts(ps, defaultFilters(), ctx);
  assert.deepEqual(all.books, { Betano: 1, Stake: 1 });
  assert.equal(all.total, 4);
  const q = facetCounts(ps, { ...defaultFilters(), q: 'zzz-nothing' }, ctx);
  assert.equal(q.total, 0);
  assert.deepEqual(q.sources, {});
});

test('facetCounts agrees with applyFilters for every option', () => {
  const feed = JSON.parse(readFileSync(resolve(import.meta.dirname, '../fixtures/feed.json'), 'utf8'));
  const { picks } = normalizeFeed(feed);
  const f = { ...defaultFilters(), sources: ['shadow'], statuses: ['won', 'lost'] };
  const c = facetCounts(picks, f, ctx);
  assert.equal(c.total, applyFilters(picks, f, ctx).length);
  for (const [tag, n] of Object.entries(c.tags)) assert.equal(applyFilters(picks, { ...f, tags: [tag] }, ctx).length, n, tag);
  for (const [st, n] of Object.entries(c.statuses)) assert.equal(applyFilters(picks, { ...f, statuses: [st] }, ctx).length, n, st);
  for (const [id, n] of Object.entries(c.pricePresets)) assert.equal(applyFilters(picks, { ...f, pricePreset: id }, ctx).length, n, id);
});

test('activeEntries lists every active filter and removeEntry drops one', () => {
  const f = {
    ...defaultFilters(), sources: ['shadow'], tags: ['value', 'near_value'], pricePreset: 'le200', datePreset: '7d', slate: '2026-11-10',
    hasClose: true, ev: { min: 0.03, max: null }, q: 'brisa',
  };
  const e = activeEntries(f);
  assert.deepEqual(e.map((x) => x.field), ['sources', 'tags', 'tags', 'pricePreset', 'slate', 'date', 'hasClose', 'ev', 'q']);
  const noValue = removeEntry(f, { field: 'tags', value: 'value' });
  assert.deepEqual(noValue.tags, ['near_value']);
  assert.deepEqual(f.tags, ['value', 'near_value'], 'not mutated');
  assert.equal(removeEntry(f, { field: 'date' }).datePreset, null);
  assert.equal(removeEntry(f, { field: 'slate' }).slate, null);
  assert.deepEqual(removeEntry(f, { field: 'ev' }).ev, { min: null, max: null });
  assert.equal(removeEntry(f, { field: 'q' }).q, '');
  let g = f;
  for (const x of activeEntries(f)) g = removeEntry(g, x);
  assert.deepEqual(g, defaultFilters());
  assert.deepEqual(activeEntries(defaultFilters()), []);
});

test('fromQueryString reads what toQueryString writes (saved presets)', () => {
  const f = { ...defaultFilters(), tags: ['team_corners'], samples: ['10+'], leagues: ['Liga, Austral'], q: 'a & b' };
  assert.deepEqual(fromQueryString(toQueryString(f)), f);
  assert.deepEqual(fromQueryString('?' + toQueryString(f)), f);
  assert.deepEqual(fromQueryString(''), defaultFilters());
});

test('built-in presets are valid states with at least one filter', () => {
  for (const b of BUILTIN_PRESETS) {
    const f = builtinPreset(b.id);
    assert.ok(f && countActive(f) > 0, b.id);
    assert.deepEqual(fromQueryString(toQueryString(f)), f, b.id);
  }
  assert.deepEqual(builtinPreset('value_le200')?.tags, ['value']);
  assert.equal(builtinPreset('value_le200')?.pricePreset, 'le200');
  assert.equal(builtinPreset('nope'), null);
});

test('TAG_GROUPS hold every tag exactly once; tagSlug', () => {
  const ids = TAG_GROUPS.flatMap((g) => g.tags);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), TAGS.map((t) => t.id).sort());
  assert.equal(tagSlug('near_value'), 'near-value');
  assert.equal(tagSlug('bet'), 'bet');
});

test('sortPicks: by key and direction, nulls last, ties chronological', () => {
  const a = mkPick({ date: '2026-11-01', price: 2.1, match: 'Árbol vs B', fairCloseEv: 0.02, status: 'lost' });
  const b = mkPick({ date: '2026-11-03', price: null, match: 'Zeta vs C', fairCloseEv: null, status: 'won' });
  const c = mkPick({ date: '2026-11-02', price: 1.7, match: 'beta vs D', fairCloseEv: -0.01, status: 'pending' });
  const d = mkPick({ date: '2026-11-02', price: 1.7, match: 'Delta vs E', fairCloseEv: 0.05, status: 'won' });
  const uids = (/** @type {any[]} */ l) => l.map((p) => p.uid);
  assert.deepEqual(uids(sortPicks([a, b, c, d])), uids([b, d, c, a]), 'default: newest first');
  assert.deepEqual(uids(sortPicks([a, b, c, d], 'date', 'asc')), uids([a, c, d, b]));
  assert.deepEqual(uids(sortPicks([a, b, c, d], 'price', 'asc')), uids([c, d, a, b]), 'null price last');
  assert.deepEqual(uids(sortPicks([a, b, c, d], 'price', 'desc')), uids([a, d, c, b]), 'ties reversed with the direction, null last');
  assert.deepEqual(uids(sortPicks([a, b, c, d], 'match', 'asc')), uids([a, c, d, b]), 'accents and case folded');
  assert.deepEqual(uids(sortPicks([a, b, c, d], 'fairCloseEv', 'desc')), uids([d, a, c, b]));
  assert.deepEqual(uids(sortPicks([a, b, c, d], 'status', 'asc')).slice(0, 2).sort(), uids([b, d]).sort());
  assert.deepEqual(uids(sortPicks([a, b], 'unknown')), uids([b, a]));
  for (const k of SORT_KEYS) assert.ok(SORT_DEFAULT_DIR[k], k);
});

test('pinnacleFor joins by the pin id; neighbours', () => {
  const pin = [{ row: 2, id: 'abc' }, { row: 3, id: 'def' }];
  const p = mkPick({ parsed: { pin: { home: 2, draw: 3, away: 4, readUtc: '', id: 'def' } } });
  assert.equal(pinnacleFor(pin, p)?.row, 3);
  assert.equal(pinnacleFor(pin, mkPick()), null);
  assert.equal(pinnacleFor(pin, mkPick({ parsed: { pin: { home: 2, draw: 3, away: 4, readUtc: '', id: 'zzz' } } })), null);
  const l = [mkPick(), mkPick(), mkPick()];
  assert.deepEqual(neighbours(l, l[1].uid), { index: 1, prev: l[0], next: l[2] });
  assert.deepEqual(neighbours(l, l[0].uid), { index: 0, prev: null, next: l[1] });
  assert.deepEqual(neighbours(l, 'x'), { index: -1, prev: null, next: null });
});

test('fixture: one Sombra pick joins a Pinnacle row by its pin id', () => {
  const feed = JSON.parse(readFileSync(resolve(import.meta.dirname, '../fixtures/feed.json'), 'utf8'));
  const { picks, pinnacle } = normalizeFeed(feed);
  const joined = picks.filter((p) => pinnacleFor(pinnacle, p));
  assert.equal(joined.length, 1);
  const row = /** @type {any} */ (pinnacleFor(pinnacle, joined[0]));
  assert.equal(`${row.home} vs ${row.away}`, joined[0].match);
  assert.equal(joined[0].source, 'shadow');
});
