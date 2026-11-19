// Round 2: the second audit's screen findings. Which measure each screen's stat uses, the date presets,
// the Over / Under filter, the real-bets sentences and drawdown, halves in words, the Simulator chance
// range, the Decisions month counts, the glossary aliases and the team-market slugs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setLocale } from '../../src/lib/i18n.js';
import { summarize, measureStat } from '../../src/data/stats.js';
import { applyFilters, defaultFilters, fromQuery, resolveDates, lastSlate, pendingSlate, lineSide, facetCounts, DATE_PRESETS } from '../../src/data/filters.js';
import {
  sourceSummary, reviewFairEv, shadowTagRows, shadowTagReviewEv, shadowMarketRows, realBetsExtras, realStakeShape, lastGradedSlate,
  pendingSlateLink, upcomingPending, picksInPeriod, periodFilter,
} from '../../src/data/overview.js';
import { simulate } from '../../src/data/simulate.js';
import { breakdown } from '../../src/data/analysis.js';
import { FROZEN_TESTS, PRICE_FIRST_TESTS, frozenProgress, priceFirstProgress } from '../../src/data/tests-config.js';
import { describeReviewEv, describeRealHitRate, describeSourceFull, describeRealBets } from '../../src/data/summaries.js';
import { monthCounts, groupByMonth, newestFirst } from '../../src/data/decisions.js';
import { formatRecord } from '../../src/lib/format.js';
import { spokenRecord } from '../../src/lib/spoken.js';
import { MARKET_SLUGS, GLOSSARY_ALIASES, resolveGlossarySlug } from '../../src/lib/glossary-links.js';
import { chanceText } from '../../src/features/simulator/sentences.js';
import { loadAllStrings } from './helpers/strings.mjs';
import { mkPick } from './helpers/picks.mjs';

loadAllStrings('es');
const both = (fn) => {
  setLocale('es');
  const es = fn();
  setLocale('en');
  const en = fn();
  setLocale('es');
  return { es, en };
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;

// ---------------------------------------------------------------- 1. one measure per name

/** Picks whose two measures differ, so a stat tells which one it was built from. */
function twoMeasures() {
  const price = [0.05, -0.02, 0.03, 0.01];
  const review = [-0.04, -0.06, 0.0, -0.01];
  return price.map((v, i) => mkPick({ tag: 'value', status: i % 2 ? 'lost' : 'won', price: 2, fairCloseEv: v, openingFairEv: review[i], hasTwoSidedClose: true, match: `M${i}` }));
}

test('every screen stat pins its measure: price vs close (fairCloseEv) or the reviewer\'s fair-close EV (openingFairEv)', () => {
  const ps = twoMeasures();
  const price = mean(ps.map((p) => p.fairCloseEv));
  const review = mean(ps.map((p) => p.openingFairEv));
  assert.notEqual(price, review);
  // Overview: source card (price), its secondary figure (review), tag and market rows (price), tag secondary (review).
  close(sourceSummary(ps, 'shadow').fairCloseEv.mean, price);
  close(reviewFairEv(ps).mean, review);
  close(shadowTagRows(ps)[0].summary.fairCloseEv.mean, price);
  close(shadowTagReviewEv(ps).value.mean, review);
  close(shadowMarketRows(ps)[0].summary.fairCloseEv.mean, price);
  // Explorer strip (summarize), Simulator, Analysis breakdown: price.
  close(summarize(ps).fairCloseEv.mean, price);
  close(simulate(ps, { mode: 'flat', stake: 1, bankroll: 100 }).totals.fairCloseEv.mean, price);
  close(breakdown(ps, 'tag').rows[0].summary.fairCloseEv.mean, price);
  // Frozen tests: price; VALOR and VALOR CASI: review.
  close(frozenProgress({ ...FROZEN_TESTS[0], match: () => true }, ps).ev.mean, price);
  const value = priceFirstProgress(PRICE_FIRST_TESTS.find((x) => x.id === 'value'), ps);
  assert.equal(value.measure, 'openingFairEv');
  close(value.all.ev.mean, review);
});

test('the review figure sentence names its measure, with n, in both languages; nothing without rows', () => {
  const e = reviewFairEv(twoMeasures());
  const s = both(() => describeReviewEv(e));
  assert.equal(s.es, 'EV justo (revisión), la cifra de las revisiones de Sombra: −2.8% (n 4).');
  assert.equal(s.en, 'Fair-close EV (review), the figure of the Sombra reviews: −2.8% (n 4).');
  assert.equal(describeReviewEv(reviewFairEv([])), '');
  const full = describeSourceFull('Sombra', summarize(twoMeasures()), 'too_early', { reviewEv: e });
  assert.match(full, /Precio vs cierre: \+1\.7% de media \(n 4\)\. .*EV justo \(revisión\), la cifra de las revisiones de Sombra: −2\.8% \(n 4\)\./);
});

// ---------------------------------------------------------------- 2–3. date presets

const slatePicks = () => [
  mkPick({ date: '2026-10-20', status: 'won' }),
  mkPick({ date: '2026-11-13', status: 'lost' }),
  mkPick({ date: '2026-11-14', status: 'pending' }),
  mkPick({ date: '2026-11-15', status: 'pending' }),
  mkPick({ date: '2026-11-16', status: 'pending' }),
  mkPick({ date: '2026-11-17', status: 'pending', tag: 'published_bet' }),
];
const ctx = { today: '2026-11-15' };

test('"last_slate" is the last graded slate everywhere, the same as the Overview; "pending_slate" the newest with pending picks', () => {
  const ps = slatePicks();
  assert.equal(lastSlate(ps), '2026-11-13');
  assert.equal(lastSlate(ps), lastGradedSlate(ps));
  assert.equal(pendingSlate(ps), '2026-11-16', 'a pending PUBLICADA Y APOSTADA row does not count');
  const f = (q) => applyFilters(ps, fromQuery(q), ctx).map((p) => p.date);
  assert.deepEqual(f({ date: 'last_slate' }), ['2026-11-13'], 'old URLs keep working, with the new meaning');
  assert.deepEqual(f({ date: 'pending_slate' }), ['2026-11-16']);
  assert.ok(DATE_PRESETS.includes('pending_slate'));
  // The Overview's last slate and the Explorer's preset select the same picks.
  assert.deepEqual(picksInPeriod(ps, 'last_slate', ctx).map((p) => p.uid), applyFilters(ps, fromQuery({ date: 'last_slate' }), ctx).map((p) => p.uid));
  assert.deepEqual(periodFilter('last_slate', ps), { slate: '2026-11-13' });
  // The panel's counts know the new preset.
  assert.equal(facetCounts(ps, defaultFilters(), ctx).datePresets.pending_slate, 1);
  assert.equal(facetCounts(ps, defaultFilters(), ctx).datePresets.last_slate, 1);
});

test('rolling periods bound only the start: upcoming slates stay in', () => {
  const ps = slatePicks();
  assert.deepEqual(resolveDates({ ...defaultFilters(), datePreset: '7d' }, ctx), ['2026-11-09', null]);
  assert.deepEqual(resolveDates({ ...defaultFilters(), datePreset: 'this_month' }, ctx), ['2026-11-01', null]);
  const dates = applyFilters(ps, fromQuery({ date: '7d' }), ctx).map((p) => p.date);
  assert.deepEqual(dates, ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']);
  // The Overview's pending count over 7 days now sees tomorrow's picks.
  assert.equal(sourceSummary(picksInPeriod(ps, '7d', ctx), 'shadow').pending, 3);
});

// ---------------------------------------------------------------- 12. Over / Under only on picks with a line

test('the Over / Under filter skips picks without a line ("X con más córners" keeps side over for review.py)', () => {
  const most = mkPick({ source: 'grok', marketRaw: 'Córners 1X2', market: 'corners_team', selection: 'Local con más córners', side: 'over', lineKey: null });
  const total = mkPick({ source: 'grok', marketRaw: 'Córners equipo', market: 'corners_team', selection: 'Local over 4.5', side: 'over', line: 4.5, lineKey: 'corners_team:over:4.5' });
  const under = mkPick({ selection: 'Under 9.5', side: 'under', line: 9.5, lineKey: 'corners:under:9.5' });
  assert.equal(lineSide(most), '');
  assert.deepEqual(applyFilters([most, total, under], fromQuery({ side: 'over' }), ctx), [total]);
  assert.deepEqual(applyFilters([most, total, under], fromQuery({ side: 'over,under' }), ctx), [total, under]);
  assert.equal(facetCounts([most, total, under], defaultFilters(), ctx).sides.over, 1);
  assert.equal(most.side, 'over', 'the parsed side is unchanged');
});

// ---------------------------------------------------------------- 5–6. real bets

const bet = (date, profitU, stakeU = 1, extra = {}, status = profitU > 0 ? 'won' : 'lost') =>
  mkPick({ source: 'bets', tag: 'bet', date, profitU, stakeU, status, price: 2, extra });

test('real bets: the worst drop is measured on the same daily series as the chart', () => {
  // Day 1: +3 then −2.5 (intra-day dip of 2.5 in sheet order); day 2: +1. Per day: +0.5, +1.5: no drop.
  const x = realBetsExtras([bet('2026-11-01', 3), bet('2026-11-01', -2.5), bet('2026-11-02', 1)], 50);
  assert.deepEqual(x.days.map((d) => d.cum), [0.5, 1.5]);
  assert.equal(x.maxDrawdownU, 0);
  assert.equal(x.currentDrawdownU, 0);
  const y = realBetsExtras([bet('2026-11-01', 2), bet('2026-11-02', -3), bet('2026-11-03', 0.5)]);
  close(y.maxDrawdownU, 3);
  close(y.currentDrawdownU, 2.5);
  assert.equal(both(() => describeRealBets(y)).es, 'Las apuestas reales van −0.50u, 2.50u por debajo de su mejor punto (+2.00u).');
});

test('real bets: hit rate said without a flat break-even when stakes differ or a free bet is in', () => {
  const s = (bets) => summarize(bets, { profit: 'sheet' });
  const even = [1, -1, 1, -1, -1].map((u, i) => bet(`2026-11-0${i + 1}`, u));
  assert.deepEqual(realStakeShape(even), { freeBets: 0, uneven: false });
  assert.match(describeRealHitRate(s(even), realStakeShape(even)), /que necesita para no perder/, 'equal stakes: the flat comparison is right');
  const uneven = [bet('2026-11-01', 3, 3), bet('2026-11-02', -1), bet('2026-11-03', -1), bet('2026-11-04', -1), bet('2026-11-05', 1)];
  const r1 = both(() => describeRealHitRate(s(uneven), realStakeShape(uneven)));
  assert.equal(r1.es, 'Acierta 40.0% (n 5). Con stakes distintos, el resultado en unidades no sale solo del acierto: una apuesta grande o a cuota alta pesa más que varias pequeñas, así que no se compara con un acierto mínimo.');
  assert.match(r1.en, /^Hits 40\.0% \(n 5\)\. With different stakes/);
  assert.doesNotMatch(r1.es, /necesita/);
  const free1 = [...even.slice(0, 4), bet('2026-11-09', 1, 1, { freeBet: 1 })];
  const f1 = both(() => describeRealHitRate(s(free1), realStakeShape(free1)));
  assert.match(f1.es, /Hubo 1 apuesta gratis, que no arriesga stake/);
  assert.match(f1.en, /There was 1 free bet, which risks no stake/);
  const free2 = [...uneven.slice(0, 3), bet('2026-11-08', 1, 1, { freeBet: 1 }), bet('2026-11-09', 1, 1, { freeBet: 1 })];
  const f2 = both(() => describeRealHitRate(s(free2), realStakeShape(free2)));
  assert.match(f2.es, /Con stakes distintos y 2 apuestas gratis \(que no arriesgan stake\)/);
  assert.match(f2.en, /With different stakes and 2 free bets \(which risk no stake\)/);
  // Under five graded: no rate at all; nothing graded or all pending: the record sentence says so.
  assert.equal(describeRealHitRate(s(uneven.slice(0, 3)), realStakeShape(uneven)), '');
  const pending = [bet('2026-11-20', null, 1, {}, 'pending'), bet('2026-11-20', null, 2, {}, 'pending')];
  const p = both(() => describeSourceFull('Apuestas', s(pending), 'none', { shape: realStakeShape(pending) }));
  assert.equal(p.es, 'Apuestas: todavía sin picks calificados.');
  assert.equal(p.en, 'Apuestas: no graded picks yet.');
  const one = both(() => describeSourceFull('Apuestas', s([bet('2026-11-01', 1)]), 'none', { shape: { freeBets: 0, uneven: false } }));
  assert.match(one.es, /en 1 calificada\./);
  assert.match(one.en, /over 1 graded\./);
});

// ---------------------------------------------------------------- 10. halves in words

test('half results in words, visible and spoken, both languages', () => {
  const r = both(() => [formatRecord({ won: 3, lost: 2, void: 1, halfWon: 1 }), formatRecord({ won: 3, lost: 2, void: 0, halfWon: 2, halfLost: 1 })]);
  assert.deepEqual(r.es, ['3-2-1 (+1 media)', '3-2 (+3 medias)']);
  assert.deepEqual(r.en, ['3-2-1 (+1 half)', '3-2 (+3 halves)']);
  const sp = both(() => spokenRecord({ won: 3, lost: 2, void: 0, halfWon: 2, halfLost: 1 }));
  assert.equal(sp.es, '3 ganadas, 2 perdidas, 2 medio ganadas, 1 medio perdida');
  assert.equal(sp.en, '3 won, 2 lost, 2 half won, 1 half lost');
});

// ---------------------------------------------------------------- 7. Simulator chance range

test('Simulator: no chance range from one pick or from picks that all returned the same', () => {
  const won = (i) => mkPick({ status: 'won', price: 2, match: `S${i}` });
  const same = simulate([won(1), won(2), won(3)], { mode: 'flat', stake: 1, bankroll: 100 }).totals;
  const r = both(() => chanceText(same));
  assert.equal(r.es, 'Todos los picks dieron lo mismo por unidad: sin variación todavía no hay rango por azar que estimar.');
  assert.equal(r.en, 'Every pick returned the same per unit: with no variation there is no chance range to estimate yet.');
  assert.equal(chanceText(simulate([won(1)], { mode: 'flat', stake: 1, bankroll: 100 }).totals), 'Con tan pocos picks no hay rango por azar.');
  assert.equal(chanceText(simulate([], { mode: 'flat', stake: 1, bankroll: 100 }).totals), 'Con tan pocos picks no hay rango por azar.');
  const mixed = simulate([won(1), mkPick({ status: 'lost', price: 2 }), won(3)], { mode: 'flat', stake: 1, bankroll: 100 }).totals;
  assert.match(chanceText(mixed), /^Rango por azar \(±2 EE\): de −?\+?\d/);
});

// ---------------------------------------------------------------- 4. Decisions month counts

test('Decisions: a month split across pages still counts the whole month under the filters', () => {
  const ds = Array.from({ length: 70 }, (_, i) => ({ row: i + 2, date: i < 44 ? `2026-11-${String((i % 28) + 1).padStart(2, '0')}` : `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, topic: 't', decision: '', evidence: '', review: '', status: 'Vigente' }));
  const ordered = newestFirst(/** @type {any} */ (ds));
  const counts = monthCounts(ordered);
  assert.equal(counts.get('2026-11'), 44);
  assert.equal(counts.get('2026-10'), 26);
  const firstPage = groupByMonth(ordered.slice(0, 25));
  assert.equal(firstPage[0].items.length, 25, 'the page shows 25 of November');
});

// ---------------------------------------------------------------- 9. pending links

test('a pending slate link says how many picks the Explorer will show (a pending PUBLICADA Y APOSTADA twin included)', () => {
  const ps = slatePicks();
  ps.push(mkPick({ date: '2026-11-16', status: 'pending', tag: 'published_bet' }));
  const group = upcomingPending(ps, '2026-11-15').find((g) => g.date === '2026-11-16');
  const link = pendingSlateLink(ps, '2026-11-16');
  assert.equal(group.picks.length, 1);
  assert.equal(link.count, 2);
  assert.equal(applyFilters(ps, link.filter, ctx).length, link.count);
});

// ---------------------------------------------------------------- 1, 11. glossary

test('glossary: one entry per measure with a worked example, the old slug opens price vs close, team markets have their own entries', () => {
  const root = resolve(import.meta.dirname, '../..');
  for (const lang of ['es', 'en']) {
    const g = JSON.parse(readFileSync(join(root, `src/content/glossary.${lang}.json`), 'utf8'));
    const by = new Map(g.entries.map((e) => [e.slug, e]));
    for (const slug of ['price-vs-close', 'fair-ev-review']) {
      assert.ok(by.get(slug)?.example, `${lang} ${slug} has a worked example`);
      assert.ok(by.get(slug).related.includes(slug === 'price-vs-close' ? 'fair-ev-review' : 'price-vs-close'), 'each points at the other');
    }
    assert.equal(by.has('fair-close-ev'), false, 'the old slug is an alias, not an entry');
    for (const [old, to] of Object.entries(GLOSSARY_ALIASES)) assert.ok(by.has(to) && !by.has(old), `${old} → ${to}`);
    assert.deepEqual(by.get('corners-team').covers.markets, ['corners_team']);
    assert.deepEqual(by.get('cards-team').covers.markets, ['cards_team']);
  }
  assert.equal(resolveGlossarySlug('fair-close-ev'), 'price-vs-close');
  assert.equal(resolveGlossarySlug('clv'), 'clv');
  // No two market families share an entry, so a line of market links never drops one (TagGlossaryLinks dedupes by slug).
  const slugs = Object.values(MARKET_SLUGS);
  assert.equal(new Set(slugs).size, slugs.length);
});
