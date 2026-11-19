// Parses the `Notas` column (docs/DATA_CONTRACT.md section 6) and computes the closing-price
// measures. The parsing and the measures are a port of review.py v1.0 (betting-review skill):
// parse_logger, parse_feed, price_source, book_open_in_note, devig, outcomes_needed, close_prob, measure.
// Patterns match the sheet's Spanish text.

import { BOOKS, filterReasons, passedAll } from './tags.js';

/** @typedef {import('./types').ParsedNotes} ParsedNotes */
/** @typedef {import('./types').Measures} Measures */
/** @typedef {import('./types').BookClose} BookClose */

const NUM = String.raw`\d+(?:[.,]\d+)?`;

/** '1,91' -> 1.91; null when not a number. @param {unknown} x */
export function fnum(x) {
  if (x == null) return null;
  const s = String(x).trim().replace('%', '').replace(',', '.').replace('−', '-');
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

const LINE_TOKEN = /(?<![\w.])(?:[OUou]\s?\d+(?:[.,]\d+)?|[+\-−]\d+(?:[.,]\d+)?)(?![\w.])/g;

/** The price in one 'label price' part: its last number, after dropping line tokens (O9.5, +0.5). */
function partPrice(/** @type {string} */ part) {
  const t = part.replace(LINE_TOKEN, ' ');
  const nums = t.match(/(?<![\w.,])\d+(?:[.,]\d+)?(?![\w]|[.,]\d)/g);
  if (!nums) return null;
  const v = fnum(nums[nums.length - 1]);
  return v != null && v >= 1.01 && v <= 60 ? v : null;
}

/** Other outcome prices of the same line from the text inside the parentheses. */
function otherSides(/** @type {string} */ inner, /** @type {number} */ need) {
  if (!inner.trim()) return [];
  if (need === 1) {
    const first = inner.split(';')[0];
    if (/\bsolo\b|\bsin (?:under|over|otro)/i.test(first)) return [];
    for (const part of first.split(/[,/]/)) {
      const v = partPrice(part);
      if (v != null) return [v];
    }
    return [];
  }
  const out = [];
  for (const part of inner.split(/[,;/]/)) {
    const v = partPrice(part);
    if (v != null) out.push(v);
  }
  return out.slice(0, need);
}

/** '1X2 1.62/3.90/5.40' inside a close note -> [home, draw, away]. */
function triple(/** @type {string} */ text) {
  const m = TRIPLE_RE.exec(text || '');
  return m ? [fnum(m[1]), fnum(m[2]), fnum(m[3])] : null;
}

// Patterns compiled once (they used to be rebuilt on every call: the main cost of normalize at a few
// thousand rows). Same sources and flags as before; none is global except FEED_PRICE_RE, which is only
// used with matchAll (which works on a copy).
const TRIPLE_RE = new RegExp(String.raw`1X2\s+(${NUM})\s*/\s*(${NUM})\s*/\s*(${NUM})`);
const CLV_RE = new RegExp(String.raw`^CLV\s+([+\-−]?${NUM})\s*%(?:\s+vs\s+(?:Cuota\s*\(\s*)?(Betano|Betsson|Stake))?`);
const EV_JUSTA_RE = new RegExp(String.raw`^EV justa\s+([+\-−]?${NUM})\s*%(?:\s+\(otro lado de (\w+)\))?`);
const FEED_PRICE_RE = new RegExp(String.raw`(?<![\w])feed\s+(${NUM})(?![\d.,:/])`, 'g');
const FEED_CLOSE_RE = new RegExp(String.raw`cierre:\s*Sofascore/bet365\s+(?:(?:1X|X2|12)\s+)?(${NUM})(?:\s*\(([^)]*)\))?`);
const THREE_WAY_RE = new RegExp(String.raw`^\s*1\s+(${NUM})\s*/\s*X\s+(${NUM})\s*/\s*2\s+(${NUM})`);
const FEED_OPEN_RE = new RegExp(String.raw`(?<!1X2 )apertura feed\s+(${NUM})\s*\(otro lado\s+(${NUM})(;\s*invertida\?)?`);
const FEED_SOURCE_RE = new RegExp(String.raw`Precio feed Sofascore|(?:^|\|\s*)bet365 feed(?:\s*\||\s*$|\.|\s+${NUM})`);
const PIN_RE = new RegExp(String.raw`\bpin (${NUM})/(${NUM})/(${NUM}) \(([^)]+)\)(?:\s*\|\s*pin id ([0-9a-f]+))?`);
const OPEN_1X2_RE = new RegExp(String.raw`1X2 apertura feed (${NUM})/(${NUM})/(${NUM})`);
const BOOK_PRICE_SEG_RE = new RegExp(String.raw`^(Betano|Betsson|Stake)\s+@?(?:[OUou]\s?\d+(?:[.,]\d+)?\s+@?)?(${NUM})(?!\d|[.,]\d)\s*(?:\((.*)\))?`);
/** @type {Map<string, RegExp>} */
const BOOK_RES = new Map();
/** A book's "price/other" ('pair') or single price ('one') pattern, cached per book. @param {string} book @param {'pair' | 'one'} kind */
function bookRe(book, kind) {
  const key = `${kind}:${book}`;
  let re = BOOK_RES.get(key);
  if (!re) {
    re = kind === 'pair'
      ? new RegExp(book + String.raw`\s+(?:\d+(?:[.,]\d+)?\s+)?(${NUM})\s*/\s*(${NUM})(?!\d|[.,]\d)`)
      : new RegExp(book + String.raw`\s+@?(?:[OUou]\s?\d+(?:[.,]\d+)?\s+@?)?(${NUM})(?!\d|[.,]\d)`);
    BOOK_RES.set(key, re);
  }
  return re;
}

/** Split on `sep` outside parentheses. */
function splitTop(/** @type {string} */ text, sep = ';') {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const PIECE = new RegExp(
  String.raw`^(?:Cierr[ea]:?\s+)?(Betano|Betsson|Stake)\s+(?:(?:[OUou]\s?\d+(?:[.,]\d+)?|1X|X2|12|X|[OUou]|over|under)\s+)?(${NUM})(?!\d|[.,]\d)\s*(?:\((.*))?`,
  'is',
);

const capitalize = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * clv-logger segments: "Cierre Betano 1.98 (U3.5 1.78); Betsson …; 9 nov 14:22 8 min antes | CLV +2.07% vs Betano | EV justa -3.63%".
 * @param {string} n notes
 * @param {1 | 2 | 'dc'} need
 */
export function parseLogger(n, need = 1) {
  /** @type {{ books: Record<string, BookClose>, clvText: number | null, clvBook: string | null, evText: number | null, evOtherBook: string | null, hasSegment: boolean }} */
  const out = { books: {}, clvText: null, clvBook: null, evText: null, evOtherBook: null, hasSegment: false };
  const k = need === 1 || need === 2 ? need : 1;
  for (const s of n.split(' | ').map((x) => x.trim())) {
    if (/^Cierr[ea]:?\s+(Betano|Betsson|Stake)\b/i.test(s)) {
      out.hasSegment = true;
      for (const piece of splitTop(s)) {
        const m = PIECE.exec(piece);
        if (!m) continue;
        const book = capitalize(m[1]);
        const close = fnum(m[2]);
        let inner = m[3] || '';
        if (inner.includes(')')) inner = inner.slice(0, inner.lastIndexOf(')'));
        if (close && !out.books[book]) out.books[book] = { close, others: otherSides(inner, k), triple: triple(inner) };
      }
    }
    let m = CLV_RE.exec(s);
    if (m) {
      out.clvText = fnum(m[1].replace('−', '-')) / 100;
      out.clvBook = m[2] || null;
    }
    m = EV_JUSTA_RE.exec(s);
    if (m) {
      out.evText = fnum(m[1].replace('−', '-')) / 100;
      out.evOtherBook = m[2] || null;
    }
  }
  return out;
}

/**
 * bet365 feed notes: the price logged ('feed X'), the close and its other side(s), the opening.
 * @param {string} n
 * @param {1 | 2 | 'dc'} need
 */
export function parseFeed(n, need = 1) {
  const out = {
    feedOpen: /** @type {number | null} */ (null),
    feedClose: /** @type {number | null} */ (null),
    feedOthers: /** @type {number[]} */ ([]),
    feedTriple: /** @type {number[] | null} */ (null),
    openInit: /** @type {number | null} */ (null),
    openInitOther: /** @type {number | null} */ (null),
    inverted: false,
  };
  const k = need === 1 || need === 2 ? need : 1;
  for (const m of n.matchAll(FEED_PRICE_RE)) {
    const before = n.slice(Math.max(0, m.index - 12), m.index).toLowerCase().trimEnd();
    if (['apertura', '1x2', 'ref', 'el', 'sin'].some((w) => before.endsWith(w))) continue;
    out.feedOpen = fnum(m[1]);
    break;
  }
  let m = FEED_CLOSE_RE.exec(n);
  if (m) {
    out.feedClose = fnum(m[1]);
    const inner = m[2] || '';
    out.feedTriple = triple(inner);
    const three = THREE_WAY_RE.exec(inner);
    if (three) {
      const rest = [fnum(three[1]), fnum(three[2]), fnum(three[3])];
      const i = rest.findIndex((v) => Math.abs(v - out.feedClose) < 0.006);
      if (i >= 0) rest.splice(i, 1);
      out.feedOthers = rest.length === 2 ? rest : [];
    } else {
      out.feedOthers = otherSides(inner.replace(/^\s*otro lado\s*/, ''), k);
    }
  }
  m = FEED_OPEN_RE.exec(n);
  if (m) {
    out.openInit = fnum(m[1]);
    out.openInitOther = fnum(m[2]);
    out.inverted = !!m[3];
  }
  return out;
}

const BOOK_PRICE = new RegExp(String.raw`(Betano|Betsson|Stake)\s+@?(?:[OUou](?:\s?\d+(?:[.,]\d+)?)?\s+@?)?(${NUM})(?!\d|[.,]\d)`, 'g');

/**
 * Where the logged price came from: 'feed', a book name, or null (review.py's price_source).
 * @param {string} reason column L (Sombra) or '' @param {string} n notes @param {number | null} price
 * @param {{ clvBook: string | null }} lg
 */
export function priceSource(reason, n, price, lg) {
  if (/^\s*IA-WATCH/i.test(reason) || FEED_SOURCE_RE.test(n)) return 'feed';
  let m = /Precio (Betano|Betsson|Stake)\b/.exec(n);
  if (m) return m[1];
  m = /^\s*VALOR(?: PROP)?(?: CASI)?:\s*(Betano|Betsson|Stake)\b/.exec(reason);
  if (m) return m[1];
  const pre = n.split(/\|\s*[Cc]ierr[ea]:?\s+(?:Betano|Betsson|Stake)/)[0];
  for (const seg of pre.split(' | ')) if (BOOKS.includes(/** @type {any} */ (seg.trim()))) return seg.trim();
  const cands = [];
  if (price) {
    for (const mm of pre.matchAll(BOOK_PRICE)) {
      const v = fnum(mm[2]);
      if (v != null && Math.abs(v - price) < 0.006 && !cands.includes(mm[1])) cands.push(mm[1]);
    }
  }
  if (lg.clvBook && cands.includes(lg.clvBook)) return lg.clvBook;
  if (cands.length) return cands[0];
  return lg.clvBook || null;
}

/** A book's price for the row's line written when the row was logged (review.py's book_open_in_note). */
function bookOpenInNote(/** @type {string} */ n, /** @type {string} */ book, sel = '') {
  const pre = n.split(/\|\s*[Cc]ierr[ea]:?\s+(?:Betano|Betsson|Stake)/)[0];
  let m = bookRe(book, 'pair').exec(pre);
  if (m) {
    const s = sel.toLowerCase();
    if (s.includes('under') || s.includes('menos')) return fnum(m[2]);
    if (s.includes('over') || s.includes('más') || s.includes('mas ')) return fnum(m[1]);
    return null;
  }
  m = bookRe(book, 'one').exec(pre);
  return m ? fnum(m[1]) : null;
}

/**
 * Proportional de-vig: (probability of the pick, overround).
 * @param {number} c the pick's closing price @param {number[]} others the other outcomes' prices
 * @returns {[number, number]}
 */
export function devig(c, others) {
  const inv = 1 / c + others.reduce((s, o) => s + 1 / o, 0);
  return [1 / c / inv, inv - 1];
}

/**
 * Power-method de-vig (valor_prop.py): k with sum(q_i^k) = 1, probability q_pick^k.
 * @param {number} c @param {number[]} others
 */
export function powerProb(c, others) {
  const qs = [1 / c, ...others.map((o) => 1 / o)];
  const sum = qs.reduce((a, b) => a + b, 0);
  if (sum <= 1) return qs[0] / sum;
  let lo = 1;
  let hi = 50;
  for (let i = 0; i < 80; i++) {
    const k = (lo + hi) / 2;
    if (qs.reduce((a, q) => a + q ** k, 0) > 1) lo = k;
    else hi = k;
  }
  return qs[0] ** ((lo + hi) / 2);
}

const THREE_WAY_MARKET_RE = /^(?:c[oó]rners 1x2|tarjetas 1x2|m[aá]s c[oó]rners|m[aá]s tarjetas)/;

/**
 * Outcomes a close must show to be de-vigged: 2 for a 1X2, 1 for a two-way line, 'dc' for a double chance.
 * @param {string} market
 * @returns {1 | 2 | 'dc'}
 */
export function outcomesNeeded(market) {
  const m = String(market || '').trim().toLowerCase();
  if (m.startsWith('1x2')) return 2;
  // Three-way corner and card markets (Grok's 'Córners 1X2', 'Más córners (equipo)', 'Tarjetas 1X2',
  // 'Más tarjetas (3 vías)'): a close needs the draw and the other team (audit 2, 18 Nov 2026). As a
  // two-way line the draw was read as the only other side and the fair probability came out far too high.
  if (THREE_WAY_MARKET_RE.test(m)) return 2;
  if (m.startsWith('doble oportunidad')) return 'dc';
  return 1;
}

/**
 * (de-vigged probability of the row's side, closing overround) or null when the close lacks a side.
 * @param {number | null} close @param {number[]} others @param {number[] | null} tri
 * @param {1 | 2 | 'dc'} need @param {string} sel
 * @returns {[number, number] | null}
 */
export function closeProb(close, others, tri, need, sel) {
  if (need === 'dc') {
    if (!tri) return null;
    const [h, d, a] = tri.map((x) => 1 / x);
    const inv = h + d + a;
    const s = String(sel || '').trim().toUpperCase();
    const pick = s.startsWith('1X') ? h + d : s.startsWith('X2') ? d + a : s.startsWith('12') ? h + a : null;
    return pick ? [pick / inv, inv - 1] : null;
  }
  if (close && others.length === need) return devig(close, others);
  return null;
}

/**
 * Parse a row's notes. `reason` is the Sombra `Motivo de descarte` (or '' for other tabs).
 * @param {{ notes: string, reason?: string, market: string, selection?: string, price: number | null, tag: import('./types').TagId }} row
 * @returns {ParsedNotes}
 */
export function parseNotes(row) {
  const n = String(row.notes || '');
  const reason = String(row.reason || '');
  const need = outcomesNeeded(row.market);
  const lg = parseLogger(n, need);
  const fd = parseFeed(n, need);

  let ref = /** @type {ParsedNotes['ref']} */ (null);
  /** @type {string[]} */
  let refBooks = [];
  let refCount = null;
  let m;
  if (/\bref feed\b/.test(n)) {
    ref = 'feed';
    refCount = 1;
  } else if ((m = /\bref consenso (\d+) fuentes(?:\s*\(([^)]*)\))?/.exec(n))) {
    ref = 'consensus';
    refCount = Number(m[1]);
    refBooks = m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : [];
  } else if ((m = /\bref (\d+) casas(?:\s*\(([^)]*)\))?/.exec(n))) {
    ref = 'books';
    refCount = Number(m[1]);
    refBooks = m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : [];
  } else if ((m = /\bref 1 casa(?:\s*\(([^)]*)\))?/.exec(n))) {
    ref = 'one_book';
    refCount = 1;
    refBooks = m[1] ? [m[1].trim()] : [];
  }

  const sample = /muestra 10\+/.test(n) ? '10+' : /muestra 6[-–]9/.test(n) ? '6-9' : null;

  let fuerza = /** @type {ParsedNotes['fuerza']} */ (null);
  let fuerzaExpected = null;
  let fuerzaProb = null;
  if ((m = /FUERZA:\s*esperado\s+([\d.]+),\s*prob\s+([\d.]+)%,\s*(MANTIENE|RECHAZA)/.exec(n))) {
    fuerzaExpected = fnum(m[1]);
    fuerzaProb = fnum(m[2]) / 100;
    fuerza = m[3] === 'MANTIENE' ? 'keeps' : 'rejects';
  } else if (/FUERZA:\s*n\/a/.test(n)) fuerza = 'na';

  let pin = null;
  let pinMissing = null;
  if ((m = PIN_RE.exec(n))) {
    pin = { home: fnum(m[1]), draw: fnum(m[2]), away: fnum(m[3]), readUtc: m[4], id: m[5] || null };
  } else if ((m = /\bpin n\/d \(([^)]+)\)/.exec(n))) pinMissing = m[1];

  let open1x2 = /** @type {ParsedNotes['open1x2']} */ (null);
  if ((m = OPEN_1X2_RE.exec(n))) {
    open1x2 = { home: fnum(m[1]), draw: fnum(m[2]), away: fnum(m[3]) };
  } else if (/1X2 apertura feed n\/a/.test(n)) open1x2 = 'n/a';

  const closeMissing = (m = /cierre feed: sin línea\s*([^|]*)/.exec(n)) ? m[1].trim() || 'sin línea' : null;

  // Book prices written when the row was logged (before any close segment).
  const pre = n.split(/\|\s*[Cc]ierr[ea]:?\s+(?:Betano|Betsson|Stake)/)[0];
  /** @type {import('./types').BookPrice[]} */
  const bookPrices = [];
  for (const seg of pre.split(' | ')) {
    const s = seg.trim();
    const bp = BOOK_PRICE_SEG_RE.exec(s);
    if (bp) {
      if (!bookPrices.some((b) => b.book === bp[1])) bookPrices.push({ book: bp[1], price: fnum(bp[2]), other: bp[3] ? bp[3].trim() : null, unavailable: null });
      continue;
    }
    const na = /^(Betano|Betsson|Stake)\s+((?:sin|no)\b.*)$/i.exec(s);
    if (na && !bookPrices.some((b) => b.book === capitalize(na[1]))) {
      bookPrices.push({ book: capitalize(na[1]), price: null, other: null, unavailable: na[2] });
    }
  }

  const close = fd.feedClose
    ? { price: fd.feedClose, source: /** @type {const} */ ('feed'), book: /** @type {const} */ ('bet365'), others: fd.feedOthers, triple: fd.feedTriple }
    : null;

  return {
    priceSource: priceSource(reason, n, row.price, lg),
    feedPrice: fd.feedOpen,
    feedOpen: fd.openInit,
    feedOpenOther: fd.openInitOther,
    feedOpenFlipped: fd.inverted,
    ref,
    refBooks,
    refCount,
    sample,
    fuerza,
    fuerzaExpected,
    fuerzaProb,
    pin,
    pinMissing,
    open1x2,
    close,
    closeMissing,
    bookCloses: lg.books,
    loggerClv: lg.clvText,
    loggerClvBook: lg.clvBook,
    loggerEv: lg.evText,
    loggerEvOtherBook: lg.evOtherBook,
    bookPrices,
    modelMean: (m = /media modelo ([\d.]+)/.exec(n)) ? fnum(m[1]) : null,
    aiMean: (m = /IA media ([\d.]+)/.exec(n)) ? fnum(m[1]) : null,
    singleSource: /una sola fuente/i.test(n),
    filters: filterReasons(row.tag, reason, n),
    passedAll: passedAll(reason, n),
  };
}

/**
 * Closing-price measures of one row (review.py's measure()).
 *  - fairCloseEv: price × de-vigged closing probability − 1, at the row's own book when the notes have
 *    a two-sided clv-logger close there, otherwise at the bet365 feed (the frozen tests' measure).
 *  - clv: raw CLV, opening / close − 1, same source only; first of own book, feed, IA-WATCH book opening.
 *  - openingFairEv / closeMargin: milestone-reviewer's fair-close EV and the closing overround at that source.
 * `closePriceColumn` is the sheet's close column (Sombra G), used as the feed close when the note lacks it.
 * @param {{ notes: string, reason?: string, market: string, selection: string, price: number | null, closePriceColumn?: number | null }} row
 * @param {ParsedNotes} parsed
 * @returns {Measures}
 */
export function measure(row, parsed) {
  const n = String(row.notes || '');
  const need = outcomesNeeded(row.market);
  const F = row.price;
  const sel = row.selection || '';
  const src = parsed.priceSource;
  /** @type {Record<string, number>} */
  const clv = {};
  /** @type {Record<string, number>} */
  const fev = {};
  /** @type {Record<string, number>} */
  const margin = {};
  let pvc = null;
  let pvcSrc = /** @type {'same_book' | 'feed' | null} */ (null);

  let ownBook = BOOKS.includes(/** @type {any} */ (src)) ? src : null;
  let openOwn = ownBook ? F : null;
  let kind = 'own';
  const books = parsed.bookCloses;
  if (!ownBook && src === 'feed' && Object.keys(books).length) {
    const b = parsed.loggerClvBook || BOOKS.find((x) => books[x]) || null;
    const o = b ? bookOpenInNote(n, b, sel) : null;
    if (b && o) {
      ownBook = b;
      openOwn = o;
      kind = 'ia_open';
    }
  }
  if (ownBook && openOwn && books[ownBook]) {
    const bk = books[ownBook];
    clv[kind] = openOwn / bk.close - 1;
    const cp = closeProb(bk.close, bk.others, bk.triple, need, sel);
    if (cp) {
      fev[kind] = openOwn * cp[0] - 1;
      margin[kind] = cp[1];
      if (kind === 'own' && F) {
        pvc = F * cp[0] - 1;
        pvcSrc = 'same_book';
      }
    }
  }

  const feedClose = parsed.close ? parsed.close.price : null;
  const openFeed = src === 'feed' ? F : parsed.feedPrice;
  const closeFeed = feedClose || row.closePriceColumn || null;
  if (openFeed && closeFeed) {
    clv.feed = openFeed / closeFeed - 1;
    const cp = feedClose ? closeProb(feedClose, parsed.close.others, parsed.close.triple, need, sel) : null;
    if (cp) {
      fev.feed = openFeed * cp[0] - 1;
      margin.feed = cp[1];
    }
  }
  let evVsFeed = null;
  const cpf = F && feedClose ? closeProb(feedClose, parsed.close.others, parsed.close.triple, need, sel) : null;
  if (cpf) {
    evVsFeed = F * cpf[0] - 1;
    if (pvc == null) {
      pvc = evVsFeed;
      pvcSrc = 'feed';
    }
  }

  const first = (/** @type {Record<string, number>} */ obj) => /** @type {const} */ (['own', 'feed', 'ia_open']).find((k) => k in obj) || null;
  const fk = first(fev);
  const ck = first(clv);
  return {
    fairCloseEv: pvc,
    closeSource: pvcSrc,
    clv: ck ? clv[ck] : null,
    clvSource: ck,
    openingFairEv: fk ? fev[fk] : null,
    closeMargin: fk ? margin[fk] : null,
    evVsFeed,
    need,
    hasTwoSidedClose: pvc != null,
  };
}

/**
 * A Grok pick's same-book figures (review.py v1.1's load_grok): the opening is the book's own price in
 * the notes (a segment that starts with the book) or in our verdict, never Grok's price in G, which is
 * often another book's (Kambi) or Grok's own quote. Among the books with a two-sided close whose
 * opening is within 30% of their close, the CLV book first, then the higher opening.
 * Returns null when no book qualifies.
 * @param {string} n notes @param {string} verdict column K @param {ParsedNotes} parsed
 * @param {1 | 2 | 'dc'} need @param {string} sel
 * @returns {{ book: string, open: number, close: number, clv: number, fev: number, margin: number } | null}
 */
export function grokSameBook(n, verdict, parsed, need, sel) {
  const pre = String(n || '').split(/\|\s*[Cc]ierr[ea]:?\s+(?:Betano|Betsson|Stake)/)[0];
  const openOf = (/** @type {string} */ book) => {
    for (const seg of pre.split(' | ')) {
      const m = new RegExp(String.raw`^\s*${book}\s+@?(${NUM})(?!\d|[.,]\d)`).exec(seg);
      if (m) return fnum(m[1]);
    }
    const m = new RegExp(String.raw`${book}\s+(${NUM})(?!\d|[.,]\d)`).exec(verdict || '');
    return m ? fnum(m[1]) : null;
  };
  /** @type {{ pref: boolean, open: number, book: string, close: number, cp: [number, number] }[]} */
  const cands = [];
  for (const b of BOOKS) {
    const bk = parsed.bookCloses[b];
    if (!bk) continue;
    const o = openOf(b);
    const cp = closeProb(bk.close, bk.others, bk.triple, need, sel);
    if (o && cp && Math.abs(o / bk.close - 1) <= 0.3) cands.push({ pref: b === parsed.loggerClvBook, open: o, book: b, close: bk.close, cp });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => Number(b.pref) - Number(a.pref) || b.open - a.open);
  const c = cands[0];
  return { book: c.book, open: c.open, close: c.close, clv: c.open / c.close - 1, fev: c.open * c.cp[0] - 1, margin: c.cp[1] };
}
