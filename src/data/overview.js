// Figures behind the Overview screen (#/): the period switch, the per-tag verdict, the last slate,
// what is pending, what changed since the last visit and the real-bets extras. Pure functions on
// Pick[]; every rate and mean still comes from stats.js (summarize, measureStat, drawdown).

import { summarize, groupBy, isCountable, isGraded, sheetProfit, flatProfit, drawdown, mean } from './stats.js';
import { applyFilters, defaultFilters } from './filters.js';
import { byDate } from './normalize.js';
import { groupByLine } from './lines.js';

/** @typedef {import('./types').Pick} Pick */
/** @typedef {import('./types').Source} Source */
/** @typedef {import('./stats.js').Summary} Summary */
/** @typedef {import('./stats.js').MeanStat} MeanStat */
/** @typedef {import('./filters.js').FilterState} FilterState */

export const SOURCES = /** @type {Source[]} */ (['bets', 'shadow', 'grok']);

// ---------------------------------------------------------------- period

/** Periods of the Overview switch, in display order. 'all' is the default (no query key). */
export const PERIODS = /** @type {const} */ (['all', '30d', '7d', 'last_slate']);
/** @typedef {typeof PERIODS[number]} Period */

/**
 * The period in a route query (`#/?date=7d`). The key is the filters' own `date`, so a link from the
 * Overview carries the same window to the Explorer and the Simulator.
 * @param {Record<string, string>} [query]
 * @returns {Period}
 */
export function periodFromQuery(query = {}) {
  const v = query.date;
  return /** @type {any} */ (PERIODS).includes(v) ? /** @type {Period} */ (v) : 'all';
}

/** Query object for a period ({} for 'all'). @param {Period} period */
export const periodQuery = (period) => (period === 'all' ? {} : { date: period });

/**
 * Latest slate (match date) that has at least one graded countable pick. "Last slate" on the
 * Overview means this, not the newest date in the sheet, which is usually today's slate, all pending.
 * @param {Pick[]} picks
 */
export function lastGradedSlate(picks) {
  let last = null;
  for (const p of picks) if (isCountable(p) && isGraded(p) && p.date && (!last || p.date > last)) last = p.date;
  return last;
}

/**
 * The filter state (date part only) of a period, for the screen and for links. 'last_slate' is pinned
 * to the last graded slate as an explicit `slate` date, so the Explorer shows the same picks.
 * @param {Period} period
 * @param {Pick[]} picks
 * @returns {Partial<FilterState>}
 */
export function periodFilter(period, picks) {
  if (period === '7d' || period === '30d') return { datePreset: period };
  if (period === 'last_slate') {
    const d = lastGradedSlate(picks);
    return d ? { slate: d } : { datePreset: 'last_slate' };
  }
  return {};
}

/**
 * Picks inside a period (through filters.js, the same code the Explorer runs).
 * @param {Pick[]} picks @param {Period} period @param {{ today: string }} ctx
 */
export function picksInPeriod(picks, period, ctx) {
  if (period === 'all') return picks;
  return applyFilters(picks, { ...defaultFilters(), ...periodFilter(period, picks) }, ctx);
}

// ---------------------------------------------------------------- verdict against the close

/**
 * Minimum rows with a fair-close EV before a group gets a verdict. Under it the verdict is
 * 'too_early'. The frozen tests decide at 50 rows; 20 is where a mean of per-row price-quality
 * figures (SD around 5 points) has an interval narrow enough to point somewhere.
 */
export const VERDICT_MIN_N = 20;

/**
 * Verdict of a group against the close, from its fair-close EV (mean ± 2 SE, clustered by match):
 * - 'none'        no row with a two-sided close
 * - 'too_early'   fewer than VERDICT_MIN_N rows with one
 * - 'above'       the whole ±2 SE range is above zero (beats the close)
 * - 'below'       the whole range is below zero (the close says the price was bad)
 * - 'lean_above'  mean above zero, range crosses it
 * - 'lean_below'  mean at or below zero, range crosses it
 * @param {MeanStat} e
 * @param {number} [minN]
 * @returns {'none' | 'too_early' | 'above' | 'below' | 'lean_above' | 'lean_below'}
 */
export function closeVerdict(e, minN = VERDICT_MIN_N) {
  if (!e || !e.n || e.mean == null) return 'none';
  if (e.n < minN) return 'too_early';
  if (e.lo != null && e.lo > 0) return 'above';
  if (e.hi != null && e.hi < 0) return 'below';
  return e.mean > 0 ? 'lean_above' : 'lean_below';
}
/** @typedef {ReturnType<typeof closeVerdict>} Verdict */

const VERDICT_RANK = { above: 0, lean_above: 1, lean_below: 2, below: 3, too_early: 4, none: 5 };

/**
 * @typedef {object} GroupRow
 * @property {string} key       tag id or market family
 * @property {Summary} summary  1u flat
 * @property {Verdict} verdict
 * @property {number} count     every pick in the group (pending included)
 */

/**
 * Rank rows: groups with a verdict by mean fair-close EV (best first), then 'too_early' by n, then
 * groups without closes by graded n.
 * @param {GroupRow[]} rows
 */
export function rankRows(rows) {
  return [...rows].sort((a, b) => {
    const ra = VERDICT_RANK[a.verdict];
    const rb = VERDICT_RANK[b.verdict];
    const sa = ra <= 3 ? 0 : ra;
    const sb = rb <= 3 ? 0 : rb;
    if (sa !== sb) return sa - sb;
    if (sa === 0) return (b.summary.fairCloseEv.mean ?? 0) - (a.summary.fairCloseEv.mean ?? 0);
    return b.summary.fairCloseEv.n - a.summary.fairCloseEv.n || b.summary.n - a.summary.n;
  });
}

/**
 * Sombra by tag: every tag with at least one graded pick, 1u flat, ranked.
 * PUBLICADA Y APOSTADA is left out (summarize skips it: it lives in Apuestas).
 * @param {Pick[]} picks
 * @returns {GroupRow[]}
 */
export function shadowTagRows(picks) {
  const shadow = picks.filter((p) => p.source === 'shadow' && p.tag !== 'published_bet');
  return rankRows(
    groupBy(shadow, (p) => p.tag)
      .filter((g) => g.summary.n > 0)
      .map((g) => ({ key: g.key, summary: g.summary, verdict: closeVerdict(g.summary.fairCloseEv), count: g.picks.length })),
  );
}

/**
 * Sombra by market family, same shape as shadowTagRows.
 * @param {Pick[]} picks
 * @returns {GroupRow[]}
 */
export function shadowMarketRows(picks) {
  const shadow = picks.filter((p) => p.source === 'shadow' && p.tag !== 'published_bet');
  return rankRows(
    groupBy(shadow, (p) => p.market)
      .filter((g) => g.summary.n > 0)
      .map((g) => ({ key: g.key, summary: g.summary, verdict: closeVerdict(g.summary.fairCloseEv), count: g.picks.length })),
  );
}

/**
 * Best and worst rows against the close among those with a verdict (n ≥ VERDICT_MIN_N).
 * worst is null when fewer than two rows qualify.
 * @param {GroupRow[]} rows
 */
export function bestWorst(rows) {
  const ok = rows
    .filter((r) => !['none', 'too_early'].includes(r.verdict))
    .sort((a, b) => (b.summary.fairCloseEv.mean ?? 0) - (a.summary.fairCloseEv.mean ?? 0));
  return { best: ok[0] || null, worst: ok.length > 1 ? ok[ok.length - 1] : null, qualified: ok.length };
}

/**
 * Shared axis for the range bars of a set of rows: symmetric-ish bounds that hold every mean and,
 * clipped to ±30 points, every interval. Always includes zero.
 * @param {GroupRow[]} rows
 */
export function rangeAxis(rows) {
  let lo = -0.02;
  let hi = 0.02;
  for (const r of rows) {
    const e = r.summary.fairCloseEv;
    for (const v of [e.mean, e.lo, e.hi]) {
      if (v == null) continue;
      const c = Math.max(-0.3, Math.min(0.3, v));
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    }
  }
  return { min: lo, max: hi };
}

/**
 * Position (0–100 %) of a value on an axis, clipped.
 * @param {number} v @param {{ min: number, max: number }} axis
 */
export function axisPct(v, axis) {
  const span = axis.max - axis.min || 1;
  return Math.max(0, Math.min(100, ((v - axis.min) / span) * 100));
}

// ---------------------------------------------------------------- per source

/**
 * Summary of one source: Apuestas uses the sheet's own profit and stakes, the others 1u flat.
 * @param {Pick[]} picks @param {Source} source
 */
export function sourceSummary(picks, source) {
  const mine = picks.filter((p) => p.source === source);
  return summarize(mine, source === 'bets' ? { profit: 'sheet' } : {});
}

/**
 * Cumulative units in date order (graded countable picks with a price): Apuestas with the sheet's
 * profit, the others 1u flat.
 * @param {Pick[]} picks one source
 * @returns {Array<{ date: string, uid: string, profit: number, cum: number }>}
 */
export function cumulativeUnits(picks) {
  const out = [];
  let cum = 0;
  for (const p of picks.filter((x) => isCountable(x) && isGraded(x) && x.price != null).sort(byDate)) {
    const pl = p.source === 'bets' ? sheetProfit(p) : flatProfit(p, 1);
    if (pl == null) continue;
    cum += pl;
    out.push({ date: p.date, uid: p.uid, profit: pl, cum });
  }
  return out;
}

/**
 * Profit per day (date order) and the running total at the end of each day.
 * @param {Pick[]} picks one source
 * @returns {Array<{ date: string, n: number, profit: number, cum: number }>}
 */
export function dailyUnits(picks) {
  /** @type {Map<string, { date: string, n: number, profit: number, cum: number }>} */
  const days = new Map();
  for (const pt of cumulativeUnits(picks)) {
    const d = days.get(pt.date) || { date: pt.date, n: 0, profit: 0, cum: 0 };
    d.n++;
    d.profit += pt.profit;
    d.cum = pt.cum;
    days.set(pt.date, d);
  }
  return [...days.values()];
}

/**
 * Real bets extras (Apuestas, the sheet's own Ganancia (u)): units over time by day, drawdown from
 * the peak now and at its worst, average stake, best and worst day.
 * @param {Pick[]} bets Apuestas picks
 * @param {number | null} [bankrollU] the user's bankroll in units (Settings), for the % figures
 */
export function realBetsExtras(bets, bankrollU = null) {
  const days = dailyUnits(bets);
  const cum = cumulativeUnits(bets).map((p) => p.cum);
  const dd = drawdown(cum, bankrollU || undefined);
  const peak = Math.max(0, ...cum);
  const last = cum.length ? cum[cum.length - 1] : 0;
  const currentU = peak - last;
  const stakes = bets.filter((p) => isCountable(p) && p.stakeU != null && (isGraded(p) || p.status === 'pending')).map((p) => /** @type {number} */ (p.stakeU));
  let best = null;
  let worst = null;
  for (const d of days) {
    if (!best || d.profit > best.profit) best = d;
    if (!worst || d.profit < worst.profit) worst = d;
  }
  return {
    days,
    total: last,
    peak,
    currentDrawdownU: currentU,
    currentDrawdownPct: bankrollU ? currentU / (bankrollU + peak) : null,
    maxDrawdownU: dd.maxU,
    maxDrawdownPct: dd.maxPct,
    avgStake: mean(stakes),
    stakeN: stakes.length,
    best: best && best.profit > 0 ? best : null,
    worst: worst && worst.profit < 0 ? worst : null,
  };
}

// ---------------------------------------------------------------- slates and pending

/**
 * What happened on one slate, per source (sources with no pick that day are left out).
 * @param {Pick[]} picks @param {string | null} date
 * @returns {{ date: string | null, sources: Array<{ source: Source, summary: Summary }> }}
 */
export function slateReport(picks, date) {
  if (!date) return { date: null, sources: [] };
  const day = picks.filter((p) => p.date === date);
  return {
    date,
    sources: SOURCES.map((source) => ({ source, summary: sourceSummary(day, source) })).filter((x) => x.summary.n + x.summary.pending > 0),
  };
}

/**
 * Pending picks dated today or later, grouped by slate date (soonest first).
 * @param {Pick[]} picks @param {string} today YYYY-MM-DD
 * @returns {Array<{ date: string, picks: Pick[], bySource: Record<Source, number> }>}
 */
export function upcomingPending(picks, today) {
  /** @type {Map<string, Pick[]>} */
  const m = new Map();
  for (const p of picks) {
    if (!isCountable(p) || p.status !== 'pending' || !p.date || p.date < today) continue;
    if (!m.has(p.date)) m.set(p.date, []);
    m.get(p.date).push(p);
  }
  return [...m.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, ps]) => {
      const bySource = /** @type {Record<Source, number>} */ ({ bets: 0, shadow: 0, grok: 0 });
      for (const p of ps) bySource[p.source]++;
      const order = { bets: 0, grok: 1, shadow: 2 };
      return { date, picks: [...ps].sort((a, b) => order[a.source] - order[b.source] || (a.time || '').localeCompare(b.time || '') || a.row - b.row), bySource };
    });
}

/**
 * Pending picks dated before today (still not graded in the sheet).
 * @param {Pick[]} picks @param {string} today
 */
export function overduePending(picks, today) {
  return picks.filter((p) => isCountable(p) && p.status === 'pending' && p.date && p.date < today).length;
}

// ---------------------------------------------------------------- since the last visit

/**
 * @typedef {object} VisitSnapshot
 * @property {string} at                     ISO instant of the visit (equals settings.lastVisit)
 * @property {string[]} pending              uids that were pending then
 * @property {Partial<Record<Source, number>>} maxRow  last sheet row per source then
 */

/**
 * What to remember of a visit so the next one can say exactly what was graded and added since.
 * @param {Pick[]} picks @param {string} at ISO instant
 * @returns {VisitSnapshot}
 */
export function visitSnapshot(picks, at) {
  /** @type {Partial<Record<Source, number>>} */
  const maxRow = {};
  const pending = [];
  for (const p of picks) {
    if (p.status === 'pending') pending.push(p.uid);
    if (!(maxRow[p.source] >= p.row)) maxRow[p.source] = p.row;
  }
  return { at, pending, maxRow };
}

/**
 * Picks graded since the last visit, per source, and how many rows were added.
 * With a snapshot taken at that visit: picks pending then (or added after it) that are graded now.
 * Without one (first visit after an update, or a lastVisit from elsewhere): graded picks dated on or
 * after the visit's day in `timeZone`; an approximation, because the sheet keeps no grading time.
 * @param {Pick[]} picks
 * @param {string | null} lastVisit ISO instant (settings.lastVisit)
 * @param {VisitSnapshot | null} snapshot
 * @param {{ timeZone: string }} ctx
 * @returns {null | { since: string, exact: boolean, graded: Pick[], added: number, sources: Array<{ source: Source, summary: Summary }> }}
 */
export function sinceLastVisit(picks, lastVisit, snapshot, ctx) {
  if (!lastVisit) return null;
  const exact = !!(snapshot && snapshot.at === lastVisit && Array.isArray(snapshot.pending));
  /** @type {Pick[]} */
  let graded;
  let added = 0;
  if (exact) {
    const wasPending = new Set(snapshot.pending);
    const isNew = (/** @type {Pick} */ p) => snapshot.maxRow[p.source] != null && p.row > /** @type {number} */ (snapshot.maxRow[p.source]);
    added = picks.filter(isNew).length;
    graded = picks.filter((p) => isCountable(p) && isGraded(p) && (wasPending.has(p.uid) || isNew(p)));
  } else {
    const day = dateIn(lastVisit, ctx.timeZone);
    graded = day ? picks.filter((p) => isCountable(p) && isGraded(p) && p.date >= day) : [];
  }
  return {
    since: lastVisit,
    exact,
    graded,
    added,
    sources: SOURCES.map((source) => ({ source, summary: sourceSummary(graded, source) })).filter((x) => x.summary.n > 0),
  };
}

/** 'YYYY-MM-DD' of an ISO instant in a time zone, or null. @param {string} iso @param {string} tz */
export function dateIn(iso, tz) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

/**
 * Sombra by tag and line: for every tag whose graded picks span at least two lines, one GroupRow per
 * line (lineKey; picks without a line left out), in line order (lines.js compareLineKeys). Tags with
 * fewer than two lines are absent. Same picks as shadowTagRows.
 * @param {Pick[]} picks
 * @returns {Record<string, GroupRow[]>}
 */
export function shadowTagLineRows(picks) {
  const shadow = picks.filter((p) => p.source === 'shadow' && p.tag !== 'published_bet' && p.lineKey);
  /** @type {Record<string, GroupRow[]>} */
  const out = {};
  for (const g of groupBy(shadow, (p) => p.tag)) {
    const rows = groupByLine(g.picks)
      .filter((l) => l.summary.n > 0)
      .map((l) => ({ key: l.key, summary: l.summary, verdict: closeVerdict(l.summary.fairCloseEv), count: l.picks.length }));
    if (rows.length >= 2) out[g.key] = rows;
  }
  return out;
}
