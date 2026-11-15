import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, defaultFilters, fromQuery, toQuery, toQueryString, filterOptions, countActive, resolveDates, PRICE_PRESETS } from '../../src/data/filters.js';
import { mkPick } from './helpers/picks.mjs';

const ctx = { today: '2026-11-15' };
const prices = [1.6, 1.7, 1.8, 2.0, 2.2, 2.5, 3.0, 4.0, 4.5];
const ps = prices.map((price) => mkPick({ price }));
const run = (patch) => applyFilters(ps, { ...defaultFilters(), ...patch }, ctx).map((p) => p.price);

test('price presets: inclusive / exclusive edges', () => {
  assert.deepEqual(run({ pricePreset: 'le170' }), [1.6, 1.7]);
  assert.deepEqual(run({ pricePreset: '170_200' }), [1.7, 1.8, 2.0]);
  assert.deepEqual(run({ pricePreset: 'lt200' }), [1.6, 1.7, 1.8]);
  assert.deepEqual(run({ pricePreset: 'le200' }), [1.6, 1.7, 1.8, 2.0]);
  assert.deepEqual(run({ pricePreset: '200_250' }), [2.2, 2.5]);
  assert.deepEqual(run({ pricePreset: 'le250' }), [1.6, 1.7, 1.8, 2.0, 2.2, 2.5]);
  assert.deepEqual(run({ pricePreset: '250_400' }), [3.0, 4.0]);
  assert.deepEqual(run({ pricePreset: 'gt400' }), [4.5]);
  assert.deepEqual(run({ price: { min: 2, max: 3 } }), [2.0, 2.2, 2.5, 3.0]);
  assert.ok(PRICE_PRESETS.every((p) => p.label));
});

test('date presets and slate', () => {
  const ds = ['2026-10-31', '2026-11-01', '2026-11-09', '2026-11-10', '2026-11-15'].map((date) => mkPick({ date }));
  const f = (patch) => applyFilters(ds, { ...defaultFilters(), ...patch }, ctx).map((p) => p.date);
  assert.deepEqual(f({ datePreset: 'last_slate' }), ['2026-11-15']);
  assert.deepEqual(f({ datePreset: '7d' }), ['2026-11-09', '2026-11-10', '2026-11-15']);
  assert.deepEqual(f({ datePreset: 'this_month' }), ['2026-11-01', '2026-11-09', '2026-11-10', '2026-11-15']);
  assert.deepEqual(f({ datePreset: 'since', dateFrom: '2026-11-10' }), ['2026-11-10', '2026-11-15']);
  assert.deepEqual(f({ dateFrom: '2026-11-01', dateTo: '2026-11-09' }), ['2026-11-01', '2026-11-09']);
  assert.deepEqual(f({ slate: '2026-11-10' }), ['2026-11-10']);
  assert.deepEqual(resolveDates({ ...defaultFilters(), datePreset: '30d' }, ctx), ['2026-10-17', '2026-11-15']);
});

test('lists, close flags, refs, sample, FUERZA, reasons, ranges and text search', () => {
  const a = mkPick({ source: 'bets', tag: 'bet', books: ['Betano'], closePrice: 2, hasTwoSidedClose: true, ev: 0.05, probModel: 0.6, parsed: { ref: 'feed', sample: '10+', fuerza: 'keeps', filters: ['gap'] }, match: 'Atlético Brisa vs Faro', notes: 'cierre ok' });
  const b = mkPick({ source: 'shadow', tag: 'value', books: ['Stake'], ev: -0.02, probModel: 0.4, parsed: { filters: ['razor'] } });
  const all = [a, b];
  const f = (patch) => applyFilters(all, { ...defaultFilters(), ...patch }, ctx);
  assert.deepEqual(f({ sources: ['bets'] }), [a]);
  assert.deepEqual(f({ tags: ['value'] }), [b]);
  assert.deepEqual(f({ books: ['Betano', 'Betsson'] }), [a]);
  assert.deepEqual(f({ hasClose: true }), [a]);
  assert.deepEqual(f({ hasClose: false }), [b]);
  assert.deepEqual(f({ twoSidedClose: true }), [a]);
  assert.deepEqual(f({ refs: ['none'] }), [b]);
  assert.deepEqual(f({ samples: ['10+'] }), [a]);
  assert.deepEqual(f({ fuerza: ['keeps'] }), [a]);
  assert.deepEqual(f({ reasons: ['razor'] }), [b]);
  assert.deepEqual(f({ ev: { min: 0, max: null } }), [a]);
  assert.deepEqual(f({ prob: { min: null, max: 0.5 } }), [b]);
  assert.deepEqual(f({ q: 'atletico faro' }), [a], 'accents and order do not matter');
});

test('URL round trip keeps every field; unknown values are dropped', () => {
  const s = {
    ...defaultFilters(), sources: ['shadow'], tags: ['near_value', 'value'], markets: ['result'], marketsRaw: ['Córners totales'], leagues: ['Liga, Austral'],
    books: ['Stake'], statuses: ['won'], pricePreset: 'le200', price: { min: 1.5, max: null }, datePreset: 'since', dateFrom: '2026-11-01', dateTo: null,
    slate: '2026-11-14', hasClose: false, twoSidedClose: true, refs: ['feed'], samples: ['6-9'], fuerza: ['rejects'], reasons: ['gap'],
    ev: { min: 0.03, max: null }, prob: { min: null, max: 0.7 }, q: 'Brisa & co',
  };
  const qs = toQueryString(s);
  const parsed = Object.fromEntries(new URLSearchParams(qs));
  assert.deepEqual(fromQuery(parsed), s);
  assert.deepEqual(fromQuery(toQuery(s)), s);
  const junk = fromQuery({ price: 'nope', date: 'x', from: '2026/11/01', pmin: 'abc', close: 'maybe' });
  assert.deepEqual(junk, defaultFilters());
  assert.equal(countActive(defaultFilters()), 0);
  assert.equal(countActive({ ...defaultFilters(), tags: ['value'], price: { min: 2, max: null }, q: 'x' }), 3);
});

test('options from data, with counts, in a stable order', () => {
  const o = filterOptions([mkPick({ tag: 'value', books: ['Betano'] }), mkPick({ tag: 'value' }), mkPick({ tag: 'published', source: 'shadow' }), mkPick({ source: 'bets', tag: 'bet' })]);
  assert.deepEqual(o.sources, [{ value: 'bets', count: 1 }, { value: 'shadow', count: 3 }]);
  assert.deepEqual(o.tags.map((x) => x.value), ['published', 'value', 'bet']);
  assert.deepEqual(o.books, [{ value: 'Betano', count: 1 }]);
  assert.equal(o.slates[0].value, '2026-11-01');
});
