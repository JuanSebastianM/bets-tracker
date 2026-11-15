// Analysis data (src/data/analysis.js): dimensions, bands, slices, sorting, two-way table, histogram,
// calibration and Brier, close splits and moves, the Pinnacle direction, and the Grok verdict classifier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkPick } from './helpers/picks.mjs';
import {
  PROB_BANDS, EV_BANDS, probBand, evBand, bandRange, monthEnd, DIMENSIONS, DIMENSION_IDS, dimension, withSlice, breakdown, sortRows,
  sortDefaultDir, twoWay, yieldInterval, histogram, measureDistribution, CLOSE_BINS, marketCloseProb, calibrationReport, CAL_SERIES,
  closeBySource, closeMoves, pinOutcome, pinProb, pinMove, pinnacleMoves, PIN_FLAT, grokVerdict, grokByVerdict, grokByMarket,
  grokTeamCorners, pickAgreement, grokScope, GROK_KINDS,
} from '../../src/data/analysis.js';
import { defaultFilters, applyFilters, toQueryString, fromQueryString } from '../../src/data/filters.js';
import { brier, summarize } from '../../src/data/stats.js';
import { normalizeFeed } from '../../src/data/normalize.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const fixture = normalizeFeed(JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8')));
const CTX = { today: '2026-11-15' };

// ---------------------------------------------------------------- bands

test('probability bands: lo inclusive, hi exclusive, 1 in the last band', () => {
  assert.equal(probBand(null), null);
  assert.equal(probBand(0), 'lt30');
  assert.equal(probBand(0.2999), 'lt30');
  assert.equal(probBand(0.3), '30_40');
  assert.equal(probBand(0.5), '50_60');
  assert.equal(probBand(0.6999), '60_70');
  assert.equal(probBand(0.7), 'ge70');
  assert.equal(probBand(1), 'ge70');
  assert.equal(probBand(1.2), null);
  assert.equal(PROB_BANDS.length, 6);
});

test('EV bands: negatives, exactly zero, edges and the open top', () => {
  assert.equal(evBand(-0.5), 'lt0');
  assert.equal(evBand(-0.0001), 'lt0');
  assert.equal(evBand(0), '0_3');
  assert.equal(evBand(0.0299), '0_3');
  assert.equal(evBand(0.03), '3_6');
  assert.equal(evBand(0.06), '6_10');
  assert.equal(evBand(0.1), '10_20');
  assert.equal(evBand(0.2), 'ge20');
  assert.equal(evBand(3), 'ge20');
  assert.equal(evBand(NaN), null);
  assert.equal(EV_BANDS.length, 6);
});

test('bandRange selects exactly the band through the inclusive filter ranges', () => {
  assert.deepEqual(bandRange(PROB_BANDS, 'lt30'), { min: null, max: 0.2999 });
  assert.deepEqual(bandRange(PROB_BANDS, '40_50'), { min: 0.4, max: 0.4999 });
  assert.deepEqual(bandRange(PROB_BANDS, 'ge70'), { min: 0.7, max: null });
  assert.deepEqual(bandRange(EV_BANDS, 'lt0'), { min: null, max: -0.0001 });
  assert.deepEqual(bandRange(EV_BANDS, '0_3'), { min: 0, max: 0.0299 });
  assert.deepEqual(bandRange(EV_BANDS, 'ge20'), { min: 0.2, max: null });
  assert.equal(bandRange(EV_BANDS, 'nope'), null);
  // Every fixture pick in a band is selected by its range, and no other.
  for (const [dimId, field, get] of [['probBand', 'prob', (p) => p.probModel], ['evBand', 'ev', (p) => p.ev]]) {
    const dim = dimension(dimId);
    for (const id of dim.order) {
      const f = { ...defaultFilters(), [field]: bandRange(dimId === 'probBand' ? PROB_BANDS : EV_BANDS, id) };
      const got = applyFilters(fixture.picks, f, CTX).map((p) => p.uid).sort();
      const want = fixture.picks.filter((p) => dim.key(p) === id && get(p) != null).map((p) => p.uid).sort();
      assert.deepEqual(got, want, `${dimId} ${id}`);
    }
  }
});

test('monthEnd', () => {
  assert.equal(monthEnd('2026-11'), '2026-11-30');
  assert.equal(monthEnd('2026-02'), '2026-02-28');
  assert.equal(monthEnd('2028-02'), '2028-02-29');
  assert.equal(monthEnd('2026-12'), '2026-12-31');
});

// ---------------------------------------------------------------- dimensions

test('every dimension groups picks by its key', () => {
  const p = mkPick({
    tag: 'value', market: 'goals', marketRaw: 'Goles', league: 'Liga Austral', books: ['Betano', 'Stake'], price: 2.1, date: '2026-11-04',
    probModel: 0.55, ev: 0.045, source: 'shadow',
    parsed: { ref: 'feed', sample: '10+', fuerza: 'keeps', filters: ['gap', 'ratio'] },
  });
  const keys = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d.key(p)]));
  assert.deepEqual(keys, {
    tag: 'value', market: 'goals', marketRaw: 'Goles', league: 'Liga Austral', book: ['Betano', 'Stake'], priceBand: '200_250',
    month: '2026-11', weekday: '3', probBand: '50_60', evBand: '3_6', ref: 'feed', sample: '10+', fuerza: 'keeps', reason: ['gap', 'ratio'],
    source: 'shadow',
  });
  const empty = mkPick({ books: [], price: null, probModel: null, ev: null, marketRaw: '', league: '' });
  for (const id of ['book', 'priceBand', 'probBand', 'evBand', 'sample', 'fuerza', 'reason', 'marketRaw', 'league']) {
    assert.equal(dimension(id).key(empty), null, id);
  }
  assert.equal(dimension('ref').key(empty), 'none');
  assert.equal(DIMENSION_IDS.length, 15);
  assert.equal(dimension('nope').id, 'tag');
});

test('breakdown: groups, multi-key picks, left-out count, verdict and yield interval', () => {
  const picks = [
    mkPick({ books: ['Betano'], price: 2, status: 'won' }),
    mkPick({ books: ['Betano', 'Stake'], price: 2, status: 'lost' }),
    mkPick({ books: [], price: 2, status: 'won' }),
  ];
  const { rows, left } = breakdown(picks, 'book');
  assert.equal(left, 1);
  assert.deepEqual(rows.map((r) => [r.key, r.summary.n]), [['Betano', 2], ['Stake', 1]]);
  const betano = rows[0];
  assert.equal(betano.summary.yield, 0);
  assert.equal(betano.verdict, 'none');
  assert.equal(betano.edge, 0.5 - 0.5);
  assert.ok(betano.yieldLo < 0 && betano.yieldHi > 0);
  assert.deepEqual(yieldInterval(summarize([])), { lo: null, hi: null });
});

test('breakdown on the fixture: every dimension adds up', () => {
  for (const d of DIMENSIONS) {
    const { rows, left } = breakdown(fixture.picks, d.id);
    const multi = ['book', 'reason'].includes(d.id);
    const total = rows.reduce((a, r) => a + r.count, 0);
    if (multi) assert.ok(total >= fixture.picks.length - left, d.id);
    else assert.equal(total + left, fixture.picks.length, d.id);
  }
});

test('withSlice adds one group to the current filters, and its link lands on exactly the group', () => {
  const f = { ...defaultFilters(), sources: ['shadow'], tags: ['value', 'near_value'], datePreset: '30d' };
  assert.deepEqual(withSlice(f, 'tag', 'value').tags, ['value']);
  assert.deepEqual(withSlice(f, 'tag', 'value').sources, ['shadow']);
  const m = withSlice(f, 'month', '2026-10');
  assert.equal(m.datePreset, null);
  assert.equal(m.dateFrom, '2026-10-01');
  assert.equal(m.dateTo, '2026-10-31');
  const pb = withSlice({ ...f, price: { min: 1.5, max: null } }, 'priceBand', '200_250');
  assert.equal(pb.pricePreset, '200_250');
  assert.deepEqual(pb.price, { min: null, max: null });
  assert.equal(withSlice(f, 'weekday', '3'), null);
  // Round trip through the URL and the filters for every linkable dimension on the fixture.
  for (const d of DIMENSIONS) {
    if (d.id === 'weekday') continue;
    const { rows } = breakdown(fixture.picks, d.id);
    for (const r of rows) {
      const next = fromQueryString(toQueryString(/** @type {any} */ (withSlice(defaultFilters(), d.id, r.key))));
      const got = applyFilters(fixture.picks, next, CTX).length;
      // 1.70 sits in both the ≤1.70 and the 1.70–2.00 presets of filters.js; priceBand puts it in ≤1.70.
      if (d.id === 'priceBand' && r.key === '170_200') assert.ok(got >= r.count, `${d.id} ${r.key}`);
      else assert.equal(got, r.count, `${d.id} ${r.key}`);
    }
  }
});

test('sortRows: natural order for bands and months, measures with nulls last, label', () => {
  const { rows } = breakdown(fixture.picks, 'priceBand');
  assert.deepEqual(rows.map((r) => r.key), ['lt170', '170_200', '200_250', '250_400', 'gt400'].filter((k) => rows.some((r) => r.key === k)));
  const months = breakdown(fixture.picks, 'month').rows.map((r) => r.key);
  assert.deepEqual(months, [...months].sort());
  const byYield = sortRows(breakdown(fixture.picks, 'tag').rows, 'yield', 'desc', 'tag');
  const ys = byYield.map((r) => r.summary.yield);
  const firstNull = ys.indexOf(null);
  const vals = firstNull < 0 ? ys : ys.slice(0, firstNull);
  assert.deepEqual(vals, [...vals].sort((a, b) => b - a));
  if (firstNull >= 0) assert.ok(ys.slice(firstNull).every((v) => v == null));
  const asc = sortRows(breakdown(fixture.picks, 'tag').rows, 'n', 'asc', 'tag').map((r) => r.summary.n);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const lab = sortRows(breakdown(fixture.picks, 'league').rows, 'label', 'asc', 'league').map((r) => r.key);
  assert.deepEqual(lab, [...lab].sort((a, b) => a.normalize('NFD').localeCompare(b.normalize('NFD'))));
  assert.equal(sortDefaultDir('natural'), 'asc');
  assert.equal(sortDefaultDir('ev'), 'desc');
});

test('twoWay: top groups of each dimension and per-cell summaries', () => {
  const t = twoWay(fixture.picks, 'tag', 'priceBand', { maxRows: 4, maxCols: 3 });
  assert.equal(t.rows.length, 4);
  assert.equal(t.cols.length, 3);
  for (const r of t.rows) {
    for (const c of t.cols) {
      const cell = t.cells[r][c];
      const want = fixture.picks.filter((p) => p.tag === r && dimension('priceBand').key(p) === c);
      if (!want.length) assert.equal(cell, null);
      else assert.equal(cell.count, want.length);
    }
  }
});

// ---------------------------------------------------------------- histogram

test('histogram: open outer bins, [lo, hi) inner bins, edges go up', () => {
  const bins = histogram([-0.5, -0.2, -0.19, 0, 0.0199, 0.02, 0.199, 0.2, 0.9, null, NaN], { min: -0.2, max: 0.2, step: 0.02 });
  assert.equal(bins.length, 22);
  assert.equal(bins[0].openLo, true);
  assert.equal(bins[0].n, 1); // −0.5
  assert.equal(bins[1].lo, -0.2);
  assert.equal(bins[1].n, 2); // −0.2, −0.19
  const at = (v) => bins.find((b) => !b.openLo && !b.openHi && b.lo === v);
  assert.equal(at(0).n, 2); // 0, 0.0199
  assert.equal(at(0.02).n, 1);
  assert.equal(at(0.18).n, 1); // 0.199
  assert.equal(bins[21].openHi, true);
  assert.equal(bins[21].n, 2); // 0.2, 0.9
  assert.equal(bins.reduce((a, b) => a + b.n, 0), 9);
});

test('measureDistribution: graded countable picks with the measure', () => {
  const picks = [
    mkPick({ fairCloseEv: 0.05 }),
    mkPick({ fairCloseEv: -0.03, status: 'pending' }),
    mkPick({ fairCloseEv: -0.25 }),
    mkPick({ fairCloseEv: 0.01, tag: 'published_bet' }),
  ];
  const d = measureDistribution(picks, (p) => p.fairCloseEv, CLOSE_BINS);
  assert.equal(d.bins.reduce((a, b) => a + b.n, 0), 2);
  assert.equal(d.stat.n, 2);
  assert.equal(d.bins[0].n, 1);
});

// ---------------------------------------------------------------- calibration

test('marketCloseProb is the de-vigged close behind fairCloseEv', () => {
  close(marketCloseProb(mkPick({ price: 2, fairCloseEv: 0.1 })), 0.55);
  assert.equal(marketCloseProb(mkPick({ price: 2, fairCloseEv: null })), null);
});

test('Brier on known cases', () => {
  const picks = [mkPick({ probModel: 0.8, status: 'won' }), mkPick({ probModel: 0.8, status: 'lost' }), mkPick({ probModel: 0.5, status: 'void' })];
  const b = brier(picks);
  assert.equal(b.n, 2);
  close(b.score, (0.04 + 0.64) / 2);
  assert.equal(brier([mkPick({ probModel: 1, status: 'won' })]).score, 0);
  assert.equal(brier([mkPick({ probModel: 0.5, status: 'won' }), mkPick({ probModel: 0.5, status: 'lost' })]).score, 0.25);
});

test('calibrationReport: series, overall rates and the paired market Brier', () => {
  const picks = [
    mkPick({ probModel: 0.6, probBlend: 0.58, price: 2, fairCloseEv: 0.0, status: 'won', tag: 'shadow' }), // market 0.5
    mkPick({ probModel: 0.6, probBlend: 0.62, price: 2, fairCloseEv: -0.2, status: 'lost', tag: 'shadow' }), // market 0.4
    mkPick({ probModel: 0.4, probBlend: 0.45, status: 'won', tag: 'value' }), // consensus row, no close
    mkPick({ probModel: 0.3, status: 'void' }),
  ];
  const m = calibrationReport(picks, 'model');
  assert.equal(m.n, 3);
  assert.equal(m.wins, 2);
  close(m.meanProb, (0.6 + 0.6 + 0.4) / 3);
  close(m.hitRate, 2 / 3);
  assert.equal(m.brier.n, 3);
  assert.equal(m.paired.n, 2);
  close(m.paired.series, (0.16 + 0.36) / 2);
  close(m.paired.market, (0.25 + 0.16) / 2);
  const blend = calibrationReport(picks, 'blend');
  assert.equal(blend.n, 2); // the VALOR row's blend column is the consensus probability
  const cons = calibrationReport(picks, 'consensus');
  assert.equal(cons.n, 1);
  close(cons.meanProb, 0.45);
  assert.equal(cons.paired.n, 0);
  assert.equal(cons.paired.series, null);
  assert.equal(calibrationReport(picks, 'ai').n, 0);
  assert.deepEqual(CAL_SERIES.map((s) => s.id), ['model', 'blend', 'consensus', 'ai']);
});

// ---------------------------------------------------------------- price against the close

test('closeBySource splits fair-close EV by own-book and feed closes', () => {
  const picks = [
    mkPick({ fairCloseEv: 0.02, closeSource: 'same_book' }),
    mkPick({ fairCloseEv: -0.04, closeSource: 'feed' }),
    mkPick({ fairCloseEv: -0.02, closeSource: 'feed' }),
  ];
  const [own, feed] = closeBySource(picks);
  assert.equal(own.key, 'same_book');
  assert.equal(own.stat.n, 1);
  assert.equal(feed.stat.n, 2);
  close(feed.stat.mean, -0.03);
});

test('closeMoves counts shortened, unchanged and drifted closes per market family', () => {
  const picks = [
    mkPick({ market: 'goals', clv: 0.05 }),
    mkPick({ market: 'goals', clv: 0 }),
    mkPick({ market: 'goals', clv: -0.02 }),
    mkPick({ market: 'goals', clv: -0.01, status: 'pending' }),
    mkPick({ market: 'result', clv: 0.01 }),
    mkPick({ market: 'shots', clv: null }),
  ];
  const rows = closeMoves(picks);
  assert.deepEqual(rows.map((r) => r.key), ['result', 'goals']);
  const g = rows[1];
  assert.deepEqual([g.n, g.shortened, g.flat, g.drifted], [3, 1, 1, 1]);
  close(g.clv.mean, 0.01);
});

// ---------------------------------------------------------------- Pinnacle

test('pinOutcome reads the side of 1X2, double chance and DNB picks', () => {
  const m = (marketRaw, selection) => pinOutcome(mkPick({ marketRaw, selection, match: 'Real Nébula vs Atlético Brisa' }));
  assert.equal(m('1X2', 'Real Nébula gana'), 'home');
  assert.equal(m('1X2', 'Atletico Brisa gana'), 'away');
  assert.equal(m('1X2', 'Empate'), 'draw');
  assert.equal(m('1X2 (pago anticipado 2 goles)', 'Real Nebula'), 'home');
  assert.equal(m('Doble oportunidad', '1X'), '1X');
  assert.equal(m('Doble oportunidad', 'Atlético Brisa o empate'), 'X2');
  assert.equal(m('Doble oportunidad', 'Real Nébula o Atlético Brisa'), '12');
  assert.equal(m('Empate no apuesta', 'Atlético Brisa'), 'dnb_away');
  assert.equal(m('1X2 1er tiempo', 'Real Nébula gana'), null);
  assert.equal(m('Goles', 'Over 2.5'), null);
  assert.equal(m('1X2', 'Otro equipo'), null);
});

test('pinProb de-vigs proportionally; pinMove gives the direction', () => {
  const triple = [2, 4, 4];
  close(pinProb(triple, 'home'), 0.5);
  close(pinProb(triple, 'draw'), 0.25);
  close(pinProb(triple, 'X2'), 0.5);
  close(pinProb(triple, 'dnb_home'), 2 / 3);
  assert.equal(pinProb([2, 0, 4], 'home'), null);
  const row = { row: 2, id: 'a', open_1: 2.1, open_x: 3.4, open_2: 3.6, last_1: 2.02, last_x: 3.45, last_2: 3.85 };
  const home = pinMove(row, 'home');
  assert.equal(home.direction, 'towards');
  assert.ok(home.delta > PIN_FLAT);
  assert.equal(pinMove(row, 'away').direction, 'away');
  assert.equal(pinMove({ ...row, last_1: 2.1, last_x: 3.4, last_2: 3.6 }, 'draw').direction, 'flat');
  assert.equal(pinMove({ ...row, last_1: null }, 'home'), null);
});

test('pinnacleMoves joins by pin id and counts directions on the fixture', () => {
  const r = pinnacleMoves(fixture.picks, fixture.pinnacle);
  assert.ok(r.withId > 1);
  assert.equal(r.joined, 1);
  assert.equal(r.rows[0].pick.uid, 'shadow:169');
  assert.equal(r.rows[0].outcome, 'home');
  assert.equal(r.rows[0].direction, 'towards'); // 2.10 / 3.40 / 3.60 → 2.02 / 3.45 / 3.85
  assert.equal(r.missing, r.withId - 1);
  assert.deepEqual(r.counts, { towards: 1, away: 0, flat: 0 });
});

// ---------------------------------------------------------------- Grok

test('grokVerdict classifies every shape of verdict text (fixture and the skill)', () => {
  // Every verdict text in the fixture.
  const texts = [...new Set(fixture.picks.filter((p) => p.source === 'grok').map((p) => String(p.extra.verdict ?? '')))];
  for (const v of texts) {
    const g = grokVerdict(v);
    if (!v) assert.deepEqual([g.kind, g.why], ['none', 'none']);
    else if (v.startsWith('No cotizado')) assert.deepEqual([g.kind, g.why], ['not_priced', 'not_modelled']);
    else {
      assert.equal(g.kind, 'priced', v);
      assert.equal(g.why, 'skip');
      assert.deepEqual(g.filters, ['gap']);
      assert.ok(g.model > 0.3 && g.market > 0.2);
    }
  }
  const s = grokVerdict('Cotizado: modelo 60.7% vs mercado 40.3% → SKIP: F-gap');
  close(s.model, 0.607);
  close(s.market, 0.403);
  // Shapes from the betting-analyst skill and the contract's inventory.
  const cases = [
    ['Cotizado (regla 29): consenso justo 8.8%', 'priced_rule29', 'other'],
    ['Cotizado (regla 29): VALOR Betano 2.15 vs justa 2.05 (+4.9%)', 'priced_rule29', 'value'],
    ['Cotizado (regla 29): VALOR CASI Stake 1.90 vs justa 1.88', 'priced_rule29', 'near_value'],
    ['Cotizado (regla 29): sin valor (−3.1% vs justa)', 'priced_rule29', 'no_value'],
    ['Cotizado (rule 29) → no value', 'priced_rule29', 'no_value'],
    ['Cotizado: model 55% vs market 50% → SHADOW', 'priced', 'shadow'],
    ['Cotizado: modelo 58% vs mercado 49% → SKIP: F-ratio; razor', 'priced', 'skip'],
    ['Cotizado: modelo 58% vs mercado 49% -> APUESTA 0.5u', 'priced', 'bet'],
    ['Cotizado: modelo 58% vs mercado 49%', 'priced', 'other'],
    ['No cotizado: F-sample (6 partidos)', 'not_priced', 'sample'],
    ['No cotizado: muestra corta', 'not_priced', 'sample'],
    ['No cotizado: mercado no leído en las casas', 'not_priced', 'not_read'],
    ['No cotizado: sin línea en Betano', 'not_priced', 'not_read'],
    ['No cotizado: sin referencia de dos lados (regla 22)', 'not_priced', 'no_reference'],
    ['No cotizado: partido de copa', 'not_priced', 'cup'],
    ['No cotizado', 'not_priced', 'other'],
    ['  no cotizado: market not modelled', 'not_priced', 'not_modelled'],
    ['Pendiente de revisar', 'none', 'none'],
  ];
  for (const [text, kind, why] of cases) assert.deepEqual([grokVerdict(text).kind, grokVerdict(text).why], [kind, why], text);
  assert.deepEqual(grokVerdict('Cotizado: modelo 58% vs mercado 49% → SKIP: F-ratio; razor').filters, ['ratio', 'razor']);
  assert.equal(grokVerdict(null).kind, 'none');
});

test('grokByVerdict groups Grok picks by kind with the reason split', () => {
  const g = (verdict, status = 'won', price = 2) => mkPick({ source: 'grok', extra: { verdict }, status, price });
  const picks = [
    g('Cotizado: modelo 50% vs mercado 40% → SKIP: F-gap', 'won'),
    g('Cotizado: modelo 50% vs mercado 40% → SHADOW', 'lost'),
    g('Cotizado (regla 29): VALOR Betano 2.1', 'won'),
    g('No cotizado: mercado no modelado por el script', 'lost'),
    g('No cotizado: muestra corta', 'pending'),
    g('', 'won'),
    mkPick({ source: 'shadow' }),
  ];
  const rows = grokByVerdict(picks);
  assert.deepEqual(rows.map((r) => [r.key, r.count]), [['priced', 2], ['priced_rule29', 1], ['not_priced', 2], ['none', 1]]);
  const priced = rows[0];
  assert.deepEqual(priced.why.map((w) => w.key), ['skip', 'shadow']);
  assert.equal(priced.summary.won, 1);
  const np = rows[2];
  assert.equal(np.summary.n, 1);
  assert.equal(np.summary.pending, 1);
  assert.deepEqual(GROK_KINDS, ['priced', 'priced_rule29', 'not_priced', 'none']);
  // Fixture: every Grok pick lands in exactly one kind.
  const fx = grokByVerdict(fixture.picks);
  assert.equal(fx.reduce((a, r) => a + r.count, 0), fixture.picks.filter((p) => p.source === 'grok').length);
});

test('grokByMarket groups Grok picks only', () => {
  const rows = grokByMarket(fixture.picks);
  assert.equal(rows.reduce((a, r) => a + r.count, 0), fixture.picks.filter((p) => p.source === 'grok').length);
});

test('pickAgreement and grokTeamCorners on shared matches', () => {
  const match = 'Club Lince vs Deportivo Faro';
  const tc = (source, selection, side, status = 'won', extra = {}) =>
    mkPick({ source, match, date: '2026-11-11', market: 'corners_team', marketRaw: 'Córners equipo', reviewClass: 'team_corners', selection, side, status, tag: source === 'shadow' ? 'team_corners' : 'grok_priced', ...extra });
  const g1 = tc('grok', 'Club Lince córners Over 4.5', 'over');
  const s1 = tc('shadow', 'Club Lince córners Over 4.5', 'over', 'won');
  const s2 = tc('shadow', 'Club Lince córners Over 5.5', 'over');
  const s3 = tc('shadow', 'Club Lince córners Under 4.5', 'under');
  const s4 = tc('shadow', 'Deportivo Faro córners Over 3.5', 'over');
  assert.equal(pickAgreement(g1, s1), 'same');
  assert.equal(pickAgreement(g1, s2), 'same_side');
  assert.equal(pickAgreement(g1, s3), 'opposite');
  assert.equal(pickAgreement(g1, s4), 'other_team');

  const g2 = tc('grok', 'Deportivo Faro córners Under 3.5', 'under', 'lost');
  const lone = mkPick({ source: 'grok', market: 'corners_team', reviewClass: 'team_corners', date: '2026-11-12', match: 'X vs Y', selection: 'X córners Over 3.5' });
  const sOnly = mkPick({ source: 'shadow', tag: 'team_corners', date: '2026-11-12', match: 'P vs Q', selection: 'P córners Over 4.5' });
  const r = grokTeamCorners([g1, g2, s1, s4, lone, sOnly, mkPick({ source: 'grok', market: 'goals' })]);
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].grok.length, 2);
  assert.equal(r.matches[0].sombra.length, 2);
  assert.deepEqual(r.agreement, { same: 1, same_side: 0, opposite: 1, other_team: 0 });
  assert.equal(r.grok.n, 3);
  assert.equal(r.sombra.n, 3);
  assert.equal(r.sharedGrok.n, 2);
  assert.equal(r.sharedSombra.n, 2);
  assert.equal(r.grokSince.n, 3);
  // The fixture has no match with both: the screen shows that, not a guess.
  assert.equal(grokTeamCorners(fixture.picks).matches.length, 0);
});

test('grokScope drops only the source and tag filters', () => {
  const f = { ...defaultFilters(), sources: ['shadow'], tags: ['value'], leagues: ['Liga Austral'] };
  const s = grokScope(f);
  assert.deepEqual(s.sources, []);
  assert.deepEqual(s.tags, []);
  assert.deepEqual(s.leagues, ['Liga Austral']);
});
