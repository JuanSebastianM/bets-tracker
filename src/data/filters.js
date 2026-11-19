// The shared filter state (Explorer and Simulator): one plain object, applied with a pure function
// and serialised to the hash query so a filtered view can be bookmarked.

import { MARKET_FAMILIES, TAGS } from './tags.js';
import { compareLineKeys, isLineKey, LINE_SIDES } from './lines.js';
import { TEST_IDS, testIdsOf } from './tests-config.js';

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
 * @property {string[]} sides         'over' | 'under' (review.py's side of the selection, Pick.side)
 * @property {string[]} lines         lineKey ('cards:under:4.5', 'ah:+0.25'; src/data/lines.js)
 * @property {boolean | null} passedAll  model picks that passed every filter (parsed.passedAll)
 * @property {string[]} tests         ids of tests-config.js TEST_FILTERS (frozen and price-first tests,
 *   stopped categories): the rows the test counts, by its own membership function (URL `test`)
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
    sides: [],
    lines: [],
    passedAll: null,
    tests: [],
  };
}

/**
 * Price presets. Bounds: min exclusive unless minInc, max inclusive unless maxExc. `hidden` presets are
 * not offered as panel chips: they exist so a breakdown row (stats.js PRICE_BANDS) can link to exactly
 * its picks, and still show as an active chip and round-trip through the URL.
 * Labels come from priceRangeLabel (defined below; function declarations are hoisted).
 * @type {Array<{ id: string, label: string, min: number | null, max: number | null, minInc?: boolean, maxExc?: boolean, hidden?: boolean }>}
 */
export const PRICE_PRESETS = [
  { id: 'le170', min: null, max: 1.7 },
  { id: '170_200', min: 1.7, max: 2.0, minInc: true },
  { id: 'lt200', min: null, max: 2.0, maxExc: true },
  { id: 'le200', min: null, max: 2.0 },
  { id: '200_250', min: 2.0, max: 2.5 },
  { id: 'le250', min: null, max: 2.5 },
  { id: '250_400', min: 2.5, max: 4.0 },
  { id: 'le400', min: null, max: 4.0 },
  { id: 'gt400', min: 4.0, max: null },
  { id: 'lt170', min: null, max: 1.7, maxExc: true, hidden: true },
].map((p) => ({ ...p, label: priceRangeLabel(p) }));

/**
 * The label of a price range, built from its bounds so it says exactly what it includes (same
 * convention as PRICE_PRESETS: min exclusive unless minInc, max inclusive unless maxExc):
 * "≤ 2.00", "< 2.00", "> 4.00", "≥ 1.70", "1.70–2.00" (both ends included), "> 2.00, ≤ 2.50" (low end
 * excluded), "≥ 1.70, < 2.00" and "> 1.70, < 2.00" for the other two mixes.
 * @param {{ min: number | null, max: number | null, minInc?: boolean, maxExc?: boolean }} r
 */
export function priceRangeLabel(r) {
  const f = (/** @type {number} */ v) => v.toFixed(2);
  const lo = r.min == null ? '' : `${r.minInc ? '≥' : '>'} ${f(r.min)}`;
  const hi = r.max == null ? '' : `${r.maxExc ? '<' : '≤'} ${f(r.max)}`;
  if (!lo) return hi;
  if (!hi) return lo;
  if (r.minInc && !r.maxExc) return `${f(/** @type {number} */ (r.min))}–${f(/** @type {number} */ (r.max))}`;
  return `${lo}, ${hi}`;
}

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
    if (f.sides && f.sides.length && !f.sides.includes(p.side)) return false;
    if (f.lines && f.lines.length && !f.lines.includes(/** @type {string} */ (p.lineKey))) return false;
    if (f.passedAll != null && Boolean(p.parsed.passedAll) !== f.passedAll) return false;
    if (f.tests && f.tests.length && !testIdsOf(p).some((id) => f.tests.includes(id))) return false;
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
  sides: 'side', lines: 'line',
  tests: 'test',
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
  if (f.passedAll != null) q.pass = f.passedAll ? '1' : '0';
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
  f.sides = f.sides.filter((v) => /** @type {readonly string[]} */ (LINE_SIDES).includes(v));
  f.lines = f.lines.filter(isLineKey);
  if (q.pass === '1' || q.pass === '0') f.passedAll = q.pass === '1';
  f.tests = f.tests.filter((id) => TEST_IDS.includes(id));
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
    add('sides', p.side);
    add('lines', p.lineKey);
    for (const id of testIdsOf(p)) add('tests', id);
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
    sides: [...LINE_SIDES],
    tests: TEST_IDS,
  });
  /** @type {Record<string, Array<{ value: string, count: number }>>} */
  const out = {};
  for (const field of ['sources', 'tags', 'markets', 'marketsRaw', 'leagues', 'books', 'statuses', 'refs', 'samples', 'fuerza', 'reasons', 'slates', 'sides', 'lines', 'tests']) {
    const m = maps[field] || new Map();
    const list = [...m.entries()].map(([value, count]) => ({ value, count }));
    const ord = order[field];
    if (ord) list.sort((a, b) => ord.indexOf(a.value) - ord.indexOf(b.value));
    else if (field === 'slates') list.sort((a, b) => (a.value < b.value ? 1 : -1));
    else if (field === 'lines') list.sort((a, b) => compareLineKeys(a.value, b.value));
    else list.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    out[field] = list;
  }
  return out;
}

// ---------------------------------------------------------------- facet counts (filter panel)

/** List fields of the state, with the value(s) a pick has for each (filterOptions uses the same). */
const FACET_VALUES = /** @type {Record<string, (p: Pick) => Array<string | null>>} */ ({
  sources: (p) => [p.source],
  tags: (p) => [p.tag],
  markets: (p) => [p.market],
  marketsRaw: (p) => [p.marketRaw],
  leagues: (p) => [p.league],
  books: (p) => p.books,
  statuses: (p) => [p.status],
  refs: (p) => [refOf(p)],
  samples: (p) => [p.parsed.sample],
  fuerza: (p) => [p.parsed.fuerza],
  reasons: (p) => p.parsed.filters,
  sides: (p) => [p.side],
  lines: (p) => [p.lineKey],
  tests: (p) => testIdsOf(p),
});

/** The list fields that facetCounts counts. */
export const FACET_FIELDS = Object.keys(FACET_VALUES);

/**
 * How many picks each option would show **under the other active filters** (the option's own field
 * left out), so the panel can grey out options that would give nothing. One count map per list field
 * (`{ value: count }`), plus `pricePresets`, `datePresets`, `slates`, `hasClose` / `twoSidedClose`
 * (`{ yes, no }`) and `total` (picks under the full state).
 * @param {Pick[]} picks all picks (the last slate is taken from them)
 * @param {FilterState} f
 * @param {{ today: string, lastSlate?: string | null }} ctx
 * @returns {Record<string, Record<string, number>> & { total: number }}
 */
export function facetCounts(picks, f, ctx) {
  const c = { lastSlate: lastSlate(picks), ...ctx };
  const d = defaultFilters();
  // Text, EV and probability are never faceted: apply them once.
  const base = applyFilters(picks, { ...d, q: f.q, ev: f.ev, prob: f.prob }, c);
  const rest = { ...f, q: '', ev: d.ev, prob: d.prob };
  /** @type {any} */
  const out = { total: applyFilters(base, rest, c).length };
  const tally = (/** @type {Pick[]} */ list, /** @type {(p: Pick) => Array<string | null>} */ get) => {
    /** @type {Record<string, number>} */
    const m = {};
    for (const p of list) for (const v of new Set(get(p))) if (v != null && v !== '') m[v] = (m[v] || 0) + 1;
    return m;
  };
  for (const field of FACET_FIELDS) {
    out[field] = tally(applyFilters(base, { ...rest, [field]: [] }, c), FACET_VALUES[field]);
  }
  const noPrice = applyFilters(base, { ...rest, pricePreset: null, price: d.price }, c);
  out.pricePresets = Object.fromEntries(PRICE_PRESETS.map((p) => [p.id, applyFilters(noPrice, { ...d, pricePreset: p.id }, c).length]));
  const noDate = applyFilters(base, { ...rest, datePreset: null, dateFrom: null, dateTo: null, slate: null }, c);
  out.datePresets = Object.fromEntries(
    DATE_PRESETS.map((id) => [id, id === 'since' && !f.dateFrom ? noDate.length : applyFilters(noDate, { ...d, datePreset: id, dateFrom: f.dateFrom }, c).length]),
  );
  out.slates = tally(noDate, (p) => [p.date]);
  for (const field of /** @type {const} */ (['hasClose', 'twoSidedClose'])) {
    const list = applyFilters(base, { ...rest, [field]: null }, c);
    const yes = list.filter((p) => (field === 'hasClose' ? p.closePrice != null : p.hasTwoSidedClose)).length;
    out[field] = { yes, no: list.length - yes };
  }
  {
    const list = applyFilters(base, { ...rest, passedAll: null }, c);
    const yes = list.filter((p) => p.parsed.passedAll).length;
    out.passedAll = { yes, no: list.length - yes };
  }
  return out;
}

// ---------------------------------------------------------------- active filters as removable entries

/**
 * @typedef {object} ActiveEntry
 * @property {string} field   state field ('tags', 'pricePreset', 'price', 'date', 'q'…)
 * @property {string} [value] the list value, for list fields
 */

/**
 * Every active filter as one entry (one per list value), in panel order, for removable chips.
 * The date fields (datePreset, dateFrom, dateTo, slate) are one entry 'date' unless a slate is set.
 * @param {FilterState} f
 * @returns {ActiveEntry[]}
 */
export function activeEntries(f) {
  /** @type {ActiveEntry[]} */
  const out = [];
  const list = (/** @type {keyof FilterState} */ field) => {
    for (const value of /** @type {string[]} */ (f[field])) out.push({ field, value });
  };
  list('sources');
  list('tags');
  list('tests');
  if (f.pricePreset) out.push({ field: 'pricePreset', value: f.pricePreset });
  if (f.price.min != null || f.price.max != null) out.push({ field: 'price' });
  if (f.slate) out.push({ field: 'slate', value: f.slate });
  if (f.datePreset || f.dateFrom || f.dateTo) out.push({ field: 'date' });
  list('markets');
  list('marketsRaw');
  list('sides');
  list('lines');
  list('statuses');
  list('leagues');
  list('books');
  if (f.hasClose != null) out.push({ field: 'hasClose', value: f.hasClose ? 'yes' : 'no' });
  if (f.twoSidedClose != null) out.push({ field: 'twoSidedClose', value: f.twoSidedClose ? 'yes' : 'no' });
  list('refs');
  list('samples');
  list('fuerza');
  list('reasons');
  if (f.passedAll != null) out.push({ field: 'passedAll', value: f.passedAll ? 'yes' : 'no' });
  if (f.ev.min != null || f.ev.max != null) out.push({ field: 'ev' });
  if (f.prob.min != null || f.prob.max != null) out.push({ field: 'prob' });
  if (f.q) out.push({ field: 'q', value: f.q });
  return out;
}

/**
 * The state without one active entry (from activeEntries).
 * @param {FilterState} f @param {ActiveEntry} e
 * @returns {FilterState}
 */
export function removeEntry(f, e) {
  const d = defaultFilters();
  const next = { ...f };
  const field = /** @type {keyof FilterState} */ (e.field);
  if (Array.isArray(d[field])) /** @type {any} */ (next)[field] = /** @type {string[]} */ (f[field]).filter((v) => v !== e.value);
  else if (e.field === 'date') Object.assign(next, { datePreset: null, dateFrom: null, dateTo: null });
  else /** @type {any} */ (next)[field] = d[field];
  return next;
}

/**
 * Parse a stored query string ('tag=value&price=le200', as savePreset keeps it) into a state.
 * @param {string} qs
 * @returns {FilterState}
 */
export function fromQueryString(qs) {
  /** @type {Record<string, string>} */
  const q = {};
  for (const [k, v] of new URLSearchParams(String(qs || '').replace(/^[?#]/, ''))) q[k] = v;
  return fromQuery(q);
}

/**
 * Built-in starting points for the panel ("only fill the panel"): a label key under `filters.builtin`
 * and the state patch. `labelKey` (optional) overrides the label key.
 * @type {Array<{ id: string, labelKey?: string, patch: Partial<FilterState> }>}
 */
export const BUILTIN_PRESETS = [
  { id: 'value_le200', patch: { tags: ['value'], pricePreset: 'le200' } },
  { id: 'near_value_le200', patch: { tags: ['near_value'], pricePreset: 'le200' } },
  { id: 'cards_under', patch: { tags: ['cards_under'] } },
  { id: 'team_corners_10', patch: { tags: ['team_corners'], samples: ['10+'] } },
  { id: 'prop_value', patch: { tags: ['prop_value', 'prop_near_value'] } },
  { id: 'real_bets', patch: { sources: ['bets'] } },
  { id: 'two_sided_close', patch: { sources: ['shadow'], twoSidedClose: true } },
  { id: 'cards_under_45', labelKey: 'lines.builtin.cards_under_45', patch: { tags: ['cards_under'], lines: ['cards:under:4.5'] } },
  { id: 'cards_under_55', labelKey: 'lines.builtin.cards_under_55', patch: { tags: ['cards_under'], lines: ['cards:under:5.5'] } },
  { id: 'corners_under_95', labelKey: 'lines.builtin.corners_under_95', patch: { sources: ['shadow'], lines: ['corners:under:9.5'] } },
];

/** Full state of a built-in preset. @param {string} id @returns {FilterState | null} */
export function builtinPreset(id) {
  const b = BUILTIN_PRESETS.find((x) => x.id === id);
  return b ? { ...defaultFilters(), ...b.patch } : null;
}

// ---------------------------------------------------------------- exact links for breakdown rows

/** The graded statuses (the ones stats.js counts). */
export const GRADED_STATUSES = ['won', 'lost', 'void', 'half_won', 'half_lost'];

/**
 * The filter patch that selects exactly one price band of stats.js priceBand (every band id is a
 * PRICE_PRESETS id). @param {string} band
 * @returns {Partial<FilterState>}
 */
export const priceBandPatch = (band) => ({ pricePreset: band, price: { min: null, max: null } });

/**
 * A filter state that selects in the Explorer exactly the picks a breakdown row counts: the current
 * filters plus the row's patch, graded only, without PUBLICADA Y APOSTADA rows and without unpriced
 * rows (summarize and simulate leave those out). The extra conditions are added only when they change
 * the selection, so most links stay as short as the row's own filter.
 * @param {Pick[]} picks all picks
 * @param {FilterState} f the current filters
 * @param {Partial<FilterState>} patch the row (e.g. { lines: ['cards:under:4.5'] })
 * @param {{ today: string, lastSlate?: string | null }} ctx
 * @returns {FilterState}
 */
export function exactSlice(picks, f, patch, ctx) {
  /** @type {FilterState} */
  const next = { ...f, ...patch };
  const graded = f.statuses.filter((s) => GRADED_STATUSES.includes(s));
  next.statuses = graded.length ? graded : [...GRADED_STATUSES];
  const list = applyFilters(picks, next, ctx);
  if (list.some((p) => p.tag === 'published_bet')) {
    const present = new Set(applyFilters(picks, { ...next, tags: [] }, ctx).map((p) => p.tag));
    const base = next.tags.length ? next.tags : TAGS.map((x) => x.id).filter((id) => present.has(id));
    next.tags = base.filter((id) => id !== 'published_bet');
  }
  if (list.some((p) => p.price == null) && !next.pricePreset && next.price.min == null) next.price = { min: 1, max: next.price.max };
  return next;
}
