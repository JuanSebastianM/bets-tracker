// "If you had bet X on each of these": replays graded picks in date order with a staking plan.
// Works in units; money is only a display conversion (format.js + the user's own Settings).

import { flatProfit, drawdown, streaks, isCountable, isGraded, measureStat, monthOf, summarize } from './stats.js';
import { byDate } from './normalize.js';

/** @typedef {import('./types').Pick} Pick */

/**
 * @typedef {object} SimOptions
 * @property {'flat' | 'percent'} [mode]  flat units per pick, or a % of the current bankroll
 * @property {number} [stake]     units per pick (flat), default 1
 * @property {number} [percent]   % of the current bankroll per pick (percent mode), default 1
 * @property {number} [bankroll]  starting bankroll in units, default 100
 */

/**
 * @typedef {object} SimPoint
 * @property {number} i
 * @property {string} date
 * @property {string} uid
 * @property {number} stake
 * @property {number} profit
 * @property {number} cum      cumulative profit (units)
 * @property {number} bank     bankroll after the pick (units)
 */

/**
 * @param {Pick[]} picks any order; only countable graded picks with a price are replayed
 * @param {SimOptions} [opts]
 */
export function simulate(picks, opts = {}) {
  const mode = opts.mode || 'flat';
  const flatStake = opts.stake ?? 1;
  const pct = (opts.percent ?? 1) / 100;
  const start = opts.bankroll ?? 100;
  const used = picks.filter((p) => isCountable(p) && isGraded(p) && p.price != null).sort(byDate);
  const skipped = picks.filter((p) => isCountable(p) && isGraded(p) && p.price == null).length;
  const pending = picks.filter((p) => isCountable(p) && p.status === 'pending').length;

  /** @type {SimPoint[]} */
  const points = [];
  let bank = start;
  let cum = 0;
  let staked = 0;
  /** @type {Map<string, { month: string, picks: Pick[], staked: number, profit: number }>} */
  const months = new Map();
  used.forEach((p, i) => {
    const stake = mode === 'percent' ? Math.max(0, bank * pct) : flatStake;
    const profit = flatProfit(p, stake) ?? 0;
    cum += profit;
    bank += profit;
    staked += stake;
    points.push({ i, date: p.date, uid: p.uid, stake, profit, cum, bank });
    const key = monthOf(p);
    if (!months.has(key)) months.set(key, { month: key, picks: [], staked: 0, profit: 0 });
    const m = months.get(key);
    m.picks.push(p);
    m.staked += stake;
    m.profit += profit;
  });

  const dd = drawdown(points.map((x) => x.cum), start);
  const st = streaks(used);
  const rec = summarize(used);
  return {
    points,
    totals: {
      n: used.length,
      skipped,
      pending,
      staked,
      profit: cum,
      yield: staked ? cum / staked : null,
      startBank: start,
      finalBank: bank,
      roiOnBank: start ? cum / start : null,
      maxDrawdownU: dd.maxU,
      maxDrawdownPct: dd.maxPct,
      drawdownFrom: dd.from,
      drawdownTo: dd.to,
      longestWin: st.longestWin,
      longestLoss: st.longestLoss,
      won: rec.won,
      lost: rec.lost,
      void: rec.void,
      halfWon: rec.halfWon,
      halfLost: rec.halfLost,
      hitRate: rec.hitRate,
      avgPrice: rec.avgPrice,
      breakEven: rec.breakEven,
      fairCloseEv: measureStat(used, (p) => p.fairCloseEv),
    },
    perMonth: [...months.values()].map((m) => {
      const s = summarize(m.picks);
      return { month: m.month, n: s.n, won: s.won, lost: s.lost, void: s.void, staked: m.staked, profit: m.profit, yield: m.staked ? m.profit / m.staked : null };
    }),
  };
}
