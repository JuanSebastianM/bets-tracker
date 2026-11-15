// Figures behind the Analysis section (#/analysis): breakdowns by any dimension, a two-way table,
// calibration series with Brier scores, the distribution of price-vs-close figures, closing moves by
// market, the Pinnacle 1X2 move, and Grok against our own verdicts. Pure functions on Pick[]; every
// rate and mean still comes from stats.js (summarize, measureStat, brier, calibration) and the verdict
// word from overview.js (closeVerdict), so they mean the same everywhere.

import { summarize, groupBy, measureStat, calibration, brier, priceBand, monthOf, weekdayOf, isGraded, isCountable, PRICE_BANDS } from './stats.js';
import { closeVerdict } from './overview.js';
import { refOf, defaultFilters } from './filters.js';
import { TAGS, MARKET_FAMILIES, PRICE_FIRST_TAGS, FILTER_REASONS } from './tags.js';

/** @typedef {import('./types').Pick} Pick */
/** @typedef {import('./types').PinnacleRow} PinnacleRow */
/** @typedef {import('./stats.js').Summary} Summary */
/** @typedef {import('./filters.js').FilterState} FilterState */
/** @typedef {import('./overview.js').Verdict} Verdict */

const fold = (/** @type {string} */ s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------------------------------------------------------------- bands

/**
 * Model-probability bands: lo inclusive, hi exclusive (the last one includes 1).
 * @type {Array<{ id: string, min: number, max: number }>}
 */
export const PROB_BANDS = [
  { id: 'lt30', min: 0, max: 0.3 },
  { id: '30_40', min: 0.3, max: 0.4 },
  { id: '40_50', min: 0.4, max: 0.5 },
  { id: '50_60', min: 0.5, max: 0.6 },
  { id: '60_70', min: 0.6, max: 0.7 },
  { id: 'ge70', min: 0.7, max: 1 },
];

/**
 * Logged-EV bands: lo inclusive, hi exclusive. An EV of exactly 0 is in '0_3'.
 * @type {Array<{ id: string, min: number, max: number }>}
 */
export const EV_BANDS = [
  { id: 'lt0', min: -Infinity, max: 0 },
  { id: '0_3', min: 0, max: 0.03 },
  { id: '3_6', min: 0.03, max: 0.06 },
  { id: '6_10', min: 0.06, max: 0.1 },
  { id: '10_20', min: 0.1, max: 0.2 },
  { id: 'ge20', min: 0.2, max: Infinity },
];

/** @param {Array<{ id: string, min: number, max: number }>} bands @param {number | null} v */
function bandOf(bands, v) {
  if (v == null || !Number.isFinite(v)) return null;
  const last = bands.length - 1;
  for (let i = 0; i <= last; i++) {
    const b = bands[i];
    if (v >= b.min && (v < b.max || (i === last && v <= b.max))) return b.id;
  }
  return null;
}

/** Band id of a model probability, or null. @param {number | null} p */
export const probBand = (p) => bandOf(PROB_BANDS, p);
/** Band id of a logged EV, or null. @param {number | null} ev */
export const evBand = (ev) => bandOf(EV_BANDS, ev);

/**
 * The filter range ({min, max}, both inclusive in filters.js) that selects one band. The exclusive
 * top edge becomes `max − 0.0001`: the sheet logs these figures with at most 4 decimals, so the range
 * selects exactly the band's rows.
 * @param {Array<{ id: string, min: number, max: number }>} bands @param {string} id
 * @returns {{ min: number | null, max: number | null } | null}
 */
export function bandRange(bands, id) {
  const i = bands.findIndex((b) => b.id === id);
  if (i < 0) return null;
  const b = bands[i];
  // The outer edges of the probability bands (0 and 1) need no bound.
  const first = i === 0;
  const last = i === bands.length - 1;
  const openLo = !Number.isFinite(b.min) || (bands === PROB_BANDS && first);
  const openHi = !Number.isFinite(b.max) || (bands === PROB_BANDS && last);
  return { min: openLo ? null : b.min, max: openHi ? null : round4(b.max - 0.0001) };
}
const round4 = (/** @type {number} */ v) => Math.round(v * 10000) / 10000;

/** Weekday ids 1 (Monday) … 7 (Sunday) as strings, in order. */
export const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'];

/** Last day of a 'YYYY-MM' month as 'YYYY-MM-DD'. @param {string} ym */
export function monthEnd(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- dimensions

/**
 * @typedef {object} Dimension
 * @property {string} id
 * @property {(p: Pick) => string | string[] | null} key   group key(s) of a pick; null leaves it out
 * @property {string[] | null} order   the dimension's own order (null: by size / label)
 * @property {(key: string) => Partial<FilterState> | null} slice  filter patch that selects the group (null: no filter can)
 */

/** @type {Dimension[]} */
export const DIMENSIONS = [
  { id: 'tag', key: (p) => p.tag, order: TAGS.map((t) => t.id), slice: (k) => ({ tags: [k] }) },
  { id: 'market', key: (p) => p.market, order: MARKET_FAMILIES, slice: (k) => ({ markets: [k] }) },
  { id: 'marketRaw', key: (p) => p.marketRaw || null, order: null, slice: (k) => ({ marketsRaw: [k] }) },
  { id: 'league', key: (p) => p.league || null, order: null, slice: (k) => ({ leagues: [k] }) },
  { id: 'book', key: (p) => (p.books.length ? p.books : null), order: ['Betano', 'Betsson', 'Stake'], slice: (k) => ({ books: [k] }) },
  { id: 'priceBand', key: (p) => priceBand(p.price), order: PRICE_BANDS.map((b) => b.id), slice: (k) => ({ pricePreset: k, price: { min: null, max: null } }) },
  {
    id: 'month',
    key: (p) => (p.date ? monthOf(p) : null),
    order: null,
    slice: (k) => ({ datePreset: null, slate: null, dateFrom: `${k}-01`, dateTo: monthEnd(k) }),
  },
  { id: 'weekday', key: (p) => (p.date ? String(weekdayOf(p)) : null), order: WEEKDAYS, slice: () => null },
  { id: 'probBand', key: (p) => probBand(p.probModel), order: PROB_BANDS.map((b) => b.id), slice: (k) => ({ prob: bandRange(PROB_BANDS, k) || { min: null, max: null } }) },
  { id: 'evBand', key: (p) => evBand(p.ev), order: EV_BANDS.map((b) => b.id), slice: (k) => ({ ev: bandRange(EV_BANDS, k) || { min: null, max: null } }) },
  { id: 'ref', key: (p) => refOf(p), order: ['feed', 'consensus', 'books', 'one_book', 'none'], slice: (k) => ({ refs: [k] }) },
  { id: 'sample', key: (p) => p.parsed.sample || null, order: ['10+', '6-9'], slice: (k) => ({ samples: [k] }) },
  { id: 'fuerza', key: (p) => p.parsed.fuerza || null, order: ['keeps', 'rejects', 'na'], slice: (k) => ({ fuerza: [k] }) },
  { id: 'reason', key: (p) => (p.parsed.filters.length ? p.parsed.filters : null), order: FILTER_REASONS.map(([id]) => id), slice: (k) => ({ reasons: [k] }) },
  { id: 'source', key: (p) => p.source, order: ['bets', 'shadow', 'grok'], slice: (k) => ({ sources: [k] }) },
];

export const DIMENSION_IDS = DIMENSIONS.map((d) => d.id);

/** @param {string} id @returns {Dimension} */
export function dimension(id) {
  return DIMENSIONS.find((d) => d.id === id) || DIMENSIONS[0];
}

/** Dimensions whose keys have a natural order (bands, dates, weekdays): sorted by it by default. */
export const ORDERED_DIMENSIONS = ['priceBand', 'month', 'weekday', 'probBand', 'evBand'];

/**
 * The filter state with one group's slice added (the slice's fields replace the same fields).
 * null when no filter selects the group (weekday).
 * @param {FilterState} f @param {string} dimId @param {string} key
 * @returns {FilterState | null}
 */
export function withSlice(f, dimId, key) {
  const patch = dimension(dimId).slice(key);
  if (!patch) return null;
  const next = { ...f, ...patch };
  if ('pricePreset' in patch) next.price = { min: null, max: null };
  return next;
}

// ---------------------------------------------------------------- grouped rows

/**
 * @typedef {object} BreakdownRow
 * @property {string} key
 * @property {Summary} summary     1u flat
 * @property {Verdict} verdict     closeVerdict of the fair-close EV
 * @property {number} count        every pick in the group (pending included)
 * @property {number | null} yieldLo  yield − 2 SE
 * @property {number | null} yieldHi  yield + 2 SE
 * @property {number | null} edge     hit rate − break-even (null without a rate)
 */

/**
 * ±2 SE of the flat yield (the SE is review.py's plain SE of the per-pick profit).
 * @param {Summary} s
 */
export function yieldInterval(s) {
  if (s.yield == null || s.yieldSe == null) return { lo: null, hi: null };
  return { lo: s.yield - 2 * s.yieldSe, hi: s.yield + 2 * s.yieldSe };
}

/** @param {{ key: string, picks: Pick[], summary: Summary }} g @returns {BreakdownRow} */
function toRow(g) {
  const s = g.summary;
  const yi = yieldInterval(s);
  return {
    key: g.key,
    summary: s,
    verdict: closeVerdict(s.fairCloseEv),
    count: g.picks.length,
    yieldLo: yi.lo,
    yieldHi: yi.hi,
    edge: s.hitRate != null && s.breakEven != null ? s.hitRate - s.breakEven : null,
  };
}

/**
 * Every group of a dimension, 1u flat, in the dimension's own order (or largest first).
 * A pick with several keys (books, reasons) is in each of its groups; one without a key is left out
 * (`left` counts them).
 * @param {Pick[]} picks @param {string} dimId
 * @returns {{ rows: BreakdownRow[], left: number }}
 */
export function breakdown(picks, dimId) {
  const dim = dimension(dimId);
  const rows = groupBy(picks, /** @type {any} */ (dim.key)).map(toRow);
  const left = picks.filter((p) => dim.key(p) == null).length;
  return { rows: sortRows(rows, 'natural', 'asc', dimId), left };
}

export const SORTS = ['natural', 'n', 'yield', 'ev', 'units', 'edge', 'label'];

/** Value a row sorts by (null sorts last). @type {Record<string, (r: BreakdownRow) => number | null>} */
const SORT_VALUE = {
  n: (r) => r.summary.n,
  yield: (r) => r.summary.yield,
  ev: (r) => r.summary.fairCloseEv.mean,
  units: (r) => r.summary.profit,
  edge: (r) => r.edge,
};

/**
 * Sort rows. 'natural' is the dimension's own order (bands, months, weekdays, the tag list), else size;
 * 'label' sorts by the given label function (or the key).
 * @param {BreakdownRow[]} rows @param {string} sort @param {'asc' | 'desc'} dir @param {string} dimId
 * @param {(key: string) => string} [labelOf]
 */
export function sortRows(rows, sort, dir, dimId, labelOf = (k) => k) {
  const k = dir === 'asc' ? 1 : -1;
  const dim = dimension(dimId);
  if (sort === 'natural') {
    if (dimId === 'month') return [...rows].sort((a, b) => (a.key < b.key ? -k : a.key > b.key ? k : 0));
    if (dim.order && ORDERED_DIMENSIONS.includes(dimId)) {
      const o = dim.order;
      return [...rows].sort((a, b) => k * (o.indexOf(a.key) - o.indexOf(b.key)));
    }
    return [...rows].sort((a, b) => b.summary.n - a.summary.n || b.count - a.count || (a.key < b.key ? -1 : 1));
  }
  if (sort === 'label') {
    return [...rows].sort((a, b) => k * fold(labelOf(a.key)).localeCompare(fold(labelOf(b.key))));
  }
  const get = SORT_VALUE[sort] || SORT_VALUE.n;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return b.summary.n - a.summary.n;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va === vb ? b.summary.n - a.summary.n : va < vb ? -k : k;
  });
}

/** Default direction of a sort. @param {string} sort */
export const sortDefaultDir = (sort) => (sort === 'natural' || sort === 'label' ? 'asc' : 'desc');

/**
 * Two-way table: the largest `maxRows` groups of dimension A by the largest `maxCols` of dimension B,
 * every cell summarised (1u flat). Cells with no pick are null.
 * @param {Pick[]} picks @param {string} dimA @param {string} dimB
 * @param {{ maxRows?: number, maxCols?: number }} [opts]
 * @returns {{ rows: string[], cols: string[], cells: Record<string, Record<string, BreakdownRow | null>> }}
 */
export function twoWay(picks, dimA, dimB, opts = {}) {
  const maxRows = opts.maxRows ?? 6;
  const maxCols = opts.maxCols ?? 5;
  const a = dimension(dimA);
  const b = dimension(dimB);
  const top = (/** @type {Dimension} */ d, /** @type {number} */ n) => {
    const g = groupBy(picks, /** @type {any} */ (d.key)).filter((x) => x.summary.n > 0).slice(0, n).map(toRow);
    return sortRows(g, 'natural', 'asc', d.id).map((r) => r.key);
  };
  const rows = top(a, maxRows);
  const cols = top(b, maxCols);
  /** @type {Record<string, Record<string, BreakdownRow | null>>} */
  const cells = {};
  const has = (/** @type {string | string[] | null} */ k, /** @type {string} */ v) => (Array.isArray(k) ? k.includes(v) : k === v);
  for (const r of rows) {
    cells[r] = {};
    const inRow = picks.filter((p) => has(a.key(p), r));
    for (const c of cols) {
      const ps = inRow.filter((p) => has(b.key(p), c));
      cells[r][c] = ps.length ? toRow({ key: `${r}|${c}`, picks: ps, summary: summarize(ps) }) : null;
    }
  }
  return { rows, cols, cells };
}

// ---------------------------------------------------------------- histogram

/**
 * Bins of width `step` from `min` to `max`, plus an open bin below `min` and one at or above `max`.
 * Each bin is [lo, hi): a value on an edge goes to the bin above it.
 * @param {number[]} values
 * @param {{ min: number, max: number, step: number }} opts
 * @returns {Array<{ lo: number, hi: number, n: number, openLo: boolean, openHi: boolean }>}
 */
export function histogram(values, { min, max, step }) {
  const inner = Math.round((max - min) / step);
  const bins = [{ lo: -Infinity, hi: min, n: 0, openLo: true, openHi: false }];
  for (let i = 0; i < inner; i++) bins.push({ lo: round6(min + i * step), hi: round6(min + (i + 1) * step), n: 0, openLo: false, openHi: false });
  bins.push({ lo: max, hi: Infinity, n: 0, openLo: false, openHi: true });
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < min) bins[0].n++;
    else if (v >= max) bins[bins.length - 1].n++;
    else bins[1 + Math.min(inner - 1, Math.floor((v - min) / step + 1e-9))].n++;
  }
  return bins;
}
const round6 = (/** @type {number} */ v) => Math.round(v * 1e6) / 1e6;

/** Histogram range of the price-vs-close figures: −20 % to +20 % in 2-point bins. */
export const CLOSE_BINS = { min: -0.2, max: 0.2, step: 0.02 };

/**
 * Distribution of a per-pick measure over the graded picks that have it.
 * @param {Pick[]} picks @param {(p: Pick) => number | null} get
 */
export function measureDistribution(picks, get, bins = CLOSE_BINS) {
  const vals = [];
  for (const p of picks) {
    if (!isCountable(p) || !isGraded(p)) continue;
    const v = get(p);
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  return { bins: histogram(vals, bins), stat: measureStat(picks.filter(isCountable), get) };
}

// ---------------------------------------------------------------- calibration

/**
 * The market's de-vigged probability at the close for the pick's side (the same close as fairCloseEv):
 * (1 + fairCloseEv) / price. null without a two-sided close.
 * @param {Pick} p
 */
export function marketCloseProb(p) {
  if (p.fairCloseEv == null || !p.price) return null;
  return (1 + p.fairCloseEv) / p.price;
}

const isPriceFirst = (/** @type {Pick} */ p) => PRICE_FIRST_TAGS.includes(p.tag);

/**
 * Probability series that can be checked against results. The blend column holds the consensus fair
 * probability on price-first rows (VALOR, VALOR CASI, VALOR PROP…), so those rows are their own series.
 * @type {Array<{ id: string, prob: (p: Pick) => number | null }>}
 */
export const CAL_SERIES = [
  { id: 'model', prob: (p) => p.probModel },
  { id: 'blend', prob: (p) => (isPriceFirst(p) ? null : p.probBlend) },
  { id: 'consensus', prob: (p) => (isPriceFirst(p) ? p.probBlend : null) },
  { id: 'ai', prob: (p) => p.probAI },
];

/**
 * Calibration of one series: buckets, overall mean prediction and hit rate, Brier score, and the Brier
 * score of the series and of the market's de-vigged close on the same picks (those that have both).
 * Only won and lost picks count (stats.js calibration / brier).
 * @param {Pick[]} picks @param {string} seriesId
 */
export function calibrationReport(picks, seriesId) {
  const series = CAL_SERIES.find((s) => s.id === seriesId) || CAL_SERIES[0];
  const prob = series.prob;
  const buckets = calibration(picks, prob);
  const decided = picks.filter((p) => isCountable(p) && (p.status === 'won' || p.status === 'lost') && prob(p) != null);
  const wins = decided.filter((p) => p.status === 'won').length;
  const meanProb = decided.length ? decided.reduce((a, p) => a + /** @type {number} */ (prob(p)), 0) / decided.length : null;
  const paired = decided.filter((p) => marketCloseProb(p) != null);
  return {
    id: series.id,
    buckets,
    n: decided.length,
    wins,
    meanProb,
    hitRate: decided.length ? wins / decided.length : null,
    brier: brier(picks, prob),
    paired: { n: paired.length, series: brier(paired, prob).score, market: brier(paired, marketCloseProb).score },
  };
}

// ---------------------------------------------------------------- price against the close

/** Fair-close EV split by the source of the close (own book, bet365 feed), as the reviews report it. */
export function closeBySource(/** @type {Pick[]} */ picks) {
  return ['same_book', 'feed'].map((key) => ({ key, stat: measureStat(picks.filter((p) => isCountable(p) && p.closeSource === key), (p) => p.fairCloseEv) }));
}

/**
 * How the close moved against the logged price at the same source (raw CLV), per market family:
 * shortened (CLV > 0, the price came in), unchanged, drifted (CLV < 0); with mean CLV and mean
 * fair-close EV. Graded picks only.
 * @param {Pick[]} picks
 */
export function closeMoves(picks) {
  /** @type {Map<string, Pick[]>} */
  const m = new Map();
  for (const p of picks) {
    if (!isCountable(p) || !isGraded(p) || p.clv == null) continue;
    if (!m.has(p.market)) m.set(p.market, []);
    m.get(p.market).push(p);
  }
  return MARKET_FAMILIES.filter((k) => m.has(k)).map((key) => {
    const ps = /** @type {Pick[]} */ (m.get(key));
    return {
      key,
      n: ps.length,
      shortened: ps.filter((p) => /** @type {number} */ (p.clv) > 1e-9).length,
      flat: ps.filter((p) => Math.abs(/** @type {number} */ (p.clv)) <= 1e-9).length,
      drifted: ps.filter((p) => /** @type {number} */ (p.clv) < -1e-9).length,
      clv: measureStat(ps, (p) => p.clv),
      fairCloseEv: measureStat(ps, (p) => p.fairCloseEv),
    };
  });
}

// ---------------------------------------------------------------- Pinnacle

/** Result markets that Pinnacle's full-time 1X2 can price. */
const PIN_MARKETS = /^(1x2(\s*\(pago anticipado[^)]*\))?|doble oportunidad|empate no apuesta|dnb)$/;

/**
 * The outcome of a result pick in Pinnacle's 1X2 terms: 'home', 'draw', 'away' (1X2), '1X', 'X2', '12'
 * (double chance), 'dnb_home', 'dnb_away' (draw no bet), or null when it cannot be told.
 * Team names come from the pick's own match ("Home vs Away").
 * @param {Pick} p
 */
export function pinOutcome(p) {
  const market = fold(p.marketRaw);
  if (!PIN_MARKETS.test(market)) return null;
  const [home, away] = String(p.match || '').split(/\s+vs\.?\s+/i).map(fold);
  const sel = fold(p.selection);
  if (!sel || !home || !away) return null;
  const hasHome = sel.includes(home);
  const hasAway = sel.includes(away);
  const draw = /\bempate\b|\bdraw\b|^x$/.test(sel);
  if (market === 'doble oportunidad') {
    const code = sel.replace(/\s+/g, '').toUpperCase();
    if (code === '1X' || code === 'X2' || code === '12') return code;
    if (hasHome && hasAway) return '12';
    if (hasHome && draw) return '1X';
    if (hasAway && draw) return 'X2';
    return null;
  }
  const dnb = market === 'empate no apuesta' || market === 'dnb';
  if (hasHome && hasAway) return null;
  if (hasHome) return dnb ? 'dnb_home' : 'home';
  if (hasAway) return dnb ? 'dnb_away' : 'away';
  if (draw && !dnb) return 'draw';
  return null;
}

/**
 * Proportionally de-vigged probability of an outcome from a 1X2 triple, or null.
 * @param {[number, number, number]} triple @param {string} outcome
 */
export function pinProb(triple, outcome) {
  if (!triple.every((x) => Number.isFinite(x) && x > 1)) return null;
  const inv = triple.map((x) => 1 / x);
  const sum = inv[0] + inv[1] + inv[2];
  const [h, d, a] = inv.map((x) => x / sum);
  switch (outcome) {
    case 'home': return h;
    case 'draw': return d;
    case 'away': return a;
    case '1X': return h + d;
    case 'X2': return d + a;
    case '12': return h + a;
    case 'dnb_home': return h / (h + a);
    case 'dnb_away': return a / (h + a);
    default: return null;
  }
}

/** A change in Pinnacle's de-vigged probability under half a point counts as no move. */
export const PIN_FLAT = 0.005;

/**
 * Did Pinnacle's 1X2 move towards the pick (its de-vigged probability rose from open to last read),
 * away from it, or not at all.
 * @param {PinnacleRow} row @param {string} outcome
 * @returns {{ open: number, last: number, delta: number, direction: 'towards' | 'away' | 'flat' } | null}
 */
export function pinMove(row, outcome) {
  const num = (/** @type {any} */ v) => (v == null || v === '' ? NaN : Number(v));
  const open = pinProb([num(row.open_1), num(row.open_x), num(row.open_2)], outcome);
  const last = pinProb([num(row.last_1), num(row.last_x), num(row.last_2)], outcome);
  if (open == null || last == null) return null;
  const delta = last - open;
  return { open, last, delta, direction: delta >= PIN_FLAT ? 'towards' : delta <= -PIN_FLAT ? 'away' : 'flat' };
}

/**
 * The Pinnacle join for result picks with a `pin id`: each pick's move and the counts.
 * `missing` = picks whose pin id has no row in the tab; `unknown` = rows found but the pick's outcome
 * (or the prices) could not be read.
 * @param {Pick[]} picks @param {PinnacleRow[]} pinnacle
 */
export function pinnacleMoves(picks, pinnacle) {
  const byId = new Map((pinnacle || []).map((r) => [String(r.id), r]));
  const rows = [];
  const counts = { towards: 0, away: 0, flat: 0 };
  let withId = 0;
  let missing = 0;
  let unknown = 0;
  for (const p of picks) {
    if (!isCountable(p) || p.market !== 'result') continue;
    const id = p.parsed && p.parsed.pin ? p.parsed.pin.id : null;
    if (!id) continue;
    withId++;
    const row = byId.get(String(id));
    if (!row) {
      missing++;
      continue;
    }
    const outcome = pinOutcome(p);
    const move = outcome ? pinMove(row, outcome) : null;
    if (!move) {
      unknown++;
      continue;
    }
    counts[move.direction]++;
    rows.push({ pick: p, row, outcome, ...move });
  }
  return { rows, counts, withId, missing, unknown, joined: rows.length };
}

// ---------------------------------------------------------------- Grok against our verdict

/** Kinds of `Nuestro veredicto`, in display order. */
export const GROK_KINDS = ['priced', 'priced_rule29', 'not_priced', 'none'];

const NOT_PRICED_WHY = /** @type {Array<[string, RegExp]>} */ ([
  ['not_modelled', /no modelad|not modell?ed|no lo modela|no cubiert|not covered|fuera del script/],
  ['sample', /muestra|sample|\bpj\b|partidos/],
  ['no_reference', /sin ref|referencia|\bref\b|regla 22|rule 22|dos lados|both sides|un solo lado|one side/],
  ['not_read', /no le[ií]d|sin l[ií]nea|no se ley|not read|no disponible|no listad|no aparece|casas no|sin navegador/],
  ['cup', /\bcopa\b|\bcup\b/],
]);

/**
 * Our verdict on a Grok pick, from the `Nuestro veredicto` text ("Cotizado: modelo X% vs mercado Y% →
 * SKIP: F-gap", "Cotizado (regla 29): …", "No cotizado: reason").
 * - kind: 'priced' (the script priced it), 'priced_rule29' (priced by the value scan, rule 29),
 *   'not_priced', or 'none' (empty or another shape).
 * - why: for priced kinds the outcome after the arrow ('skip', 'shadow', 'value', 'near_value',
 *   'no_value', 'bet', 'other'); for 'not_priced' the reason ('not_modelled', 'sample', 'no_reference',
 *   'not_read', 'cup', 'other'); 'none' otherwise.
 * - filters: rejection reasons named in a SKIP (FILTER_REASONS ids); model / market: the two
 *   percentages when the text has them (fractions).
 * @param {string} text
 */
export function grokVerdict(text) {
  const raw = String(text || '').trim();
  const low = fold(raw);
  /** @type {{ kind: string, why: string, filters: string[], model: number | null, market: number | null, detail: string }} */
  const out = { kind: 'none', why: 'none', filters: [], model: null, market: null, detail: '' };
  if (!low) return out;
  const colon = raw.indexOf(':');
  out.detail = colon >= 0 ? raw.slice(colon + 1).trim() : '';
  const detail = fold(out.detail);
  // Early rows (audit): "Marcador exacto no cotizado; …" is not priced; "Mercado primero …" is rule 29.
  if (low.startsWith('no cotizado') || /^[^:;→]*\bno cotizad[oa]/.test(low)) {
    out.kind = 'not_priced';
    out.why = (NOT_PRICED_WHY.find(([, re]) => re.test(detail)) || ['other'])[0];
    return out;
  }
  const marketFirst = low.startsWith('mercado primero');
  if (!low.startsWith('cotizado') && !marketFirst) return out;
  out.kind = marketFirst || /^cotizado\s*\(\s*(regla|rule)\s*29\s*\)/.test(low) ? 'priced_rule29' : 'priced';
  const pm = low.match(/model[o]?\s+([\d.,]+)\s*%\s*vs\.?\s*(?:mercado|market)\s+([\d.,]+)\s*%/);
  if (pm) {
    out.model = Number(pm[1].replace(',', '.')) / 100;
    out.market = Number(pm[2].replace(',', '.')) / 100;
  }
  const arrow = raw.search(/→|->|=>/);
  const after = arrow >= 0 ? raw.slice(arrow).replace(/^(→|->|=>)\s*/, '') : out.detail;
  const a = fold(after);
  if (/^skip|^salto|rechaz/.test(a)) {
    out.why = 'skip';
    out.filters = FILTER_REASONS.filter(([, re]) => re.test(after)).map(([id]) => id);
  } else if (/shadow|pas[oó] todos/.test(a)) out.why = 'shadow';
  else if (/sin valor|no value|bajo la justa|debajo de la justa|no hay valor|^valor\s*[-−]/.test(a)) out.why = 'no_value';
  else if (/valor casi|near value/.test(a)) out.why = 'near_value';
  else if (/\bvalor\b|\bvalue\b/.test(a)) out.why = 'value';
  else if (/apuesta|apostad|\bbet\b|stake\s+[\d.,]+\s*u/.test(a)) out.why = 'bet';
  else out.why = 'other';
  return out;
}

/** Order of the `why` ids per kind, for display. */
export const GROK_WHY = {
  priced: ['skip', 'shadow', 'value', 'near_value', 'no_value', 'bet', 'other'],
  priced_rule29: ['value', 'near_value', 'no_value', 'skip', 'shadow', 'bet', 'other'],
  not_priced: ['not_modelled', 'sample', 'no_reference', 'not_read', 'cup', 'other'],
  none: ['none'],
};

/**
 * Grok's picks grouped by our verdict, each with its record (1u flat), fair-close EV and the split by
 * the reason (`why`). Kinds without picks are left out.
 * @param {Pick[]} picks any picks (only Grok's are used)
 */
export function grokByVerdict(picks) {
  const grok = picks.filter((p) => p.source === 'grok');
  const v = new Map(grok.map((p) => [p.uid, grokVerdict(String(p.extra && p.extra.verdict != null ? p.extra.verdict : ''))]));
  return GROK_KINDS.map((kind) => {
    const ps = grok.filter((p) => /** @type {any} */ (v.get(p.uid)).kind === kind);
    const s = summarize(ps);
    const why = GROK_WHY[kind]
      .map((w) => {
        const sub = ps.filter((p) => /** @type {any} */ (v.get(p.uid)).why === w);
        return { key: w, count: sub.length, summary: summarize(sub) };
      })
      .filter((x) => x.count);
    return { key: kind, count: ps.length, summary: s, verdict: closeVerdict(s.fairCloseEv), why };
  }).filter((g) => g.count);
}

/** Grok's picks by market family (1u flat), largest first. @param {Pick[]} picks */
export function grokByMarket(picks) {
  return groupBy(picks.filter((p) => p.source === 'grok'), (p) => p.market).map(toRow);
}

/** Since this slate only Grok's team-corner picks are logged (`Decisiones`, 10 Nov 2026). */
export const GROK_TEAM_CORNERS_ONLY_FROM = '2026-11-10';

const isTeamCorners = (/** @type {Pick} */ p) => p.market === 'corners_team' || p.reviewClass === 'team_corners';

/** Team (0 home, 1 away, null) a selection is about, from the match's "Home vs Away". @param {Pick} p */
function teamOf(p) {
  const [home, away] = String(p.match || '').split(/\s+vs\.?\s+/i).map(fold);
  const sel = fold(p.selection);
  if (home && sel.startsWith(home)) return 0;
  if (away && sel.startsWith(away)) return 1;
  if (home && sel.includes(home) && !(away && sel.includes(away))) return 0;
  if (away && sel.includes(away) && !(home && sel.includes(home))) return 1;
  return null;
}

/**
 * How two team-corner picks on the same match relate: 'same' (same selection), 'same_side' (same team
 * and over/under, another line), 'opposite' (same team, other side), 'other_team'.
 * @param {Pick} a @param {Pick} b
 */
export function pickAgreement(a, b) {
  if (fold(a.selection).replace(/\s+/g, ' ') === fold(b.selection).replace(/\s+/g, ' ')) return 'same';
  const ta = teamOf(a);
  const tb = teamOf(b);
  if (ta == null || tb == null || ta !== tb) return 'other_team';
  if (a.side && a.side === b.side) return 'same_side';
  return 'opposite';
}

/**
 * Grok's team-corner picks against Sombra's CÓRNERS EQUIPO rows: both in full, and on the matches where
 * both picked (same date and match). Each shared match lists both sides' picks and how they relate.
 * @param {Pick[]} picks
 */
export function grokTeamCorners(picks) {
  const grok = picks.filter((p) => p.source === 'grok' && isTeamCorners(p));
  const sombra = picks.filter((p) => p.source === 'shadow' && p.tag === 'team_corners');
  const key = (/** @type {Pick} */ p) => `${p.date}|${fold(p.match)}`;
  /** @type {Map<string, Pick[]>} */
  const sm = new Map();
  for (const p of sombra) {
    if (!sm.has(key(p))) sm.set(key(p), []);
    sm.get(key(p)).push(p);
  }
  /** @type {Map<string, { date: string, match: string, grok: Pick[], sombra: Pick[] }>} */
  const shared = new Map();
  for (const p of grok) {
    const k = key(p);
    if (!sm.has(k)) continue;
    if (!shared.has(k)) shared.set(k, { date: p.date, match: p.match, grok: [], sombra: /** @type {Pick[]} */ (sm.get(k)) });
    shared.get(k).grok.push(p);
  }
  const matches = [...shared.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const agreement = { same: 0, same_side: 0, opposite: 0, other_team: 0 };
  for (const m of matches) {
    for (const g of m.grok) {
      // The closest relation to any of Sombra's picks on that match.
      const rank = ['same', 'same_side', 'opposite', 'other_team'];
      const best = m.sombra.map((s) => pickAgreement(g, s)).sort((x, y) => rank.indexOf(x) - rank.indexOf(y))[0];
      agreement[/** @type {keyof typeof agreement} */ (best)]++;
    }
  }
  const sharedGrok = matches.flatMap((m) => m.grok);
  const sharedSombra = matches.flatMap((m) => m.sombra);
  return {
    grok: summarize(grok),
    sombra: summarize(sombra),
    grokSince: summarize(grok.filter((p) => p.date >= GROK_TEAM_CORNERS_ONLY_FROM)),
    matches,
    agreement,
    sharedGrok: summarize(sharedGrok),
    sharedSombra: summarize(sharedSombra),
  };
}

/** The filter state with only what the Grok part honours (it picks its own sources and tags). @param {FilterState} f */
export function grokScope(f) {
  return { ...f, sources: defaultFilters().sources, tags: defaultFilters().tags };
}

/**
 * Grok's picks that our script priced (with or without rule 29) against those it did not price,
 * 1u flat each.
 * @param {Pick[]} picks
 */
export function grokPricedSplit(picks) {
  const grok = picks.filter((p) => p.source === 'grok');
  const kind = (/** @type {Pick} */ p) => grokVerdict(String(p.extra && p.extra.verdict != null ? p.extra.verdict : '')).kind;
  return {
    priced: summarize(grok.filter((p) => kind(p) === 'priced' || kind(p) === 'priced_rule29')),
    notPriced: summarize(grok.filter((p) => kind(p) === 'not_priced')),
  };
}
