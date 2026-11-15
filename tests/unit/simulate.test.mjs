import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../../src/data/simulate.js';
import { mkPick } from './helpers/picks.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

const ps = [
  mkPick({ date: '2026-10-30', status: 'won', price: 2 }),
  mkPick({ date: '2026-11-01', status: 'lost', price: 2 }),
  mkPick({ date: '2026-11-02', status: 'lost', price: 3 }),
  mkPick({ date: '2026-11-03', status: 'won', price: 3 }),
  mkPick({ date: '2026-11-04', status: 'pending', price: 2 }),
  mkPick({ date: '2026-11-04', status: 'won', price: null }),
];

test('flat stakes: curve, totals, drawdown, streaks, months', () => {
  const r = simulate([...ps].reverse(), { stake: 2, bankroll: 50 });
  assert.deepEqual(r.points.map((p) => p.cum), [2, 0, -2, 2]);
  assert.equal(r.totals.n, 4);
  assert.equal(r.totals.pending, 1);
  assert.equal(r.totals.skipped, 1);
  assert.equal(r.totals.staked, 8);
  assert.equal(r.totals.profit, 2);
  near(r.totals.yield, 0.25);
  assert.equal(r.totals.finalBank, 52);
  assert.equal(r.totals.maxDrawdownU, 4);
  near(r.totals.maxDrawdownPct, 4 / 52);
  assert.equal(r.totals.longestLoss, 2);
  assert.deepEqual(r.perMonth.map((m) => [m.month, m.n, m.profit]), [['2026-10', 1, 2], ['2026-11', 3, 0]]);
});

test('percent of bankroll compounds on the current bank', () => {
  const r = simulate(ps, { mode: 'percent', percent: 10, bankroll: 100 });
  // 100 -> +10 (stake 10 at 2.0) = 110 -> -11 = 99 -> -9.9 = 89.1 -> +17.82 = 106.92
  near(r.totals.finalBank, 106.92);
  near(r.points[1].stake, 11);
});

test('empty input', () => {
  const r = simulate([]);
  assert.equal(r.points.length, 0);
  assert.equal(r.totals.yield, null);
  assert.equal(r.totals.maxDrawdownU, 0);
});
