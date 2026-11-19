// Feed -> Dataset ({ picks, decisions, pinnacle, rules }). Builds the unified Pick[] once per feed
// (docs/DATA_CONTRACT.md section 4); everything else derives from it with pure functions.

import { classifyGrok, classifyShadow, marketFamily, reviewClass, sideOf, booksInReason, BOOKS } from './tags.js';
import { grokPriceBooks, grokSameBook, measure, parseNotes } from './notes.js';
import { parseLine } from './lines.js';

/** @typedef {import('./types').Pick} Pick */
/** @typedef {import('./types').Status} Status */
/** @typedef {import('./types').Feed} Feed */
/** @typedef {import('./types').FeedTab} FeedTab */
/** @typedef {import('./types').Dataset} Dataset */

/**
 * Sheet `Estado` -> Status. Unknown text maps to 'other' (shown, never counted).
 * @param {unknown} raw
 * @returns {Status}
 */
export function statusOf(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '' || s === 'pendiente') return 'pending';
  if (s === 'ganada') return 'won';
  if (s === 'perdida') return 'lost';
  if (['nula', 'push', 'devuelta', 'anulada'].includes(s)) return 'void';
  if (s === 'medio ganada' || s === 'media ganada') return 'half_won';
  if (s === 'medio perdida' || s === 'media perdida') return 'half_lost';
  return 'other';
}

/**
 * Rows of a feed tab as objects keyed by the feed keys.
 * @param {FeedTab | undefined} tab
 * @returns {Array<Record<string, any>>}
 */
export function tabObjects(tab) {
  if (!tab || !Array.isArray(tab.columns) || !Array.isArray(tab.rows)) return [];
  const cols = tab.columns;
  return tab.rows.map((r) => {
    /** @type {Record<string, any>} */
    const o = {};
    cols.forEach((c, i) => (o[c] = r[i] === undefined ? null : r[i]));
    return o;
  });
}

const str = (/** @type {unknown} */ v) => (v == null ? '' : String(v));
const num = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** @param {Record<string, any>} r */
function fromShadow(r) {
  const reason = str(r.reason);
  const notes = str(r.notes);
  const tag = classifyShadow(reason);
  const price = num(r.price);
  const base = { notes, reason, market: str(r.market), selection: str(r.selection), price, tag };
  const parsed = parseNotes(base);
  const m = measure({ ...base, closePriceColumn: num(r.closePrice) }, parsed);
  const books = booksInReason(reason);
  if (!books.length && parsed.priceSource && BOOKS.includes(/** @type {any} */ (parsed.priceSource))) books.push(parsed.priceSource);
  return /** @type {Pick} */ ({
    ...common('shadow', r),
    tag,
    tagRaw: reason,
    books,
    stakeU: null,
    profitU: null,
    probModel: num(r.probModel),
    probBlend: num(r.probBlend),
    probAI: num(r.probAI),
    ev: num(r.evBlend),
    fairOdds: num(r.fairOdds),
    // G holds the bet365 feed close; rows priced at a book carry their own close in the notes.
    closePrice: num(r.closePrice) ?? (parsed.priceSource && parsed.bookCloses[parsed.priceSource] ? parsed.bookCloses[parsed.priceSource].close : null),
    notes,
    parsed,
    ...m,
    extra: {},
  });
}

/** @param {Record<string, any>} r */
function fromBet(r) {
  const notes = str(r.notes);
  const book = str(r.book);
  const price = num(r.price);
  const base = { notes, reason: '', market: str(r.market), selection: str(r.selection), price, tag: /** @type {const} */ ('bet') };
  const parsed = parseNotes(base);
  parsed.priceSource = book || parsed.priceSource;
  const m = measure(base, parsed);
  const closePrice = num(r.closePrice);
  // milestone-reviewer: Apuestas CLV only from a close at the bet's own book. A close noted as
  // "cierre: Sofascore/bet365" is cross-source and is not CLV.
  const crossSource = /cierre:\s*Sofascore\/bet365/i.test(notes);
  const clv = crossSource || !price || !closePrice ? null : num(r.clv) ?? price / closePrice - 1;
  const type = str(r.type);
  const pick = /** @type {Pick} */ ({
    ...common('bets', r),
    tag: 'bet',
    tagRaw: type,
    books: book ? [book] : [],
    stakeU: num(r.stakeU),
    profitU: num(r.profitU),
    probModel: num(r.probModel),
    probBlend: num(r.probBlend),
    probAI: num(r.probAI),
    ev: num(r.ev),
    fairOdds: num(r.fairOdds),
    closePrice,
    notes,
    parsed,
    ...m,
    clv,
    clvSource: clv == null ? null : 'own',
    extra: {
      id: num(r.id),
      type,
      confidence: str(r.confidence) || null,
      result: str(r.result) || null,
      favoritesException: str(r.favoritesException) || null,
      maxStakeU: num(r.maxStakeU),
      probLast5: num(r.probLast5),
      sheetClv: num(r.clv),
      clvCrossSource: crossSource ? 1 : 0,
      freeBet: /apuesta gratis|freebet/i.test(notes) ? 1 : 0,
    },
  });
  if (/^(doble|crear apuesta)/i.test(type)) Object.assign(pick, { market: 'combo', line: null, lineKey: null });
  return pick;
}

/** @param {Record<string, any>} r */
function fromGrok(r) {
  const notes = str(r.notes);
  const verdict = str(r.verdict);
  const price = num(r.price);
  const base = { notes, reason: '', market: str(r.market), selection: str(r.selection), price, tag: classifyGrok(verdict) };
  const parsed = parseNotes(base);
  const m = measure(base, parsed);
  // The book Grok's price came from: only a book whose own noted price equals G (audit 3: the CLV book
  // was used as a fallback, so the pick sheet said G "coincide con Betano" when it was Kambi's price).
  const priceBooks = grokPriceBooks(notes, verdict, price);
  const src = priceBooks.includes(/** @type {any} */ (parsed.priceSource)) ? parsed.priceSource : priceBooks[0] || null;
  parsed.priceSource = src;
  const own = src && parsed.bookCloses[src] ? parsed.bookCloses[src].close : null;
  // Grok's G is Grok's quote, not necessarily a price at the book whose close is noted: the measures
  // against the close use that book's own opening (review.py's load_grok; rule 34), and no bet365 feed
  // fallback (a book price is never compared with another source's close). Audit 2, 18 Nov 2026.
  const sb = grokSameBook(notes, verdict, parsed, m.need, str(r.selection));
  const gm = {
    fairCloseEv: sb ? sb.fev : null,
    closeSource: sb ? /** @type {const} */ ('same_book') : null,
    clv: sb ? sb.clv : null,
    clvSource: sb ? /** @type {const} */ ('own') : null,
    openingFairEv: sb ? sb.fev : null,
    closeMargin: sb ? sb.margin : null,
    hasTwoSidedClose: !!sb,
  };
  return /** @type {Pick} */ ({
    ...common('grok', r),
    time: str(r.time) || null,
    tag: base.tag,
    tagRaw: verdict,
    books: src && BOOKS.includes(/** @type {any} */ (src)) ? [src] : [],
    stakeU: num(r.stakeU),
    profitU: null,
    probModel: null,
    probBlend: null,
    probAI: null,
    ev: null,
    fairOdds: null,
    closePrice: sb ? sb.close : own ?? (parsed.close ? parsed.close.price : null),
    notes,
    parsed,
    ...m,
    ...gm,
    extra: { grokOpen: sb ? sb.open : null, grokBook: sb ? sb.book : null, reason: str(r.reason) || null, verdict: verdict || null, minPrice: num(r.minPrice), result: str(r.result) || null },
  });
}

/**
 * Fields every source shares.
 * @param {import('./types').Source} source @param {Record<string, any>} r
 */
function common(source, r) {
  const marketRaw = str(r.market);
  const statusRaw = str(r.status);
  const market = marketFamily(marketRaw);
  return {
    uid: `${source}:${r.row}`,
    source,
    row: Number(r.row),
    date: str(r.date).slice(0, 10),
    time: null,
    league: str(r.league),
    match: str(r.match),
    marketRaw,
    market,
    reviewClass: reviewClass(marketRaw),
    selection: str(r.selection),
    side: sideOf(str(r.selection)),
    ...parseLine(marketRaw, str(r.selection), market),
    price: num(r.price),
    status: statusOf(statusRaw),
    statusRaw,
  };
}

const SOURCE_ORDER = { bets: 0, shadow: 1, grok: 2 };

/** Chronological order: date, then source, then sheet row. @param {Pick} a @param {Pick} b */
export function byDate(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.row - b.row;
}

/**
 * Build the dataset from a validated feed.
 * @param {Feed} feed
 * @returns {Dataset}
 */
export function normalizeFeed(feed) {
  const t = feed.tabs || /** @type {any} */ ({});
  const picks = [
    ...tabObjects(t.bets).filter((r) => str(r.match)).map(fromBet),
    ...tabObjects(t.shadow).filter((r) => str(r.match) || str(r.date)).map(fromShadow),
    ...tabObjects(t.grok).filter((r) => str(r.match) || str(r.date)).map(fromGrok),
  ].sort(byDate);
  const decisions = tabObjects(t.decisions)
    .filter((r) => str(r.topic) || str(r.decision))
    .map((r) => ({
      row: Number(r.row),
      date: str(r.date).slice(0, 10),
      topic: str(r.topic),
      decision: str(r.decision),
      evidence: str(r.evidence),
      review: str(r.review),
      status: str(r.status),
    }));
  return {
    generatedAt: feed.generatedAt,
    meta: feed.meta,
    picks,
    decisions,
    pinnacle: /** @type {any} */ (tabObjects(t.pinnacle)),
    rules: Array.isArray(t.rules) ? t.rules.filter((x) => typeof x === 'string') : [],
  };
}
