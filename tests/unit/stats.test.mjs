import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatProfit, sheetProfit, summarize, clusterSe, plainSe, meanStat, drawdown, streaks, groupBy, calibration, brier, priceBand, winsForZ, weekdayOf } from '../../src/data/stats.js';
import { mkPick } from './helpers/picks.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('flat profit per status', () => {
  assert.equal(flatProfit(mkPick({ status: 'won', price: 2.5 }), 2), 3);
  assert.equal(flatProfit(mkPick({ status: 'lost' }), 2), -2);
  assert.equal(flatProfit(mkPick({ status: 'void' })), 0);
  assert.equal(flatProfit(mkPick({ status: 'half_won', price: 3 })), 1);
  assert.equal(flatProfit(mkPick({ status: 'half_lost' })), -0.5);
  assert.equal(flatProfit(mkPick({ status: 'pending' })), null);
  assert.equal(flatProfit(mkPick({ price: null })), null);
  assert.equal(sheetProfit(mkPick({ source: 'bets', status: 'lost', profitU: 0, stakeU: 1.25 })), 0, 'free bet: the sheet knows');
});

test('summarize: record, yield (voids staked), hit rate (halves 0.5), break-even, pending, unpriced', () => {
  const ps = [
    mkPick({ status: 'won', price: 2 }),
    mkPick({ status: 'lost', price: 2 }),
    mkPick({ status: 'void', price: 2 }),
    mkPick({ status: 'half_won', price: 3 }),
    mkPick({ status: 'pending', price: 2 }),
    mkPick({ status: 'won', price: null }),
    mkPick({ status: 'won', price: 2, tag: 'published_bet' }),
    mkPick({ status: 'other', price: 2 }),
  ];
  const s = summarize(ps);
  assert.equal(s.n, 4);
  assert.deepEqual([s.won, s.lost, s.void, s.halfWon], [1, 1, 1, 1]);
  assert.equal(s.pending, 1);
  assert.equal(s.unpriced, 1);
  assert.equal(s.staked, 4);
  near(s.profit, 1 - 1 + 0 + 1);
  near(s.yield, 0.25);
  near(s.hitRate, 1.5 / 2.5, 1e-9); // won 1 + half 0.5 over won + lost + half
  near(s.avgPrice, 2.25);
  near(s.breakEven, (0.5 * 3 + 1 / 3) / 4);
  const stake2 = summarize(ps, { stake: 2 });
  near(stake2.profit, 2);
  near(stake2.yield, 0.25);
});

test('summarize with the sheet profit uses each bet stake', () => {
  const ps = [mkPick({ source: 'bets', status: 'won', price: 2, stakeU: 2, profitU: 2 }), mkPick({ source: 'bets', status: 'lost', price: 2, stakeU: 1, profitU: -1 })];
  const s = summarize(ps, { profit: 'sheet' });
  assert.equal(s.staked, 3);
  assert.equal(s.profit, 1);
});

test('SE: plain (population SD / √n) and clustered by match (review.py formula)', () => {
  const xs = [1, -1, 1, -1];
  near(plainSe(xs), 1 / 2);
  // two clusters of two identical deviations: sqrt(2/1)*sqrt(2^2+2^2)/4
  const pairs = [['a', 1], ['a', 1], ['b', -1], ['b', -1]];
  near(clusterSe(pairs), Math.sqrt(2) * Math.sqrt(8) / 4);
  assert.equal(clusterSe([['a', 1], ['a', 2]]), null, 'one cluster: no SE');
  const m = meanStat([0.1, 0.2, -0.1], ['x', 'y', 'z']);
  near(m.mean, 0.2 / 3);
  near(m.lo, m.mean - 2 * m.se);
  near(m.z, m.mean / m.se);
  near(m.shareAbove, 2 / 3);
});

test('fair-close EV and CLV in the summary come from graded rows only, clustered by match', () => {
  const ps = [
    mkPick({ fairCloseEv: 0.05, clv: 0.1, match: 'M1' }),
    mkPick({ fairCloseEv: -0.01, clv: 0.02, match: 'M2' }),
    mkPick({ fairCloseEv: 0.5, status: 'pending' }),
  ];
  const s = summarize(ps);
  assert.equal(s.fairCloseEv.n, 2);
  near(s.fairCloseEv.mean, 0.02);
  assert.equal(s.clv.n, 2);
});

test('drawdown in units and as % of the bankroll; streaks', () => {
  const dd = drawdown([1, 3, 1, 0, 2, -1], 100);
  assert.equal(dd.maxU, 4);
  assert.equal(dd.from, 1);
  assert.equal(dd.to, 5);
  near(dd.maxPct, 4 / 103);
  const st = streaks(['won', 'won', 'void', 'won', 'lost', 'lost', 'won'].map((status) => mkPick({ status })));
  assert.equal(st.longestWin, 3);
  assert.equal(st.longestLoss, 2);
  assert.deepEqual(st.current, { kind: 'won', length: 1 });
});

test('groupBy, price bands, weekday', () => {
  const g = groupBy([mkPick({ tag: 'value' }), mkPick({ tag: 'value' }), mkPick({ tag: 'shadow' })], (p) => p.tag);
  assert.deepEqual(g.map((x) => [x.key, x.summary.n]), [['value', 2], ['shadow', 1]]);
  assert.deepEqual([1.5, 1.7, 1.71, 2.0, 2.3, 2.5, 4, 4.01, null].map(priceBand), ['lt170', '170_200', '170_200', '170_200', '200_250', '200_250', '250_400', 'gt400', null]);
  assert.equal(weekdayOf(mkPick({ date: '2026-11-15' })), 7);
});

test('calibration buckets and Brier', () => {
  const ps = [mkPick({ probModel: 0.55, status: 'won' }), mkPick({ probModel: 0.58, status: 'lost' }), mkPick({ probModel: 0.9, status: 'won' }), mkPick({ probModel: 0.3, status: 'void' })];
  const c = calibration(ps);
  const b = c.find((x) => x.lo === 0.5);
  assert.equal(b.n, 2);
  near(b.hitRate, 0.5);
  near(b.meanProb, 0.565);
  assert.equal(c[c.length - 1].n, 1);
  const br = brier(ps);
  assert.equal(br.n, 3);
  near(br.score, ((0.55 - 1) ** 2 + 0.58 ** 2 + 0.01) / 3);
});

test('wins needed for z = 2', () => {
  const w = winsForZ(30, 1.9);
  assert.ok(w > 15 && w <= 30);
  const pls = [...Array(w).fill(0.9), ...Array(30 - w).fill(-1)];
  const mean = pls.reduce((a, b) => a + b) / 30;
  assert.ok(mean / plainSe(pls) >= 2);
});
