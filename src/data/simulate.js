// "If you had bet X on each of these": replays graded picks in date order with a staking plan.
// Works in units; money is only a display conversion (format.js + the user's own Settings).
//
// Staking modes:
//   flat     the same number of units on every pick
//   percent  a % of the bankroll, compounding; same-day picks are staked on the bankroll at the start
//            of that day (they are placed before any of them settles)
//   staked   "as staked": real bets use the sheet's stake and the sheet's own profit (Ganancia (u));
//            Grok uses his suggested stake; picks without a stake (Sombra) are left out
//   kelly    fractional Kelly from the logged fair probability and the price, capped in units, on the
//            bankroll at the start of the day; picks without a probability are left out and picks
//            with no edge get stake 0 (not placed)

import { flatProfit, sheetProfit, drawdown, streaks, isCountable, isGraded, measureStat, meanStat, plainSe, matchKey, monthOf, summarize } from './stats.js';
import { byDate } from './normalize.js';
import { fromQuery, toQueryString } from './filters.js';

/** @typedef {import('./types').Pick} Pick */
/** @typedef {import('./filters.js').FilterState} FilterState */

/** @typedef {'flat' | 'percent' | 'staked' | 'kelly'} StakeMode */

/** The staking modes, in display order. */
export const STAKE_MODES = /** @type {StakeMode[]} */ (['flat', 'percent', 'staked', 'kelly']);

/** Quick stakes offered as chips in flat mode (units). */
export const QUICK_STAKES = [0.25, 0.5, 1, 2];

/** Defaults of every staking option (the screen overrides stake and bankroll from Settings). */
export const STAKE_DEFAULTS = Object.freeze({ mode: /** @type {StakeMode} */ ('flat'), stake: 1, percent: 1, bankroll: 100, kellyFraction: 0.25, kellyCap: 2 });

/**
 * @typedef {object} SimOptions
 * @property {StakeMode} [mode]   default 'flat'
 * @property {number} [stake]     units per pick (flat), default 1
 * @property {number} [percent]   % of the bankroll at the start of the day per pick (percent), default 1
 * @property {number} [bankroll]  starting bankroll in units, default 100
 * @property {number} [kellyFraction] fraction of full Kelly (kelly), default 0.25
 * @property {number} [kellyCap]  most units on one pick (kelly), default 2
 */

/**
 * @typedef {object} SimPoint
 * @property {number} i
 * @property {string} date
 * @property {string} uid
 * @property {Pick} pick
 * @property {number} stake
 * @property {number} profit
 * @property {number} cum       cumulative profit (units)
 * @property {number} bank      bankroll after the pick (units)
 * @property {number} dayBank   bankroll at the start of the pick's day (the base of percent and Kelly stakes)
 * @property {number | null} expected stake × fair-close EV (null without a two-sided close)
 * @property {number} expectedCum cumulative expected profit by the close (picks without one add 0)
 */

/**
 * The fair probability a pick was logged with: the blend (for VALOR rows the consensus fair
 * probability), else 1 / fair price, else the model probability. null when none is usable.
 * @param {Pick} p
 */
export function fairProbOf(p) {
  const ok = (/** @type {number | null} */ x) => x != null && Number.isFinite(x) && x > 0 && x < 1;
  if (ok(p.probBlend)) return /** @type {number} */ (p.probBlend);
  if (p.fairOdds != null && Number.isFinite(p.fairOdds) && p.fairOdds > 1) return 1 / p.fairOdds;
  if (ok(p.probModel)) return /** @type {number} */ (p.probModel);
  return null;
}

/**
 * Full-Kelly fraction of the bankroll for a bet at decimal `price` with win probability `prob`:
 * (b·p − q) / b with b = price − 1. 0 when there is no edge.
 * @param {number} prob @param {number} price
 */
export function kellyFraction(prob, price) {
  const b = price - 1;
  if (!(b > 0) || !(prob > 0)) return 0;
  const f = (b * prob - (1 - prob)) / b;
  return f > 0 ? f : 0;
}

/**
 * Kelly stake in units: fraction × full Kelly × bankroll, capped at `cap` and at the bankroll.
 * null when the pick has no usable probability or price.
 * @param {Pick} p @param {number} bank @param {{ kellyFraction?: number, kellyCap?: number }} [o]
 */
export function kellyStake(p, bank, o = {}) {
  const prob = fairProbOf(p);
  if (prob == null || p.price == null) return null;
  const frac = o.kellyFraction ?? STAKE_DEFAULTS.kellyFraction;
  const cap = o.kellyCap ?? STAKE_DEFAULTS.kellyCap;
  const s = frac * kellyFraction(prob, p.price) * Math.max(0, bank);
  return Math.max(0, Math.min(s, cap, Math.max(0, bank)));
}

/** Calendar days from a to b ('YYYY-MM-DD'). @param {string} a @param {string} b */
export function daysBetween(a, b) {
  const d = (/** @type {string} */ s) => {
    const [y, m, dd] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((d(b) - d(a)) / 86400000);
}

/**
 * Time under water of a curve: the longest stretch below a previous peak (the start, 0, is the first
 * peak), in calendar days from the peak's date to the date it was recovered (or the last date when
 * it is still under), and the share of picks that ended below the peak.
 * @param {Array<{ date: string, cum: number }>} points chronological
 */
export function underwater(points) {
  const eps = 1e-9;
  let peak = 0;
  let peakDate = points.length ? points[0].date : null;
  let peakIdx = -1;
  let under = 0;
  let best = { days: 0, picks: 0, from: /** @type {string | null} */ (null), to: /** @type {string | null} */ (null), ongoing: false };
  points.forEach((pt, i) => {
    if (pt.cum >= peak - eps) {
      if (i - peakIdx > 1) {
        const days = daysBetween(/** @type {string} */ (peakDate), pt.date);
        const picks = i - peakIdx - 1;
        if (days > best.days || (days === best.days && picks > best.picks)) best = { days, picks, from: peakDate, to: pt.date, ongoing: false };
      }
      peak = Math.max(peak, pt.cum);
      peakDate = pt.date;
      peakIdx = i;
    } else under++;
  });
  const last = points.length - 1;
  if (last > peakIdx) {
    const days = daysBetween(/** @type {string} */ (peakDate), points[last].date);
    const picks = last - peakIdx;
    if (days > best.days || (days === best.days && picks > best.picks)) best = { days, picks, from: peakDate, to: points[last].date, ongoing: true };
  }
  return { longestDays: best.days, longestPicks: best.picks, from: best.from, to: best.to, ongoing: best.ongoing, picksUnder: under, share: points.length ? under / points.length : null };
}

/**
 * One row per day of a replay: picks, staked, profit, cumulative profit and expected-by-close at the end of the day.
 * @param {SimPoint[]} points
 */
export function dailySeries(points) {
  /** @type {Array<{ date: string, n: number, staked: number, profit: number, cum: number, expectedCum: number, bank: number }>} */
  const out = [];
  for (const pt of points) {
    let d = out[out.length - 1];
    if (!d || d.date !== pt.date) {
      d = { date: pt.date, n: 0, staked: 0, profit: 0, cum: 0, expectedCum: 0, bank: 0 };
      out.push(d);
    }
    d.n++;
    d.staked += pt.stake;
    d.profit += pt.profit;
    d.cum = pt.cum;
    d.expectedCum = pt.expectedCum;
    d.bank = pt.bank;
  }
  return out;
}

/**
 * Two replays on one date axis (the union of their days); each cumulative value is carried forward
 * from its last day (0 before its first pick).
 * @param {{ points: SimPoint[] }} a @param {{ points: SimPoint[] }} b
 */
export function alignDaily(a, b) {
  const da = new Map(dailySeries(a.points).map((d) => [d.date, d.cum]));
  const db = new Map(dailySeries(b.points).map((d) => [d.date, d.cum]));
  const dates = [...new Set([...da.keys(), ...db.keys()])].sort();
  let ca = 0;
  let cb = 0;
  const va = [];
  const vb = [];
  for (const d of dates) {
    if (da.has(d)) ca = /** @type {number} */ (da.get(d));
    if (db.has(d)) cb = /** @type {number} */ (db.get(d));
    va.push(ca);
    vb.push(cb);
  }
  return { dates, a: va, b: vb };
}

/**
 * The simulated result broken down by a key (tag, market family, price band…): record from the
 * replayed picks, staked and profit from the replay's own stakes. Largest first.
 * @template {string} K
 * @param {SimPoint[]} points
 * @param {(p: Pick) => K | null} key
 */
export function breakdown(points, key) {
  /** @type {Map<K, SimPoint[]>} */
  const m = new Map();
  for (const pt of points) {
    const k = key(pt.pick);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    /** @type {SimPoint[]} */ (m.get(k)).push(pt);
  }
  return [...m.entries()]
    .map(([k, pts]) => {
      const s = summarize(pts.map((x) => x.pick));
      const staked = pts.reduce((a, x) => a + x.stake, 0);
      const profit = pts.reduce((a, x) => a + x.profit, 0);
      return { key: k, n: pts.length, won: s.won, lost: s.lost, void: s.void, halfWon: s.halfWon, halfLost: s.halfLost, avgPrice: s.avgPrice, staked, profit, yield: staked ? profit / staked : null };
    })
    .sort((x, y) => y.n - x.n || y.staked - x.staked);
}

/**
 * Replay a set of picks with a staking plan.
 * @param {Pick[]} picks any order; only countable graded picks with a price are replayed
 * @param {SimOptions} [opts]
 */
export function simulate(picks, opts = {}) {
  const mode = opts.mode || 'flat';
  const flatStake = opts.stake ?? STAKE_DEFAULTS.stake;
  const pct = (opts.percent ?? STAKE_DEFAULTS.percent) / 100;
  const start = opts.bankroll ?? STAKE_DEFAULTS.bankroll;
  const kOpts = { kellyFraction: opts.kellyFraction ?? STAKE_DEFAULTS.kellyFraction, kellyCap: opts.kellyCap ?? STAKE_DEFAULTS.kellyCap };
  const countable = picks.filter(isCountable);
  const graded = countable.filter((p) => isGraded(p) && p.price != null).sort(byDate);
  const skipped = countable.filter((p) => isGraded(p) && p.price == null).length;
  const pendingPicks = countable.filter((p) => p.status === 'pending');
  const hasStake = (/** @type {Pick} */ p) => p.stakeU != null && p.stakeU > 0;

  let noStake = 0;
  let noProb = 0;
  let zeroStake = 0;
  /** @type {Pick[]} */
  let candidates = graded;
  if (mode === 'staked') {
    candidates = graded.filter(hasStake);
    noStake = graded.length - candidates.length;
  } else if (mode === 'kelly') {
    candidates = graded.filter((p) => fairProbOf(p) != null);
    noProb = graded.length - candidates.length;
  }

  /** @type {SimPoint[]} */
  const points = [];
  /** @type {Pick[]} */
  const used = [];
  let bank = start;
  let dayBank = start;
  let day = '';
  let cum = 0;
  let staked = 0;
  let expectedCum = 0;
  /** @type {Map<string, { month: string, picks: Pick[], staked: number, profit: number }>} */
  const months = new Map();
  for (const p of candidates) {
    if (p.date !== day) {
      day = p.date;
      dayBank = bank;
    }
    let stake;
    if (mode === 'percent') stake = Math.max(0, dayBank * pct);
    else if (mode === 'staked') stake = /** @type {number} */ (p.stakeU);
    else if (mode === 'kelly') stake = /** @type {number} */ (kellyStake(p, dayBank, kOpts));
    else stake = flatStake;
    if (mode === 'kelly' && !(stake > 0)) {
      zeroStake++;
      continue;
    }
    const profit = (mode === 'staked' ? sheetProfit(p) : flatProfit(p, stake)) ?? 0;
    const expected = p.fairCloseEv != null && Number.isFinite(p.fairCloseEv) ? stake * p.fairCloseEv : null;
    cum += profit;
    bank += profit;
    staked += stake;
    if (expected != null) expectedCum += expected;
    points.push({ i: points.length, date: p.date, uid: p.uid, pick: p, stake, profit, cum, bank, dayBank, expected, expectedCum });
    used.push(p);
    const key = monthOf(p);
    if (!months.has(key)) months.set(key, { month: key, picks: [], staked: 0, profit: 0 });
    const m = /** @type {{ month: string, picks: Pick[], staked: number, profit: number }} */ (months.get(key));
    m.picks.push(p);
    m.staked += stake;
    m.profit += profit;
  }

  const dd = drawdown(points.map((x) => x.cum), start);
  const st = streaks(used);
  const rec = summarize(used);
  const days = dailySeries(points);
  let bestDay = null;
  let worstDay = null;
  for (const d of days) {
    if (!bestDay || d.profit > bestDay.profit) bestDay = { date: d.date, profit: d.profit, n: d.n };
    if (!worstDay || d.profit < worstDay.profit) worstDay = { date: d.date, profit: d.profit, n: d.n };
  }
  const n = points.length;
  const se1 = plainSe(points.map((x) => x.profit));
  const profitSe = se1 == null ? null : se1 * n;
  const withClose = points.filter((x) => x.expected != null);
  const ce = meanStat(withClose.map((x) => /** @type {number} */ (x.expected)), withClose.map((x) => matchKey(x.pick)));
  const ceN = withClose.length;
  const closeCheck = {
    n: ceN,
    coverage: n ? ceN / n : null,
    expected: ceN ? /** @type {number} */ (ce.mean) * ceN : null,
    se: ce.se == null ? null : ce.se * ceN,
    lo: ce.lo == null ? null : ce.lo * ceN,
    hi: ce.hi == null ? null : ce.hi * ceN,
    actual: ceN ? withClose.reduce((a, x) => a + x.profit, 0) : null,
    staked: withClose.reduce((a, x) => a + x.stake, 0),
  };

  // Units at stake in the pending picks, with the plan as it stands after the last graded pick.
  let pendingStake = 0;
  let pendingCounted = 0;
  for (const p of pendingPicks) {
    let s = null;
    if (mode === 'percent') s = Math.max(0, bank * pct);
    else if (mode === 'staked') s = hasStake(p) ? p.stakeU : null;
    else if (mode === 'kelly') s = kellyStake(p, bank, kOpts);
    else s = flatStake;
    if (s == null) continue;
    pendingCounted++;
    pendingStake += s;
  }

  return {
    points,
    days,
    totals: {
      mode,
      n,
      skipped,
      noStake,
      noProb,
      zeroStake,
      pending: pendingPicks.length,
      pendingStake,
      pendingCounted,
      staked,
      profit: cum,
      yield: staked ? cum / staked : null,
      profitSe,
      chanceLo: profitSe == null ? null : cum - 2 * profitSe,
      chanceHi: profitSe == null ? null : cum + 2 * profitSe,
      startBank: start,
      finalBank: bank,
      roiOnBank: start ? cum / start : null,
      maxDrawdownU: dd.maxU,
      maxDrawdownPct: dd.maxPct,
      maxDrawdownPctStart: start ? dd.maxU / start : null,
      drawdownFrom: dd.from,
      drawdownTo: dd.to,
      longestWin: st.longestWin,
      longestLoss: st.longestLoss,
      bestDay,
      worstDay,
      underwater: underwater(points),
      won: rec.won,
      lost: rec.lost,
      void: rec.void,
      halfWon: rec.halfWon,
      halfLost: rec.halfLost,
      hitRate: rec.hitRate,
      avgPrice: rec.avgPrice,
      avgStake: n ? staked / n : null,
      breakEven: rec.breakEven,
      fairCloseEv: measureStat(used, (p) => p.fairCloseEv),
      closeCheck,
    },
    perMonth: [...months.values()].map((m) => {
      const s = summarize(m.picks);
      return {
        month: m.month, n: s.n, won: s.won, lost: s.lost, void: s.void, halfWon: s.halfWon, halfLost: s.halfLost,
        staked: m.staked, profit: m.profit, yield: m.staked ? m.profit / m.staked : null,
      };
    }),
  };
}

/** @typedef {ReturnType<typeof simulate>} SimResult */

/**
 * What the close says about the result, as one case for one honest sentence. Compares, over the
 * picks that have a two-sided close, the profit made with the profit the same stakes were worth at
 * the closing price (± 2 SE).
 *   no_close     no replayed pick has a two-sided close
 *   lucky        won, but the price was not worth anything against the close
 *   backed       won, and the close says the price was worth it (lower bound above 0)
 *   backed_weak  won, the close leans the same way but its range still includes 0
 *   unlucky      lost, but the close says the price was worth something
 *   deserved     lost, and the price was not worth anything against the close either
 * @param {SimResult['totals']['closeCheck']} c
 */
export function closeVerdictOf(c) {
  if (!c.n || c.expected == null || c.actual == null) return 'no_close';
  if (c.actual > 0) {
    if (c.expected <= 0) return 'lucky';
    return c.lo != null && c.lo > 0 ? 'backed' : 'backed_weak';
  }
  return c.expected > 0 ? 'unlucky' : 'deserved';
}

// ---------------------------------------------------------------- staking in the URL

/**
 * @typedef {object} Staking
 * @property {StakeMode} mode
 * @property {number} stake
 * @property {number} percent
 * @property {number} bankroll
 * @property {number} kellyFraction
 * @property {number} kellyCap
 */

/** Query keys of the staking options (none collides with a filter key). */
export const STAKING_KEYS = /** @type {const} */ ({ mode: 'mode', stake: 'stake', percent: 'pct', bankroll: 'bank', kellyFraction: 'kf', kellyCap: 'kcap' });

/** Query key that holds scenario B (its whole query string). */
export const SCENARIO_B_KEY = 'b';

/** Keys the Simulator adds to the filter query. */
export const SIM_QUERY_KEYS = [...Object.values(STAKING_KEYS), SCENARIO_B_KEY];

/** @param {Partial<Staking>} [over] @returns {Staking} */
export function defaultStaking(over = {}) {
  return { ...STAKE_DEFAULTS, ...over };
}

const posNum = (/** @type {unknown} */ s) => {
  if (s == null || s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * Staking options from a query object; missing or invalid values take `defaults`.
 * Percent is kept within (0, 100], the Kelly fraction within (0, 1].
 * @param {Record<string, string>} q @param {Staking} [defaults]
 * @returns {Staking}
 */
export function stakingFromQuery(q = {}, defaults = defaultStaking()) {
  const mode = STAKE_MODES.includes(/** @type {StakeMode} */ (q[STAKING_KEYS.mode])) ? /** @type {StakeMode} */ (q[STAKING_KEYS.mode]) : defaults.mode;
  const pct = posNum(q[STAKING_KEYS.percent]);
  const kf = posNum(q[STAKING_KEYS.kellyFraction]);
  return {
    mode,
    stake: posNum(q[STAKING_KEYS.stake]) ?? defaults.stake,
    percent: pct != null && pct <= 100 ? pct : defaults.percent,
    bankroll: posNum(q[STAKING_KEYS.bankroll]) ?? defaults.bankroll,
    kellyFraction: kf != null && kf <= 1 ? kf : defaults.kellyFraction,
    kellyCap: posNum(q[STAKING_KEYS.kellyCap]) ?? defaults.kellyCap,
  };
}

/**
 * Query object of the staking options: the mode, the options that mode uses, and the bankroll
 * (every mode reports drawdown as a % of it), each only when it differs from `defaults` (all of them
 * with `explicit`, for saved scenarios that must not change when Settings change).
 * @param {Staking} s @param {Staking} [defaults] @param {{ explicit?: boolean }} [opts]
 * @returns {Record<string, string>}
 */
export function stakingToQuery(s, defaults = defaultStaking(), opts = {}) {
  /** @type {Record<string, string>} */
  const q = {};
  const put = (/** @type {keyof Staking} */ k) => {
    if (opts.explicit || s[k] !== defaults[k]) q[STAKING_KEYS[k]] = String(s[k]);
  };
  put('mode');
  if (s.mode === 'flat') put('stake');
  if (s.mode === 'percent') put('percent');
  if (s.mode === 'kelly') {
    put('kellyFraction');
    put('kellyCap');
  }
  put('bankroll');
  return q;
}

/**
 * @typedef {object} Scenario
 * @property {FilterState} filters
 * @property {Staking} staking
 */

/**
 * Query string of one scenario: the filter keys first (the same string the Explorer uses), then the staking.
 * @param {Scenario} sc @param {Staking} [defaults] @param {{ explicit?: boolean }} [opts]
 */
export function scenarioQueryString(sc, defaults, opts) {
  const st = Object.entries(stakingToQuery(sc.staking, defaults, opts)).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return [toQueryString(sc.filters), ...st].filter(Boolean).join('&');
}

/** A query string ('a=1&b=2') as a query object. @param {string} qs */
export function parseQueryString(qs) {
  /** @type {Record<string, string>} */
  const q = {};
  for (const [k, v] of new URLSearchParams(String(qs || '').replace(/^[?#]/, ''))) q[k] = v;
  return q;
}

/**
 * Scenario A, and B when the query has one (`b` holds B's own query string).
 * @param {Record<string, string>} q @param {Staking} [defaults]
 * @returns {{ a: Scenario, b: Scenario | null }}
 */
export function scenariosFromQuery(q = {}, defaults) {
  const a = { filters: fromQuery(q), staking: stakingFromQuery(q, defaults) };
  const bq = q[SCENARIO_B_KEY] ? parseQueryString(q[SCENARIO_B_KEY]) : null;
  const b = bq ? { filters: fromQuery(bq), staking: stakingFromQuery(bq, defaults) } : null;
  return { a, b };
}

/**
 * The Simulator's whole query string: scenario A, then B (encoded in `b`) when there is one.
 * @param {Scenario} a @param {Scenario | null} b @param {Staking} [defaults]
 */
export function simulatorQueryString(a, b, defaults) {
  const qa = scenarioQueryString(a, defaults);
  if (!b) return qa;
  const qb = scenarioQueryString(b, defaults);
  return [qa, `${SCENARIO_B_KEY}=${encodeURIComponent(qb || 'mode=flat')}`].filter(Boolean).join('&');
}

/** True when a saved query carries staking options (a saved scenario rather than a plain filter). @param {string} qs */
export function hasStaking(qs) {
  const q = parseQueryString(qs);
  return Object.values(STAKING_KEYS).some((k) => k in q);
}

/**
 * Differences between two replays for the comparison table (B − A).
 * @param {SimResult['totals']} a @param {SimResult['totals']} b
 */
export function compareTotals(a, b) {
  const d = (/** @type {number | null} */ x, /** @type {number | null} */ y) => (x == null || y == null ? null : y - x);
  return {
    n: b.n - a.n,
    staked: b.staked - a.staked,
    profit: b.profit - a.profit,
    yield: d(a.yield, b.yield),
    maxDrawdownU: b.maxDrawdownU - a.maxDrawdownU,
    longestLoss: b.longestLoss - a.longestLoss,
    avgPrice: d(a.avgPrice, b.avgPrice),
    finalBank: b.finalBank - a.finalBank,
  };
}
