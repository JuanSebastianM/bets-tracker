// The shared filter state (Explorer and Simulator): one plain object, applied with a pure function
// and serialised to the hash query so a filtered view can be bookmarked.

import { MARKET_FAMILIES, TAGS } from './tags.js';

/** @typedef {import('./types').Pick} Pick */

/**
 * @typedef {object} Range
 * @property {number | null} min
 * @property {number | null} max
 */

/**
 * @typedef {object} FilterState
 * @property {string[]} sources       'bets' | 'shadow' | 'grok'
 * @property {string[]} tags          TagId
 * @property {string[]} markets       MarketFamily
 * @property {string[]} marketsRaw    raw `Mercado` text
 * @property {string[]} leagues
 * @property {string[]} books
 * @property {string[]} statuses      Status
 * @property {string | null} pricePreset  id from PRICE_PRESETS
 * @property {Range} price            custom range (used when pricePreset is null)
 * @property {string | null} datePreset   id from DATE_PRESETS
 * @property {string | null} dateFrom YYYY-MM-DD (custom range, and the 'since' preset)
 * @property {string | null} dateTo
 * @property {string | null} slate    one slate (match) date
 * @property {boolean | null} hasClose     has a closing price
 * @property {boolean | null} twoSidedClose has a close with both sides (fair-close EV)
 * @property {string[]} refs          'feed' | 'books' | 'one_book' | 'consensus' | 'none'
 * @property {string[]} samples       '10+' | '6-9'
 * @property {string[]} fuerza        'keeps' | 'rejects' | 'na'
 * @property {string[]} reasons       FilterReason
 * @property {Range} ev               logged EV (fraction)
 * @property {Range} prob             model probability (fraction)
 * @property {string} q               free text (match, league, selection, notes, reason)
 */

/** @returns {FilterState} */
export function defaultFilters() {
  return {
    sources: [],
    tags: [],
    markets: [],
    marketsRaw: [],
    leagues: [],
    books: [],
    statuses: [],
    pricePreset: null,
    price: { min: null, max: null },
    datePreset: null,
    dateFrom: null,
    dateTo: null,
    slate: null,
    hasClose: null,
    twoSidedClose: null,
    refs: [],
    samples: [],
    fuerza: [],
    reasons: [],
    ev: { min: null, max: null },
    prob: { min: null, max: null },
    q: '',
  };
}

/**
 * Price presets. Bounds: min exclusive unless minInc, max inclusive unless maxExc.
 * @type {Array<{ id: string, label: string, min: number | null, max: number | null, minInc?: boolean, maxExc?: boolean }>}
 */
export const PRICE_PRESETS = [
  { id: 'le170', label: '≤ 1.70', min: null, max: 1.7 },
  { id: '170_200', label: '1.70–2.00', min: 1.7, max: 2.0, minInc: true },
  { id: 'lt200', label: '< 2.00', min: null, max: 2.0, maxExc: true },
  { id: 'le200', label: '≤ 2.00', min: null, max: 2.0 },
  { id: '200_250', label: '2.00–2.50', min: 2.0, max: 2.5 },
  { id: 'le250', label: '≤ 2.50', min: null, max: 2.5 },
  { id: '250_400', label: '2.50–4.00', min: 2.5, max: 4.0 },
  { id: 'le400', label: '≤ 4.00', min: null, max: 4.0 },
  { id: 'gt400', label: '> 4.00', min: 4.0, max: null },
];

/** Date presets; resolved against `today` and the data's last slate. */
export const DATE_PRESETS = ['last_slate', '7d', '30d', 'this_month', 'since'];

/** Add days to 'YYYY-MM-DD'. @param {string} d @param {number} n */
export function addDays(d, n) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

/**
 * Concrete [from, to] dates of the state's date filter (inclusive; null = open).
 * @param {FilterState} f @param {{ today: string, lastSlate?: string | null }} ctx
 * @returns {[string | null, string | null]}
 */
export function resolveDates(f, ctx) {
  if (f.slate) return [f.slate, f.slate];
  switch (f.datePreset) {
    case 'last_slate':
      return [ctx.lastSlate || null, ctx.lastSlate || null];
    case '7d':
      return [addDays(ctx.today, -6), ctx.today];
    case '30d':
      return [addDays(ctx.today, -29), ctx.today];
    case 'this_month':
      return [ctx.today.slice(0, 8) + '01', ctx.today];
    case 'since':
      return [f.dateFrom, null];
    default:
      return [f.dateFrom, f.dateTo];
  }
}

/** Last slate date among picks. @param {Pick[]} picks */
export function lastSlate(picks) {
  let last = null;
  for (const p of picks) if (p.date && (!last || p.date > last)) last = p.date;
  return last;
}

/** @param {number | null} v @param {Range} r */
const inRange = (v, r) => (r.min == null || (v != null && v >= r.min)) && (r.max == null || (v != null && v <= r.max));

/** @param {number | null} price @param {FilterState} f */
function priceMatches(price, f) {
  if (f.pricePreset) {
    const p = PRICE_PRESETS.find((x) => x.id === f.pricePreset);
    if (!p) return true;
    if (price == null) return false;
    if (p.min != null && (p.minInc ? price < p.min : price <= p.min)) return false;
    if (p.max != null && (p.maxExc ? price >= p.max : price > p.max)) return false;
    return true;
  }
  return inRange(price, f.price);
}

const fold = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The reference kind of a pick for the 'refs' filter. @param {Pick} p */
export const refOf = (p) => p.parsed.ref || 'none';

/**
 * Apply the filters.
 * @param {Pick[]} picks
 * @param {FilterState} f
 * @param {{ today: string, lastSlate?: string | null }} ctx
 */
export function applyFilters(picks, f, ctx) {
  const [from, to] = resolveDates(f, { lastSlate: lastSlate(picks), ...ctx });
  const q = f.q ? fold(f.q.trim()) : '';
  const words = q ? q.split(/\s+/) : [];
  return picks.filter((p) => {
    if (f.sources.length && !f.sources.includes(p.source)) return false;
    if (f.tags.length && !f.tags.includes(p.tag)) return false;
    if (f.markets.length && !f.markets.includes(p.market)) return false;
    if (f.marketsRaw.length && !f.marketsRaw.includes(p.marketRaw)) return false;
    if (f.leagues.length && !f.leagues.includes(p.league)) return false;
    if (f.books.length && !p.books.some((b) => f.books.includes(b))) return false;
    if (f.statuses.length && !f.statuses.includes(p.status)) return false;
    if (!priceMatches(p.price, f)) return false;
    if (from && p.date < from) return false;
    if (to && p.date > to) return false;
    if (f.hasClose != null && (p.closePrice != null) !== f.hasClose) return false;
    if (f.twoSidedClose != null && p.hasTwoSidedClose !== f.twoSidedClose) return false;
    if (f.refs.length && !f.refs.includes(refOf(p))) return false;
    if (f.samples.length && !f.samples.includes(p.parsed.sample)) return false;
    if (f.fuerza.length && !f.fuerza.includes(p.parsed.fuerza)) return false;
    if (f.reasons.length && !p.parsed.filters.some((r) => f.reasons.includes(r))) return false;
    if (!inRange(p.ev, f.ev)) return false;
    if (!inRange(p.probModel, f.prob)) return false;
    if (words.length) {
      const hay = fold(`${p.match} ${p.league} ${p.selection} ${p.marketRaw} ${p.tagRaw} ${p.notes}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/** Number of active filter groups (for a badge). @param {FilterState} f */
export function countActive(f) {
  const d = defaultFilters();
  let n = 0;
  for (const k of /** @type {Array<keyof FilterState>} */ (Object.keys(d))) {
    if (k === 'price' || k === 'ev' || k === 'prob') {
      const r = /** @type {Range} */ (f[k]);
      if (r.min != null || r.max != null) n++;
    } else if (k === 'dateTo') continue;
    else if (Array.isArray(d[k])) {
      if (/** @type {any[]} */ (f[k]).length) n++;
    } else if (f[k] != null && f[k] !== '' && f[k] !== d[k]) n++;
  }
  return n;
}

// ---------------------------------------------------------------- URL (hash query) round trip

/** Query key per array field. */
const LIST_KEYS = /** @type {const} */ ({
  sources: 'src', tags: 'tag', markets: 'mkt', marketsRaw: 'mraw', leagues: 'lg', books: 'book', statuses: 'st',
  refs: 'ref', samples: 'sample', fuerza: 'fz', reasons: 'why',
});
const RANGE_KEYS = /** @type {const} */ ({ price: ['pmin', 'pmax'], ev: ['evmin', 'evmax'], prob: ['prmin', 'prmax'] });

/**
 * Serialise to a query object (only non-default fields). Lists are comma-joined.
 * @param {FilterState} f
 * @returns {Record<string, string>}
 */
export function toQuery(f) {
  /** @type {Record<string, string>} */
  const q = {};
  for (const [field, key] of Object.entries(LIST_KEYS)) {
    const v = /** @type {string[]} */ (f[/** @type {keyof FilterState} */ (field)]);
    if (v && v.length) q[key] = v.map((x) => encodeURIComponent(x)).join(',');
  }
  for (const [field, [kmin, kmax]] of Object.entries(RANGE_KEYS)) {
    const r = /** @type {Range} */ (f[/** @type {keyof FilterState} */ (field)]);
    if (r.min != null) q[kmin] = String(r.min);
    if (r.max != null) q[kmax] = String(r.max);
  }
  if (f.pricePreset) q.price = f.pricePreset;
  if (f.datePreset) q.date = f.datePreset;
  if (f.dateFrom) q.from = f.dateFrom;
  if (f.dateTo) q.to = f.dateTo;
  if (f.slate) q.slate = f.slate;
  if (f.hasClose != null) q.close = f.hasClose ? '1' : '0';
  if (f.twoSidedClose != null) q.close2 = f.twoSidedClose ? '1' : '0';
  if (f.q) q.q = f.q;
  return q;
}

/**
 * Parse a query object (router's `query`) into a full state. Unknown values are dropped.
 * @param {Record<string, string>} q
 * @returns {FilterState}
 */
export function fromQuery(q = {}) {
  const f = defaultFilters();
  for (const [field, key] of Object.entries(LIST_KEYS)) {
    if (q[key]) /** @type {any} */ (f)[field] = q[key].split(',').filter(Boolean).map((x) => safeDecode(x));
  }
  for (const [field, [kmin, kmax]] of Object.entries(RANGE_KEYS)) {
    /** @type {any} */ (f)[field] = { min: numOrNull(q[kmin]), max: numOrNull(q[kmax]) };
  }
  if (q.price && PRICE_PRESETS.some((p) => p.id === q.price)) f.pricePreset = q.price;
  if (q.date && DATE_PRESETS.includes(q.date)) f.datePreset = q.date;
  if (isDate(q.from)) f.dateFrom = q.from;
  if (isDate(q.to)) f.dateTo = q.to;
  if (isDate(q.slate)) f.slate = q.slate;
  if (q.close === '1' || q.close === '0') f.hasClose = q.close === '1';
  if (q.close2 === '1' || q.close2 === '0') f.twoSidedClose = q.close2 === '1';
  if (q.q) f.q = q.q;
  return f;
}

/** Query string ('a=1&b=2') for a state, for hrefs. @param {FilterState} f */
export function toQueryString(f) {
  return Object.entries(toQuery(f))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

const isDate = (/** @type {unknown} */ s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const numOrNull = (/** @type {unknown} */ s) => (s == null || s === '' || !Number.isFinite(Number(s)) ? null : Number(s));
function safeDecode(/** @type {string} */ s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------------------------------------------------------------- options derived from data

/**
 * Values present in the data, with counts, for each filterable field.
 * @param {Pick[]} picks
 * @returns {Record<string, Array<{ value: string, count: number }>>}
 */
export function filterOptions(picks) {
  /** @type {Record<string, Map<string, number>>} */
  const maps = {};
  const add = (/** @type {string} */ field, /** @type {string | null | undefined} */ v) => {
    if (v == null || v === '') return;
    (maps[field] ||= new Map()).set(v, (maps[field].get(v) || 0) + 1);
  };
  for (const p of picks) {
    add('sources', p.source);
    add('tags', p.tag);
    add('markets', p.market);
    add('marketsRaw', p.marketRaw);
    add('leagues', p.league);
    for (const b of p.books) add('books', b);
    add('statuses', p.status);
    add('refs', refOf(p));
    add('samples', p.parsed.sample);
    add('fuerza', p.parsed.fuerza);
    for (const r of p.parsed.filters) add('reasons', r);
    add('slates', p.date);
  }
  const tagOrder = TAGS.map((t) => t.id);
  const order = /** @type {Record<string, string[]>} */ ({
    sources: ['bets', 'shadow', 'grok'],
    tags: tagOrder,
    markets: MARKET_FAMILIES,
    statuses: ['won', 'lost', 'void', 'half_won', 'half_lost', 'pending', 'other'],
    refs: ['feed', 'consensus', 'books', 'one_book', 'none'],
    samples: ['10+', '6-9'],
    fuerza: ['keeps', 'rejects', 'na'],
  });
  /** @type {Record<string, Array<{ value: string, count: number }>>} */
  const out = {};
  for (const field of ['sources', 'tags', 'markets', 'marketsRaw', 'leagues', 'books', 'statuses', 'refs', 'samples', 'fuerza', 'reasons', 'slates']) {
    const m = maps[field] || new Map();
    const list = [...m.entries()].map(([value, count]) => ({ value, count }));
    const ord = order[field];
    if (ord) list.sort((a, b) => ord.indexOf(a.value) - ord.indexOf(b.value));
    else if (field === 'slates') list.sort((a, b) => (a.value < b.value ? 1 : -1));
    else list.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    out[field] = list;
  }
  return out;
}
