// The Simulator engine (src/data/simulate.js): staking modes, same-day ordering, compounding, Kelly,
// drawdown and streaks, time under water, the expected-by-close line, and the URL round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulate, fairProbOf, kellyFraction, kellyStake, underwater, dailySeries, alignDaily, breakdown, closeVerdictOf,
  stakingFromQuery, stakingToQuery, defaultStaking, scenariosFromQuery, simulatorQueryString, scenarioQueryString,
  parseQueryString, hasStaking, compareTotals, daysBetween, SIM_QUERY_KEYS,
} from '../../src/data/simulate.js';
import { defaultFilters, toQuery } from '../../src/data/filters.js';
import { mkPick } from './helpers/picks.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('flat: voids and half results', () => {
  const r = simulate([
    mkPick({ date: '2026-11-01', status: 'void', price: 2 }),
    mkPick({ date: '2026-11-02', status: 'half_won', price: 3 }),
    mkPick({ date: '2026-11-03', status: 'half_lost', price: 1.8 }),
  ], { stake: 2 });
  assert.deepEqual(r.points.map((p) => p.profit), [0, 2, -1]);
  assert.equal(r.totals.staked, 6); // voids count as staked
  near(r.totals.yield, 1 / 6);
  assert.equal(r.totals.void, 1);
  assert.equal(r.totals.halfWon, 1);
  assert.equal(r.totals.halfLost, 1);
});

test('percent: same-day picks are staked on the bankroll at the start of that day', () => {
  const r = simulate([
    mkPick({ date: '2026-11-01', status: 'won', price: 2, row: 1 }),
    mkPick({ date: '2026-11-01', status: 'lost', price: 2, row: 2 }),
    mkPick({ date: '2026-11-02', status: 'won', price: 2, row: 3 }),
  ], { mode: 'percent', percent: 10, bankroll: 100 });
  // day 1: both stakes 10 (bank 100 at the start of the day) -> +10 −10 = 100; day 2: stake 10 -> 110
  assert.deepEqual(r.points.map((p) => p.stake), [10, 10, 10]);
  assert.deepEqual(r.points.map((p) => p.dayBank), [100, 100, 100]);
  near(r.totals.finalBank, 110);
});

test('percent: compounding across days', () => {
  const r = simulate([
    mkPick({ date: '2026-11-01', status: 'won', price: 2 }),
    mkPick({ date: '2026-11-02', status: 'won', price: 2 }),
    mkPick({ date: '2026-11-03', status: 'lost', price: 2 }),
  ], { mode: 'percent', percent: 50, bankroll: 100 });
  // 100 -> 150 -> 225 -> 112.5
  assert.deepEqual(r.points.map((p) => p.stake), [50, 75, 112.5]);
  near(r.totals.finalBank, 112.5);
  near(r.totals.profit, 12.5);
});

test('as staked: real bets use the sheet stake and profit, Grok his stake, Sombra is left out', () => {
  const r = simulate([
    mkPick({ source: 'bets', uid: 'bets:2', date: '2026-11-01', status: 'won', price: 2, stakeU: 0.5, profitU: 0.4 }),
    mkPick({ source: 'grok', uid: 'grok:2', date: '2026-11-02', status: 'won', price: 3, stakeU: 1.5 }),
    mkPick({ source: 'shadow', date: '2026-11-03', status: 'lost', price: 2 }),
  ], { mode: 'staked' });
  assert.deepEqual(r.points.map((p) => [p.stake, p.profit]), [[0.5, 0.4], [1.5, 3]]);
  assert.equal(r.totals.noStake, 1);
  near(r.totals.profit, 3.4);
});

test('fair probability: blend, else 1 / fair price, else the model', () => {
  assert.equal(fairProbOf(mkPick({ probBlend: 0.4, fairOdds: 2, probModel: 0.6 })), 0.4);
  assert.equal(fairProbOf(mkPick({ fairOdds: 2.5, probModel: 0.6 })), 0.4);
  assert.equal(fairProbOf(mkPick({ probModel: 0.6 })), 0.6);
  assert.equal(fairProbOf(mkPick({})), null);
});

test('Kelly: fraction, cap, negative edge staked 0, picks without probability left out', () => {
  near(kellyFraction(0.55, 2), 0.1);
  assert.equal(kellyFraction(0.4, 2), 0);
  // 1/4 Kelly of 0.1 on 100 = 2.5, capped at 2
  assert.equal(kellyStake(mkPick({ probBlend: 0.55, price: 2 }), 100), 2);
  near(kellyStake(mkPick({ probBlend: 0.55, price: 2 }), 40), 1);
  const r = simulate([
    mkPick({ date: '2026-11-01', status: 'won', price: 2, probBlend: 0.55 }),
    mkPick({ date: '2026-11-01', status: 'lost', price: 2, probBlend: 0.4 }), // no edge
    mkPick({ date: '2026-11-02', status: 'lost', price: 2 }), // no probability
    mkPick({ date: '2026-11-03', status: 'lost', price: 2, probBlend: 0.55 }),
  ], { mode: 'kelly', bankroll: 40, kellyFraction: 0.25, kellyCap: 2 });
  assert.equal(r.totals.noProb, 1);
  assert.equal(r.totals.zeroStake, 1);
  assert.equal(r.totals.n, 2);
  near(r.points[0].stake, 1);
  near(r.points[1].stake, 0.25 * 0.1 * 41); // bank 41 at the start of day 3
});

test('drawdown, streaks, best and worst day on a known sequence', () => {
  const seq = ['won', 'won', 'lost', 'lost', 'lost', 'won', 'void', 'won'];
  const r = simulate(seq.map((status, i) => mkPick({ date: `2026-11-0${i + 1}`, status, price: 2 })), { stake: 1, bankroll: 10 });
  assert.deepEqual(r.points.map((p) => p.cum), [1, 2, 1, 0, -1, 0, 0, 1]);
  assert.equal(r.totals.maxDrawdownU, 3);
  near(r.totals.maxDrawdownPctStart, 0.3);
  assert.equal(r.totals.longestLoss, 3);
  assert.equal(r.totals.longestWin, 2);
  assert.deepEqual(r.totals.bestDay, { date: '2026-11-01', profit: 1, n: 1 });
  assert.equal(r.totals.worstDay.profit, -1);
  // under water from the peak on 11-02 to the end (still below 2)
  assert.equal(r.totals.underwater.longestDays, 6);
  assert.equal(r.totals.underwater.ongoing, true);
  assert.equal(r.totals.underwater.picksUnder, 6);
});

test('underwater: recovered stretch, and days between dates', () => {
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  const u = underwater([
    { date: '2026-11-01', cum: -1 },
    { date: '2026-11-04', cum: -2 },
    { date: '2026-11-05', cum: 0.5 },
  ]);
  assert.deepEqual([u.longestDays, u.longestPicks, u.from, u.to, u.ongoing], [4, 2, '2026-11-01', '2026-11-05', false]);
  assert.equal(underwater([]).share, null);
});

test('expected by the close: stake × fair-close EV over picks with a two-sided close, ± 2 SE, and the verdict', () => {
  const r = simulate([
    mkPick({ date: '2026-11-01', status: 'won', price: 2, fairCloseEv: -0.05, match: 'A' }),
    mkPick({ date: '2026-11-02', status: 'won', price: 2, fairCloseEv: -0.02, match: 'B' }),
    mkPick({ date: '2026-11-03', status: 'lost', price: 2, match: 'C' }),
  ], { stake: 2 });
  const c = r.totals.closeCheck;
  assert.equal(c.n, 2);
  near(c.coverage, 2 / 3);
  near(c.expected, -0.14);
  assert.equal(c.actual, 4);
  assert.ok(c.se > 0 && c.lo < c.expected && c.hi > c.expected);
  near(r.points[2].expectedCum, -0.14);
  assert.equal(closeVerdictOf(c), 'lucky');
  assert.equal(closeVerdictOf({ n: 0, expected: null, actual: null, lo: null }), 'no_close');
  assert.equal(closeVerdictOf({ n: 5, expected: 2, actual: 3, lo: 0.5 }), 'backed');
  assert.equal(closeVerdictOf({ n: 5, expected: 2, actual: 3, lo: -0.5 }), 'backed_weak');
  assert.equal(closeVerdictOf({ n: 5, expected: 2, actual: -3, lo: -1 }), 'unlucky');
  assert.equal(closeVerdictOf({ n: 5, expected: -2, actual: -3, lo: -4 }), 'deserved');
});

test('chance range: ± 2 SE of the summed profit', () => {
  const r = simulate([
    mkPick({ date: '2026-11-01', status: 'won', price: 2 }),
    mkPick({ date: '2026-11-02', status: 'lost', price: 2 }),
  ]);
  // profits +1, −1: SD 1, SE of the mean 1/√2, SE of the sum √2
  near(r.totals.profitSe, Math.SQRT2);
  near(r.totals.chanceHi, 2 * Math.SQRT2);
});

test('empty and all-pending sets', () => {
  const e = simulate([]);
  assert.equal(e.totals.n, 0);
  assert.equal(e.totals.bestDay, null);
  assert.equal(e.totals.closeCheck.expected, null);
  assert.equal(e.totals.profitSe, null);
  const p = simulate([mkPick({ status: 'pending', price: 2 }), mkPick({ status: 'pending', price: 3 })], { stake: 0.5 });
  assert.equal(p.totals.n, 0);
  assert.equal(p.totals.pending, 2);
  assert.equal(p.totals.pendingStake, 1);
  assert.equal(p.points.length, 0);
});

test('pending stake follows the mode', () => {
  const ps = [mkPick({ status: 'pending', price: 2, probBlend: 0.55 }), mkPick({ status: 'pending', price: 2 })];
  assert.equal(simulate(ps, { mode: 'percent', percent: 2, bankroll: 50 }).totals.pendingStake, 2);
  const k = simulate(ps, { mode: 'kelly', bankroll: 40 }).totals;
  assert.equal(k.pendingCounted, 1);
  near(k.pendingStake, 1);
});

test('daily series, two replays on one date axis, breakdown by a key', () => {
  const a = simulate([
    mkPick({ date: '2026-11-01', status: 'won', price: 2, tag: 'value' }),
    mkPick({ date: '2026-11-01', status: 'lost', price: 2, tag: 'value' }),
    mkPick({ date: '2026-11-03', status: 'won', price: 3, tag: 'near_value' }),
  ]);
  assert.deepEqual(dailySeries(a.points).map((d) => [d.date, d.n, d.profit, d.cum]), [['2026-11-01', 2, 0, 0], ['2026-11-03', 1, 2, 2]]);
  const b = simulate([mkPick({ date: '2026-11-02', status: 'lost', price: 2 })]);
  assert.deepEqual(alignDaily(a, b), { dates: ['2026-11-01', '2026-11-02', '2026-11-03'], a: [0, 0, 2], b: [0, -1, -1] });
  const rows = breakdown(a.points, (p) => p.tag);
  assert.deepEqual(rows.map((r) => [r.key, r.n, r.won, r.lost, r.profit]), [['value', 2, 1, 1, 0], ['near_value', 1, 1, 0, 2]]);
});

test('staking in the URL: defaults omitted, invalid values fall back, round trip', () => {
  const d = defaultStaking({ stake: 0.5 });
  assert.deepEqual(stakingToQuery(d, d), {});
  const s = { ...d, mode: /** @type {const} */ ('kelly'), kellyFraction: 0.5, kellyCap: 1, bankroll: 80 };
  const q = stakingToQuery(s, d);
  assert.deepEqual(q, { mode: 'kelly', kf: '0.5', kcap: '1', bank: '80' });
  assert.deepEqual(stakingFromQuery(q, d), s);
  assert.deepEqual(stakingFromQuery({ mode: 'nope', stake: '-1', pct: '500', kf: '3' }, d), d);
  for (const k of SIM_QUERY_KEYS) assert.ok(!(k in toQuery({ ...defaultFilters(), q: 'x', tags: ['value'] })), k);
});

test('scenarios A and B in one query string, and saved scenarios', () => {
  const d = defaultStaking();
  const a = { filters: { ...defaultFilters(), tags: ['value'], pricePreset: 'le200' }, staking: { ...d, stake: 2 } };
  const b = { filters: { ...defaultFilters(), tags: ['value'] }, staking: { ...d, mode: /** @type {const} */ ('kelly') } };
  const qs = simulatorQueryString(a, b, d);
  assert.equal(qs, 'tag=value&price=le200&stake=2&b=tag%3Dvalue%26mode%3Dkelly');
  const back = scenariosFromQuery(parseQueryString(qs), d);
  assert.deepEqual(back.a, a);
  assert.deepEqual(back.b, b);
  assert.equal(scenariosFromQuery({}, d).b, null);
  assert.equal(simulatorQueryString(a, null, d), scenarioQueryString(a, d));
  assert.equal(scenarioQueryString({ filters: a.filters, staking: d }, d, { explicit: true }), 'tag=value&price=le200&mode=flat&stake=1&bank=100');
  assert.equal(hasStaking('tag=value&stake=2'), true);
  assert.equal(hasStaking('tag=value'), false);
});

test('comparison B − A', () => {
  const ta = simulate([mkPick({ status: 'won', price: 2 })]).totals;
  const tb = simulate([mkPick({ status: 'lost', price: 2 }), mkPick({ status: 'lost', price: 2 })]).totals;
  const c = compareTotals(ta, tb);
  assert.equal(c.n, 1);
  assert.equal(c.profit, -3);
  assert.equal(c.longestLoss, 2);
});
