// Line and side of a pick (src/data/lines.js), the line filters (filters.js), the exact breakdown links,
// the price bands at their edges, the Tests links and the per-line Overview rows.
// Every selection below is a synthetic copy of a shape found in the real sheet (Sombra D:E, Grok E:F,
// Apuestas F:G, read only, 15 Nov 2026); team names are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLine, parseLineKey, lineScope, compareLineKeys, lineLabel, lineAddsInfo, groupByLine, isLineKey } from '../../src/data/lines.js';
import { marketFamily, sideOf } from '../../src/data/tags.js';
import {
  applyFilters, defaultFilters, fromQuery, toQuery, toQueryString, fromQueryString, facetCounts, activeEntries, removeEntry, countActive,
  filterOptions, builtinPreset, BUILTIN_PRESETS, PRICE_PRESETS, exactSlice, priceBandPatch, GRADED_STATUSES,
} from '../../src/data/filters.js';
import { priceBand, PRICE_BANDS, summarize, isCountable, isGraded } from '../../src/data/stats.js';
import { breakdown, simulate } from '../../src/data/simulate.js';
import { normalizeFeed } from '../../src/data/normalize.js';
import { FROZEN_TESTS, STOPPED_CATEGORIES, MODEL_SHADOW_TAGS } from '../../src/data/tests-config.js';
import { shadowTagLineRows } from '../../src/data/overview.js';
import { mkPick } from './helpers/picks.mjs';
import { loadAllStrings } from './helpers/strings.mjs';

const ctx = { today: '2026-11-15' };
const L = (market, selection) => parseLine(market, selection, marketFamily(market));

// ---------------------------------------------------------------- parsing every shape

/** [market, selection, expected lineKey or null] */
const SHAPES = [
  // match totals
  ['Tarjetas totales', 'Under 4.5', 'cards:under:4.5'],
  ['Tarjetas totales', 'Over 3.5', 'cards:over:3.5'],
  ['Córners totales', 'Under 10.5', 'corners:under:10.5'],
  ['Córners totales', 'Over 13.5 (tomada al descanso con 9)', 'corners:over:13.5'],
  ['Goles totales', 'Over 2.5', 'goals:over:2.5'],
  ['Goles', 'Under 1.5', 'goals:under:1.5'],
  ['Goles (asiático)', 'Under 2.75', 'goals:under:2.75'],
  ['Goles (asiático)', 'Over 3', 'goals:over:3'],
  ['Goles (asiático)', 'Under 3 asiático', 'goals:under:3'],
  ['Goles 1er tiempo', 'Over 1.25', 'goals_1h:over:1.25'],
  ['Tiros (total)', 'Under 30.5', 'shots:under:30.5'],
  ['Tiros totales', 'Over 27.5', 'shots:over:27.5'],
  ['Tiros al arco (total)', 'Over 10.5', 'sot:over:10.5'],
  ['Tiros al arco totales', 'Under 10.5', 'sot:under:10.5'],
  // team totals, every way the sheet writes them
  ['Córners equipo', 'Atlético Brisa córners Over 5.5', 'corners_team:over:5.5'],
  ['Córners equipo', 'Real Nébula Under 3.5', 'corners_team:under:3.5'],
  ['Córners equipo', 'Club Lince over 4.5', 'corners_team:over:4.5'],
  ['Córners equipo', 'Puerto Alto under 7.5', 'corners_team:under:7.5'],
  ['Tarjetas equipo', 'Ciudad Cobre over 3.5', 'cards_team:over:3.5'],
  ['Tarjetas equipo', 'Rayo Índigo tarjetas Under 3.5', 'cards_team:under:3.5'],
  ['Goles equipo', 'Marea Roja Under 2.5', 'goals_team:under:2.5'],
  ['Goles equipo', 'Sporting Vela Over 0.5 goles', 'goals_team:over:0.5'],
  ['Tiros (equipo)', 'Halcones FC tiros Under 15.5', 'shots_team:under:15.5'],
  ['Tiros equipo', 'Montaña Azul Over 12.5', 'shots_team:over:12.5'],
  ['Tiros equipo', 'Tormenta SC tiros Over 8.5', 'shots_team:over:8.5'],
  ['Tiros al arco (equipo)', 'Unión Granito tiros al arco Under 3.5', 'sot_team:under:3.5'],
  ['Tiros al arco equipo', 'Olímpico Sauce Over 3.5', 'sot_team:over:3.5'],
  ['Tiros al arco equipo', 'Estrella Polar tiros al arco Over 4.5', 'sot_team:over:4.5'],
  // Asian handicap
  ['Hándicap asiático', 'Racing Coral +0.25', 'ah:+0.25'],
  ['Hándicap asiático', 'Deportivo Faro -1', 'ah:-1'],
  ['Hándicap asiático', 'Independiente Ámbar Santa Rosa -3', 'ah:-3'],
  ['Hándicap asiático', 'Juventud Arena -0.25', 'ah:-0.25'],
  ['Hándicap asiático', 'Club Ciruelo 0', 'ah:0'],
  // Spanish words and a comma decimal
  ['Goles', 'Más de 2,5', 'goals:over:2.5'],
  ['Goles', 'Menos de 3.5', 'goals:under:3.5'],
  // no single line
  ['Goles', 'Under 3.5 × Under 3.5', null],
  ['Goles + córners', 'Under 3.5 goles + Rayo Índigo córners Under 6.5', null],
  ['1X2', 'Atlético Brisa gana', null],
  ['1X2 1er tiempo', 'Empate 1er tiempo', null],
  ['1X2 (pago anticipado 2 goles)', 'Puerto Alto gana (pago anticipado si va +2)', null],
  ['Doble oportunidad', 'Club Lince X2 (+0.5)', null],
  ['Doble oportunidad', 'X2 (Marea Roja o empate)', null],
  ['Empate no apuesta', 'Halcones FC DNB', null],
  ['BTTS', 'BTTS no', null],
  ['Ambos marcan', 'Sí', null],
  ['Marcador correcto', '0-0', null],
  ['Primer goleador', 'Jugador Inventado 1er goleador (boost de 2.45 a 10.0)', null],
  ['Más córners (equipo)', 'Sporting Vela', null],
  ['Más córners 2.º tiempo', 'Tormenta SC', null],
  ['Córners 1X2', 'Ciudad Cobre con más córners', null],
  ['Tarjetas 1X2', 'Real Nébula con más tarjetas', null],
  ['Más tarjetas (3 vías)', 'Unión Granito', null],
  ['Córners totales', '', null],
];

test('parseLine: every shape of the sheet', () => {
  for (const [market, sel, key] of SHAPES) {
    const r = L(market, sel);
    assert.equal(r.lineKey, key, `${market} | ${sel}`);
    if (key) assert.equal(r.line, parseLineKey(key).value, `${market} | ${sel}`);
    else assert.equal(r.line, null);
  }
  assert.equal(L('Hándicap asiático', 'Deportivo Faro -1').line, -1);
  assert.equal(L('Hándicap asiático', 'Racing Coral +0.25').line, 0.25);
});

test('the side stays review.py\'s side() and agrees with the line kind on totals', () => {
  for (const [market, sel, key] of SHAPES) {
    const k = parseLineKey(key);
    if (k && k.kind !== 'ah') assert.equal(sideOf(sel), k.kind, sel);
  }
});

test('lineScope, parseLineKey and isLineKey', () => {
  assert.equal(lineScope('Tiros al arco (equipo)', 'shots'), 'sot_team');
  assert.equal(lineScope('1X2', 'result'), null);
  assert.equal(lineScope('Goles + córners', 'combo'), null);
  assert.deepEqual(parseLineKey('cards:under:4.5'), { scope: 'cards', kind: 'under', value: 4.5 });
  assert.deepEqual(parseLineKey('ah:-0.25'), { scope: 'ah', kind: 'ah', value: -0.25 });
  for (const bad of ['', null, 'under:4.5', 'cards:sideways:4.5', 'nope:over:2.5', 'cards:over:x', 'ah:x']) assert.equal(parseLineKey(bad), null, String(bad));
  assert.ok(isLineKey('ah:+0.25'));
  assert.ok(!isLineKey('ah'));
});

test('line order: scope, value, under before over', () => {
  const keys = ['corners:over:9.5', 'cards:over:4.5', 'cards:under:4.5', 'ah:-1', 'cards:under:3.5', 'corners:under:9.5', 'ah:+0.25', 'goals:under:2.5'];
  assert.deepEqual([...keys].sort(compareLineKeys), [
    'cards:under:3.5', 'cards:under:4.5', 'cards:over:4.5', 'corners:under:9.5', 'corners:over:9.5', 'goals:under:2.5', 'ah:-1', 'ah:+0.25',
  ]);
});

test('labels in both languages', () => {
  loadAllStrings('es');
  assert.equal(lineLabel('cards:under:4.5'), 'Under 4.5');
  assert.equal(lineLabel('cards:under:4.5', { scope: true }), 'Tarjetas: Under 4.5');
  assert.equal(lineLabel('corners_team:over:5.5', { scope: true }), 'Córners de equipo: Over 5.5');
  assert.equal(lineLabel('ah:+0.25'), 'Hándicap +0.25');
  assert.equal(lineLabel('ah:-1', { scope: true }), 'Hándicap -1');
  loadAllStrings('en');
  assert.equal(lineLabel('ah:+0.25'), 'Handicap +0.25');
  assert.equal(lineLabel('sot_team:under:3.5', { scope: true }), 'Team shots on target: Under 3.5');
  loadAllStrings('es');
});

test('lineAddsInfo: only when the selection does not already say it', () => {
  const mk = (market, selection) => mkPick({ marketRaw: market, selection, ...L(market, selection) });
  assert.equal(lineAddsInfo(mk('Tarjetas totales', 'Under 4.5')), false);
  assert.equal(lineAddsInfo(mk('Córners equipo', 'Club Lince over 4.5')), false);
  assert.equal(lineAddsInfo(mk('Hándicap asiático', 'Deportivo Faro -1')), false);
  assert.equal(lineAddsInfo(mk('Goles', 'Más de 2,5')), false, 'the Spanish words say the same');
  assert.equal(lineAddsInfo(mk('1X2', 'Atlético Brisa gana')), false);
  assert.equal(lineAddsInfo(mkPick({ selection: 'Under 4.55', lineKey: 'cards:under:4.5' })), true);
});

test('groupByLine: line order, picks without a line left out, 1u flat summary', () => {
  const ps = [
    mkPick({ lineKey: 'cards:under:5.5', status: 'won', price: 2 }),
    mkPick({ lineKey: 'cards:under:4.5', status: 'lost', price: 2 }),
    mkPick({ lineKey: 'cards:under:4.5', status: 'won', price: 1.8 }),
    mkPick({ lineKey: null }),
  ];
  const g = groupByLine(ps);
  assert.deepEqual(g.map((x) => x.key), ['cards:under:4.5', 'cards:under:5.5']);
  assert.equal(g[0].summary.n, 2);
  assert.ok(Math.abs(g[0].summary.profit - -0.2) < 1e-9);
});

// ---------------------------------------------------------------- filter state

const linePicks = [
  mkPick({ uid: 'a', tag: 'cards_under', side: 'under', lineKey: 'cards:under:4.5', line: 4.5, market: 'cards_total' }),
  mkPick({ uid: 'b', tag: 'cards_under', side: 'under', lineKey: 'cards:under:5.5', line: 5.5, market: 'cards_total' }),
  mkPick({ uid: 'c', tag: 'shadow_rule30', side: 'over', lineKey: 'corners:over:9.5', line: 9.5, parsed: { passedAll: true } }),
  mkPick({ uid: 'd', tag: 'value', side: '', lineKey: null, line: null, market: 'result' }),
  mkPick({ uid: 'e', tag: 'team_corners', side: 'under', lineKey: 'corners_team:under:4.5', line: 4.5, market: 'corners_team' }),
];
const uids = (f) => applyFilters(linePicks, { ...defaultFilters(), ...f }, ctx).map((p) => p.uid);

test('sides, lines and passedAll filter', () => {
  assert.deepEqual(uids({ sides: ['under'] }), ['a', 'b', 'e']);
  assert.deepEqual(uids({ sides: ['over'] }), ['c']);
  assert.deepEqual(uids({ lines: ['cards:under:4.5'] }), ['a']);
  assert.deepEqual(uids({ lines: ['cards:under:4.5', 'corners_team:under:4.5'] }), ['a', 'e']);
  assert.deepEqual(uids({ tags: ['cards_under'], lines: ['cards:under:4.5'] }), ['a']);
  assert.deepEqual(uids({ passedAll: true }), ['c']);
  assert.deepEqual(uids({ passedAll: false }), ['a', 'b', 'd', 'e']);
});

test('URL round trip of the new fields; unknown values dropped; old URLs unchanged', () => {
  const f = { ...defaultFilters(), tags: ['cards_under'], sides: ['under'], lines: ['cards:under:4.5', 'ah:+0.25'], passedAll: true };
  const q = toQuery(f);
  assert.equal(q.side, 'under');
  assert.equal(q.pass, '1');
  assert.deepEqual(fromQuery(q), f);
  assert.deepEqual(fromQueryString(toQueryString(f)), f);
  const back = fromQuery({ side: 'under,sideways', line: 'cards%3Aunder%3A4.5,bogus', pass: 'x' });
  assert.deepEqual(back.sides, ['under']);
  assert.deepEqual(back.lines, ['cards:under:4.5']);
  assert.equal(back.passedAll, null);
  // An old URL and an old saved preset parse to the same state as before (new fields at their defaults).
  const old = fromQueryString('tag=near_value&price=le200&src=shadow');
  assert.deepEqual(old, { ...defaultFilters(), tags: ['near_value'], pricePreset: 'le200', sources: ['shadow'] });
  assert.equal(toQueryString(old), 'src=shadow&tag=near_value&price=le200');
});

test('countActive, activeEntries and removeEntry know the new fields', () => {
  const f = { ...defaultFilters(), sides: ['under'], lines: ['cards:under:4.5'], passedAll: false };
  assert.equal(countActive(f), 3);
  const e = activeEntries(f);
  assert.deepEqual(e, [{ field: 'sides', value: 'under' }, { field: 'lines', value: 'cards:under:4.5' }, { field: 'passedAll', value: 'no' }]);
  assert.deepEqual(removeEntry(f, e[1]).lines, []);
  assert.equal(removeEntry(f, e[2]).passedAll, null);
});

test('filterOptions and facetCounts: lines under the other filters, sorted by line', () => {
  const o = filterOptions(linePicks);
  assert.deepEqual(o.lines.map((x) => x.value), ['cards:under:4.5', 'cards:under:5.5', 'corners:over:9.5', 'corners_team:under:4.5']);
  assert.deepEqual(o.sides.map((x) => x.value), ['over', 'under']);
  const c = facetCounts(linePicks, { ...defaultFilters(), tags: ['cards_under'] }, ctx);
  assert.deepEqual(c.lines, { 'cards:under:4.5': 1, 'cards:under:5.5': 1 });
  assert.deepEqual(c.sides, { under: 2 });
  const c2 = facetCounts(linePicks, { ...defaultFilters(), lines: ['cards:under:4.5'] }, ctx);
  assert.equal(c2.total, 1);
  assert.equal(c2.lines['corners:over:9.5'], 1, 'the line field is left out of its own counts');
  assert.deepEqual(c2.passedAll, { yes: 0, no: 1 });
});

test('built-in line presets', () => {
  const ids = BUILTIN_PRESETS.map((b) => b.id);
  for (const id of ['cards_under_45', 'cards_under_55', 'corners_under_95']) assert.ok(ids.includes(id));
  const s = builtinPreset('cards_under_45');
  assert.deepEqual(s.tags, ['cards_under']);
  assert.deepEqual(s.lines, ['cards:under:4.5']);
  assert.deepEqual(uids(s), ['a']);
  for (const b of BUILTIN_PRESETS) for (const k of b.patch.lines || []) assert.ok(isLineKey(k), k);
});

// ---------------------------------------------------------------- price bands at their edges

test('price bands are disjoint and each band is exactly its preset (1.70, 2.00, 2.50, 4.00)', () => {
  const prices = [1.5, 1.69, 1.7, 1.701, 1.99, 2.0, 2.001, 2.5, 2.51, 3.99, 4.0, 4.01, 9];
  assert.deepEqual(prices.map(priceBand), ['lt170', 'lt170', '170_200', '170_200', '170_200', '170_200', '200_250', '200_250', '250_400', '250_400', '250_400', 'gt400', 'gt400']);
  const ps = prices.map((price) => mkPick({ price }));
  for (const b of PRICE_BANDS) {
    assert.ok(PRICE_PRESETS.some((p) => p.id === b.id), `band ${b.id} has a preset`);
    const viaFilter = applyFilters(ps, { ...defaultFilters(), ...priceBandPatch(b.id) }, ctx).map((p) => p.price);
    assert.deepEqual(viaFilter, prices.filter((x) => priceBand(x) === b.id), b.id);
  }
  // Every price lands in exactly one band.
  for (const x of prices) assert.equal(PRICE_BANDS.filter((b) => priceBand(x) === b.id).length, 1);
  // Juan's presets keep their meaning.
  const run = (id) => applyFilters(ps, { ...defaultFilters(), pricePreset: id }, ctx).map((p) => p.price);
  assert.deepEqual(run('le170'), [1.5, 1.69, 1.7]);
  assert.deepEqual(run('lt200'), [1.5, 1.69, 1.7, 1.701, 1.99]);
  assert.deepEqual(run('le200'), [1.5, 1.69, 1.7, 1.701, 1.99, 2.0]);
  assert.deepEqual(run('le250'), [1.5, 1.69, 1.7, 1.701, 1.99, 2.0, 2.001, 2.5]);
  assert.ok(PRICE_PRESETS.find((p) => p.id === 'lt170').hidden);
});

// ---------------------------------------------------------------- exact breakdown links

const feed = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));
const data = normalizeFeed(feed);

test('every breakdown row link selects exactly the picks of the row (fixture, every dimension)', () => {
  const dims = {
    tag: [(p) => p.tag, (k) => ({ tags: [k] })],
    market: [(p) => p.market, (k) => ({ markets: [k] })],
    price: [(p) => priceBand(p.price), (k) => priceBandPatch(k)],
    line: [(p) => p.lineKey, (k) => ({ lines: [k] })],
  };
  for (const filters of [defaultFilters(), { ...defaultFilters(), sources: ['shadow'] }, { ...defaultFilters(), statuses: ['won', 'pending'] }]) {
    const sim = simulate(applyFilters(data.picks, filters, ctx), { mode: 'flat', stake: 1, bankroll: 100 });
    for (const [dim, [keyOf, patchOf]] of Object.entries(dims)) {
      for (const row of breakdown(sim.points, keyOf)) {
        const f = exactSlice(data.picks, filters, patchOf(row.key), ctx);
        const linked = applyFilters(data.picks, f, ctx);
        const inRow = sim.points.filter((pt) => keyOf(pt.pick) === row.key).map((pt) => pt.pick.uid).sort();
        assert.deepEqual(linked.map((p) => p.uid).sort(), inRow, `${dim} ${row.key}`);
        assert.equal(linked.length, row.n);
      }
    }
  }
});

test('exactSlice adds conditions only when needed', () => {
  const ps = [mkPick({ uid: 'x', status: 'won' }), mkPick({ uid: 'y', status: 'pending' })];
  const f = exactSlice(ps, defaultFilters(), { tags: ['shadow_rule30'] }, ctx);
  assert.deepEqual(f.statuses, GRADED_STATUSES);
  assert.deepEqual(f.tags, ['shadow_rule30']);
  assert.equal(f.price.min, null);
  const withBet = [...ps, mkPick({ uid: 'z', tag: 'published_bet', status: 'won' }), mkPick({ uid: 'w', status: 'lost', price: null })];
  const g = exactSlice(withBet, defaultFilters(), {}, ctx);
  assert.ok(!g.tags.includes('published_bet') && g.tags.includes('shadow_rule30'));
  assert.equal(g.price.min, 1);
  assert.deepEqual(applyFilters(withBet, g, ctx).map((p) => p.uid), ['x']);
  assert.equal(summarize(withBet).n, 1);
});

// ---------------------------------------------------------------- Tests links

test('Tests links: an exact Explorer filter selects the same picks as the membership', () => {
  // The fixture plus edge rows on each boundary the filters must reproduce.
  const extra = [
    mkPick({ uid: 'e1', tag: 'cards_under', reviewClass: 'cards', market: 'cards_total', marketRaw: 'Tarjetas totales', selection: 'Under 4.5', side: 'under', lineKey: 'cards:under:4.5', date: '2026-11-01', price: 1.7 }),
    mkPick({ uid: 'e2', tag: 'filter_reject', reviewClass: 'cards', market: 'cards_team', marketRaw: 'Tarjetas equipo', selection: 'Rayo Índigo Under 4.5', side: 'under', lineKey: 'cards_team:under:4.5', date: '2026-11-02', price: 4.0 }),
    mkPick({ uid: 'e3', tag: 'cards_under', reviewClass: 'cards', market: 'cards_total', marketRaw: 'Tarjetas totales', selection: 'Under 4.5', side: 'under', lineKey: 'cards:under:4.5', date: '2026-10-31', price: 2 }),
    mkPick({ uid: 'e4', tag: 'value', reviewClass: 'cards', market: 'cards_total', marketRaw: 'Tarjetas totales', selection: 'Under 4.5', side: 'under', lineKey: 'cards:under:4.5', date: '2026-11-05', price: 2 }),
    mkPick({ uid: 'e5', tag: 'shadow', reviewClass: 'corners', market: 'corners_total', date: '2026-10-13', parsed: { passedAll: true } }),
    mkPick({ uid: 'e6', tag: 'published', reviewClass: 'corners', market: 'corners_total', date: '2026-10-20', parsed: { passedAll: true } }),
    mkPick({ uid: 'e7', tag: 'model_only_shots', reviewClass: 'shots', market: 'shots', marketRaw: 'Tiros equipo', price: 1.69 }),
    mkPick({ uid: 'e8', tag: 'model_only_shots', reviewClass: 'shots', market: 'shots', marketRaw: 'Tiros equipo', price: 1.7 }),
    mkPick({ uid: 'e9', tag: 'team_corners', reviewClass: 'team_corners', market: 'corners_team', marketRaw: 'Córners equipo', date: '2026-11-02' }),
    mkPick({ uid: 'e10', tag: 'shadow', reviewClass: 'shots', market: 'shots', marketRaw: 'Tiros al arco equipo', date: '2026-10-20' }),
  ];
  const picks = [...data.picks, ...extra];
  const all = [...FROZEN_TESTS, ...STOPPED_CATEGORIES];
  // Every link is the test's own filter (`test=<id>`, fixes): exact for all of them. The membership
  // counts countable rows only (no PUBLICADA Y APOSTADA, no unknown status), as the cards do.
  for (const tt of all) {
    const linked = applyFilters(picks, { ...defaultFilters(), ...tt.explorer }, ctx).map((p) => p.uid).sort();
    const members = picks.filter((p) => isCountable(p) && tt.match(p)).map((p) => p.uid).sort();
    assert.deepEqual(linked, members, tt.id);
  }
  assert.ok(MODEL_SHADOW_TAGS.every((tag) => !['value', 'near_value', 'prop_value', 'prop_near_value', 'ai_watch', 'published', 'published_bet'].includes(tag)));
});

// ---------------------------------------------------------------- Overview by line

test('Overview: per-line rows under tags with two or more lines', () => {
  const ps = [
    mkPick({ tag: 'cards_under', lineKey: 'cards:under:5.5', status: 'won' }),
    mkPick({ tag: 'cards_under', lineKey: 'cards:under:4.5', status: 'lost' }),
    mkPick({ tag: 'cards_under', lineKey: 'cards:under:4.5', status: 'pending' }),
    mkPick({ tag: 'corner_rejects', lineKey: 'corners:under:9.5', status: 'won' }),
    mkPick({ tag: 'published_bet', lineKey: 'cards:under:3.5', status: 'won' }),
    mkPick({ tag: 'value', lineKey: null, status: 'won' }),
  ];
  const r = shadowTagLineRows(ps);
  assert.deepEqual(Object.keys(r), ['cards_under']);
  assert.deepEqual(r.cards_under.map((x) => [x.key, x.summary.n, x.count]), [['cards:under:4.5', 1, 2], ['cards:under:5.5', 1, 1]]);
  assert.equal(r.cards_under[0].verdict, 'none');
  // On the fixture the per-line n add up to the tag's graded picks that have a line.
  const fx = shadowTagLineRows(data.picks);
  for (const [tag, rows] of Object.entries(fx)) {
    const graded = data.picks.filter((p) => p.source === 'shadow' && p.tag === tag && p.lineKey && isCountable(p) && isGraded(p) && p.price != null).length;
    assert.equal(rows.reduce((a, x) => a + x.summary.n, 0), graded, tag);
  }
});

test('fixture: every pick has the line fields; doubles and builders have none', () => {
  for (const p of data.picks) {
    assert.ok('line' in p && 'lineKey' in p, p.uid);
    if (p.lineKey) assert.ok(isLineKey(p.lineKey), p.lineKey);
    if (p.market === 'combo') assert.equal(p.lineKey, null, p.uid);
  }
  assert.ok(data.picks.some((p) => p.lineKey === 'cards:under:4.5'));
});
