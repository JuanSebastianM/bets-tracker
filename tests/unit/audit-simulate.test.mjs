// Audit (docs/BUILD_LOG.md, "Independent audit"): the Simulator's staking modes, drawdown and streaks on small
// sequences computed by hand. Synthetic picks only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, kellyStake } from '../../src/data/simulate.js';
import { drawdown, streaks, summarize } from '../../src/data/stats.js';
import { mkPick } from './helpers/picks.mjs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** won @2.5, lost @1.9, void @2.0, half_won @1.8, half_lost @2.2, won @1.5, on three days. */
function seq() {
  return [
    mkPick({ date: '2026-11-01', row: 10, price: 2.5, status: 'won' }),
    mkPick({ date: '2026-11-01', row: 11, price: 1.9, status: 'lost' }),
    mkPick({ date: '2026-11-02', row: 12, price: 2.0, status: 'void' }),
    mkPick({ date: '2026-11-02', row: 13, price: 1.8, status: 'half_won' }),
    mkPick({ date: '2026-11-03', row: 14, price: 2.2, status: 'half_lost' }),
    mkPick({ date: '2026-11-03', row: 15, price: 1.5, status: 'won' }),
  ];
}

test('audit: flat 2u on voids and halves, by hand', () => {
  const t = simulate(seq(), { mode: 'flat', stake: 2 }).totals;
  // +3, −2, 0, +0.8, −1, +1 = +1.8 on 12u staked
  close(t.profit, 1.8);
  close(t.staked, 12);
  close(t.yield, 0.15);
  assert.equal(t.n, 6);
  // cum: 3, 1, 1, 1.8, 0.8, 1.8 → worst fall from the peak 3 is 2.2 (to 0.8)
  close(t.maxDrawdownU, 2.2);
  // the same picks give the same totals in summarize at 2u
  const s = summarize(seq(), { stake: 2 });
  close(s.profit, t.profit);
  close(s.staked, t.staked);
  // hit rate: wins 1 + 0.5 + 1 = 2.5, losses 1 + 0.5 = 1.5
  close(s.hitRate, 2.5 / 4);
});

test('audit: percent mode stakes the bankroll at the start of each day, whatever the order inside the day', () => {
  const a = simulate(seq(), { mode: 'percent', percent: 10, bankroll: 100 }).totals;
  // day 1: stake 10 each: +15, −10 → 105. day 2: stake 10.5: 0, +4.2 → 109.2. day 3: stake 10.92: −5.46, +5.46 → 109.2
  close(a.profit, 9.2);
  close(a.finalBank, 109.2);
  close(a.staked, 10 + 10 + 10.5 + 10.5 + 10.92 + 10.92);
  // swapping the two picks of a day (row order) changes nothing
  const b = seq();
  [b[0].row, b[1].row] = [b[1].row, b[0].row];
  close(simulate(b, { mode: 'percent', percent: 10, bankroll: 100 }).totals.profit, 9.2);
});

test('audit: Kelly with a fraction and a cap, by hand', () => {
  // prob 0.6 at 2.0: full Kelly (1·0.6 − 0.4)/1 = 0.2; quarter Kelly on 100u = 5u, capped at 2u
  const p = mkPick({ price: 2.0, probBlend: 0.6, status: 'won' });
  close(/** @type {number} */ (kellyStake(p, 100, { kellyFraction: 0.25, kellyCap: 2 })), 2);
  close(/** @type {number} */ (kellyStake(p, 100, { kellyFraction: 0.25, kellyCap: 10 })), 5);
  // no edge (prob 0.4 at 2.0) → 0 stake, the pick is skipped and counted
  const q = mkPick({ date: '2026-11-02', price: 2.0, probBlend: 0.4, status: 'lost' });
  const t = simulate([p, q], { mode: 'kelly', kellyFraction: 0.25, kellyCap: 2, bankroll: 100 }).totals;
  assert.equal(t.n, 1);
  assert.equal(t.zeroStake, 1);
  close(t.profit, 2);
});

test('audit: staked mode replays each pick at its own stake (Apuestas profit from the sheet)', () => {
  const bets = [
    mkPick({ source: 'bets', uid: 'bets:2', row: 2, price: 3, stakeU: 1.5, profitU: 3, status: 'won' }),
    // a free bet that lost: the sheet records 0, not −stake
    mkPick({ source: 'bets', uid: 'bets:3', row: 3, price: 3.1, stakeU: 1.25, profitU: 0, status: 'lost' }),
  ];
  const t = simulate(bets, { mode: 'staked' }).totals;
  close(t.profit, 3);
  close(t.staked, 2.75);
});

test('audit: drawdown and streaks on known sequences', () => {
  // peak 0 at the start: −1, −2 → drawdown 2 from the start; then +3 (peak 1), −1.5 → 2.5 from peak 1
  const dd = drawdown([-1, -2, 1, -1.5], 100);
  close(dd.maxU, 2.5);
  assert.equal(dd.from, 2);
  assert.equal(dd.to, 3);
  close(/** @type {number} */ (dd.maxPct), 2.5 / 101);
  const st = streaks(['won', 'won', 'void', 'won', 'lost', 'half_lost', 'lost', 'lost', 'won'].map((s) => mkPick({ status: s })));
  assert.equal(st.longestWin, 3, 'a void does not break a run');
  assert.equal(st.longestLoss, 3, 'a half loss does not break a run');
  assert.deepEqual(st.current, { kind: 'won', length: 1 });
});
