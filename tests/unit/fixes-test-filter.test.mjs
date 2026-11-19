// The filter by test (fixes): `tests` in the filter state, URL key `test`. Every Tests link selects
// exactly the rows its membership function counts, on the fixture and on synthetic rows built for the
// boundaries (CÓRNERS EQUIPO's "passed every filter OR dated 3 Nov or later" included).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyFilters, defaultFilters, fromQuery, toQuery, toQueryString, fromQueryString, facetCounts, filterOptions, activeEntries,
  removeEntry, countActive, FACET_FIELDS,
} from '../../src/data/filters.js';
import {
  FROZEN_TESTS, PRICE_FIRST_TESTS, STOPPED_CATEGORIES, TEST_FILTERS, TEST_IDS, testIdsOf, testLabel, testFilterEntry,
  frozenProgress, priceFirstProgress, stoppedSummary,
} from '../../src/data/tests-config.js';
import { normalizeFeed } from '../../src/data/normalize.js';
import { mkPick } from './helpers/picks.mjs';
import { loadAllStrings } from './helpers/strings.mjs';

const ctx = { today: '2026-11-15' };
const feed = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));
const data = normalizeFeed(feed);
const ALL = [...FROZEN_TESTS, ...PRICE_FIRST_TESTS, ...STOPPED_CATEGORIES];

/** The rows each Tests card counts, from the screen's own progress functions. */
function cardRows(id, picks) {
  const f = FROZEN_TESTS.find((x) => x.id === id);
  if (f) return frozenProgress(f, picks).rows;
  const pf = PRICE_FIRST_TESTS.find((x) => x.id === id);
  if (pf) return priceFirstProgress(pf, picks).rows;
  return stoppedSummary(STOPPED_CATEGORIES.find((x) => x.id === id), picks).rows;
}

const tc = (over) => mkPick({ tag: 'team_corners', reviewClass: 'team_corners', market: 'corners_team', marketRaw: 'Córners equipo', selection: 'Rayo Índigo Over 4.5', side: 'over', ...over });
/** Synthetic rows on every boundary, CÓRNERS EQUIPO's OR branch first. */
const SYNTHETIC = [
  tc({ uid: 's1', date: '2026-11-03', parsed: { passedAll: false } }), // member by the date only
  tc({ uid: 's2', date: '2026-11-02', parsed: { passedAll: true } }), // member by "passed every filter" only
  tc({ uid: 's3', date: '2026-11-02', parsed: { passedAll: false } }), // neither: a stopped team-corner reject
  tc({ uid: 's4', date: '2026-11-10', parsed: { passedAll: true }, status: 'pending' }), // both, pending
  tc({ uid: 's5', date: '2026-11-10', tag: 'published', parsed: { passedAll: true } }), // published: never a model row
  tc({ uid: 's6', date: '2026-11-10', tag: 'published_bet' }), // not countable
  tc({ uid: 's7', date: '2026-11-10', status: 'other', statusRaw: 'Rara' }), // not countable
  tc({ uid: 's8', date: '2026-11-10', source: 'grok', tag: 'grok_priced' }), // not Sombra
  mkPick({ uid: 's9', tag: 'cards_under', reviewClass: 'cards', market: 'cards_total', selection: 'Under 4.5', side: 'under', lineKey: 'cards:under:4.5', date: '2026-11-01', price: 1.7 }),
  mkPick({ uid: 's10', tag: 'cards_under', reviewClass: 'cards', market: 'cards_total', selection: 'Under 5.5', side: 'under', lineKey: 'cards:under:5.5', date: '2026-10-31', price: 2 }),
  mkPick({ uid: 's11', tag: 'value', reviewClass: 'result', market: 'result', date: '2026-11-05', price: 2.4 }),
  mkPick({ uid: 's12', tag: 'value', reviewClass: 'result', market: 'result', date: '2026-11-05', price: 2.4, status: 'pending' }),
  mkPick({ uid: 's13', tag: 'model_only_shots', reviewClass: 'shots', market: 'shots', marketRaw: 'Tiros equipo', price: 1.69 }),
  mkPick({ uid: 's14', tag: 'model_only_shots', reviewClass: 'shots', market: 'shots', marketRaw: 'Tiros equipo', price: 1.7 }),
  mkPick({ uid: 's15', tag: 'ai_watch', reviewClass: 'cards', market: 'cards_total' }),
  mkPick({ uid: 's16', tag: 'filter_reject', reviewClass: 'shots', market: 'shots', marketRaw: 'Tiros totales', date: '2026-10-24' }),
  mkPick({ uid: 's17', tag: 'shadow', reviewClass: 'corners', market: 'corners_total', date: '2026-10-13', parsed: { passedAll: true } }),
];

const uids = (list) => list.map((p) => p.uid).sort();

test('every test and stopped category has an id of its own, a label and a membership entry', () => {
  assert.equal(new Set(TEST_IDS).size, TEST_IDS.length, 'ids are unique across the three kinds');
  assert.deepEqual(TEST_IDS, ALL.map((x) => x.id));
  for (const x of ALL) {
    assert.equal(testLabel(x.id), x.sheetLabel);
    assert.equal(typeof testFilterEntry(x.id).member, 'function');
    assert.deepEqual(x.explorer, { tests: [x.id] }, `${x.id} links with its own test filter`);
    assert.ok(!('explorerExact' in x), 'no approximation flag is left');
  }
  assert.deepEqual([...new Set(TEST_FILTERS.map((x) => x.kind))], ['frozen', 'price_first', 'stopped']);
  assert.equal(testLabel('nope'), 'nope');
});

test('Tests links: the filter of every test selects exactly the rows its card counts (fixture and synthetic rows)', () => {
  for (const [name, picks] of [['fixture', data.picks], ['synthetic', SYNTHETIC], ['both', [...data.picks, ...SYNTHETIC]]]) {
    for (const x of ALL) {
      const linked = applyFilters(picks, { ...defaultFilters(), ...x.explorer }, ctx);
      const members = picks.filter(testFilterEntry(x.id).member);
      assert.deepEqual(uids(linked), uids(members), `${name}: ${x.id} link = membership`);
      assert.deepEqual(uids(linked), uids(cardRows(x.id, picks)), `${name}: ${x.id} link = the card's rows`);
      // The same through the URL, as the link travels.
      const back = fromQueryString(toQueryString({ ...defaultFilters(), ...x.explorer }));
      assert.deepEqual(uids(applyFilters(picks, back, ctx)), uids(members), `${name}: ${x.id} after the URL`);
    }
  }
  // The fixture has rows in most tests, so the check is not vacuous.
  assert.ok(ALL.filter((x) => data.picks.some(testFilterEntry(x.id).member)).length >= 12);
});

test('CÓRNERS EQUIPO: the OR branch ("passed every filter" or dated 3 Nov or later) is exact', () => {
  const linked = uids(applyFilters(SYNTHETIC, fromQuery({ test: 'team_corners' }), ctx));
  assert.deepEqual(linked, ['s1', 's2', 's4']);
  assert.deepEqual(uids(applyFilters(SYNTHETIC, fromQuery({ test: 'team_corner_rejects' }), ctx)), ['s3']);
  // The two together are every countable Sombra model team-corner row, with no overlap.
  assert.deepEqual(uids(applyFilters(SYNTHETIC, fromQuery({ test: 'team_corners,team_corner_rejects' }), ctx)), ['s1', 's2', 's3', 's4']);
  assert.deepEqual(testIdsOf(SYNTHETIC[0]), ['team_corners']);
});

test('test filter: URL round trip, unknown ids dropped, old URLs unchanged', () => {
  const f = { ...defaultFilters(), tests: ['team_corners', 'value'], tags: ['near_value'] };
  assert.equal(toQuery(f).test, 'team_corners,value');
  assert.deepEqual(fromQuery(toQuery(f)), f);
  assert.deepEqual(fromQuery({ test: 'team_corners,bogus,' }).tests, ['team_corners']);
  // An old URL or saved preset has no `test` key: everything parses as before.
  const old = fromQueryString('tag=near_value&price=le200&src=shadow');
  assert.deepEqual(old, { ...defaultFilters(), tags: ['near_value'], pricePreset: 'le200', sources: ['shadow'] });
  assert.deepEqual(old.tests, []);
  assert.ok(!toQueryString(old).includes('test='));
  // A state built without the field (older code) still filters.
  const legacy = { ...defaultFilters() };
  delete legacy.tests;
  assert.equal(applyFilters(data.picks, legacy, ctx).length, data.picks.length);
});

test('test filter: active chip, removal, count, saved preset query', () => {
  const f = fromQuery({ test: 'team_corners', src: 'shadow' });
  const entries = activeEntries(f);
  assert.deepEqual(entries.find((e) => e.field === 'tests'), { field: 'tests', value: 'team_corners' });
  assert.equal(entries.findIndex((e) => e.field === 'tests'), 1, 'right after source and tag');
  assert.equal(countActive(f), 2);
  const removed = removeEntry(f, { field: 'tests', value: 'team_corners' });
  assert.deepEqual(removed.tests, []);
  assert.equal(countActive(removed), 1);
  // Saved presets keep the query string; it parses back to the same state.
  assert.deepEqual(fromQueryString(toQueryString(f)), f);
});

test('test filter: options and facet counts (a pick can be in several tests)', () => {
  assert.ok(FACET_FIELDS.includes('tests'));
  const opts = filterOptions(data.picks);
  assert.deepEqual(opts.tests.map((o) => o.value), TEST_IDS.filter((id) => data.picks.some(testFilterEntry(id).member)), 'config order');
  for (const o of opts.tests) assert.equal(o.count, data.picks.filter(testFilterEntry(o.value).member).length, o.value);
  // Facets: each count is the rows the option would give under the other filters.
  const f = fromQuery({ test: 'cards_under', price: 'le200' });
  const c = facetCounts(data.picks, f, ctx);
  for (const x of ALL) {
    const n = applyFilters(data.picks, { ...f, tests: [x.id] }, ctx).length;
    assert.equal(c.tests[x.id] || 0, n, x.id);
  }
  assert.equal(c.total, applyFilters(data.picks, f, ctx).length);
  // Other facets see the test filter.
  assert.equal(Object.values(c.sources).reduce((a, b) => a + b, 0), c.total);
});

test('test filter: chip and section strings in both languages', async () => {
  const { entryLabel, optionLabel } = await import('../../src/lib/ui/filter-panel.js');
  for (const [lang, word] of [['es', 'Prueba'], ['en', 'Test']]) {
    loadAllStrings(lang);
    assert.equal(entryLabel({ field: 'tests', value: 'team_corners' }, defaultFilters()), `${word}: CÓRNERS EQUIPO (pasó todos los filtros)`);
    assert.equal(optionLabel('tests', 'value'), 'VALOR');
  }
});
