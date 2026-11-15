// Glossary and rules content (src/content/*.json): loader (fetch once per locale, cached), index and
// search. Content is static text shipped with the app (precached by the service worker), so the
// glossary works offline and without the feed.
import { fold } from './decisions.js';

/**
 * @typedef {object} GlossaryEntry
 * @property {string} slug        stable kebab-case English id (#/glossary/<slug>)
 * @property {string} term        as shown (the sheet's label for tag entries)
 * @property {string[]} [aliases] other names searched too
 * @property {string} category    one of the categories' ids
 * @property {string} short       one or two plain sentences
 * @property {string} inSheet     how Juan's system uses it
 * @property {string} [example]   tiny worked example (prices, probabilities, units; never money)
 * @property {string[]} [related] slugs
 * @property {{ tags?: string[], markets?: string[], statuses?: string[], reasons?: string[], notes?: string[] }} [covers]
 *   the data ids this entry explains (TagId, MarketFamily, Status, FilterReason, ParsedNotes field)
 */

/**
 * @typedef {object} RuleEntry
 * @property {number} n
 * @property {string} slug        'rule-<n>'
 * @property {string} title
 * @property {string} [short]     one plain sentence a casual bettor understands ("En corto: …")
 * @property {string} says        two to four plain sentences
 * @property {string} [why]       the lesson behind it, when the skill gives one
 * @property {'in_force' | 'provisional' | 'paused' | 'stopped' | 'replaced'} state
 * @property {string | null} since  YYYY-MM-DD, or null when the skill gives no date
 * @property {string} [stateNote] e.g. "replaced by rule 29 for results and goals"
 * @property {number[]} decisions Decisiones rows that back it
 * @property {string[]} [terms]   glossary slugs it uses
 */

/**
 * @typedef {object} Content
 * @property {Array<{ id: string, label: string }>} categories
 * @property {GlossaryEntry[]} entries   sorted by term
 * @property {Map<string, GlossaryEntry>} bySlug
 * @property {RuleEntry[]} rules         sorted by number
 * @property {Map<number, RuleEntry>} ruleByN
 * @property {GlossaryEntry[]} [fileOrder]  entries as written in the file (the inline-link index uses it)
 */

/** Rule states in display order. */
export const RULE_STATES = /** @type {const} */ (['in_force', 'provisional', 'paused', 'stopped', 'replaced']);

/**
 * Build the index from the two parsed files.
 * @param {{ categories: Array<{ id: string, label: string }>, entries: GlossaryEntry[] }} glossary
 * @param {{ rules: RuleEntry[] }} rules
 * @returns {Content}
 */
export function buildContent(glossary, rules) {
  const entries = [...(glossary.entries || [])].sort((a, b) => fold(a.term).localeCompare(fold(b.term)));
  const list = [...(rules.rules || [])].sort((a, b) => a.n - b.n);
  return {
    categories: glossary.categories || [],
    entries,
    bySlug: new Map(entries.map((e) => [e.slug, e])),
    rules: list,
    ruleByN: new Map(list.map((r) => [r.n, r])),
    fileOrder: [...(glossary.entries || [])],
  };
}

/** @type {Map<string, Promise<Content>>} */
const cache = new Map();

/**
 * Load the content for a locale once (later calls reuse the same promise). A failed load is not
 * cached, so the next call retries.
 * @param {'es' | 'en'} locale
 * @param {{ base?: string, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<Content>}
 */
export function loadContent(locale, opts = {}) {
  const base = opts.base ?? './';
  const key = `${base}|${locale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const f = opts.fetchImpl || fetch;
  const get = async (/** @type {string} */ name) => {
    const res = await f(`${base}src/content/${name}.${locale}.json`);
    if (!res.ok) throw new Error(`Could not load ${name}.${locale}.json: ${res.status}`);
    return res.json();
  };
  const p = Promise.all([get('glossary'), get('rules')]).then(([g, r]) => buildContent(g, r));
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

/** Forget loaded content (tests). */
export function clearContentCache() {
  cache.clear();
}

/** The A–Z letter of a term ('#' for digits and symbols). @param {string} term */
export function letterOf(term) {
  const c = fold(term).replace(/^[^a-z0-9]+/, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

/**
 * Search entries by term, aliases and definitions (accents and case ignored), optionally in one
 * category. With a query, results are ranked: term starts with it, term contains it, an alias
 * contains it, then the definitions; otherwise the order is alphabetical.
 * @param {GlossaryEntry[]} entries
 * @param {{ q?: string, category?: string }} [opts]
 */
export function searchGlossary(entries, opts = {}) {
  const q = fold(opts.q || '').trim();
  const inCat = opts.category ? entries.filter((e) => e.category === opts.category) : entries;
  if (!q) return inCat;
  /** @type {Array<{ e: GlossaryEntry, score: number }>} */
  const scored = [];
  for (const e of inCat) {
    const term = fold(e.term);
    let score = 0;
    if (term.startsWith(q)) score = 4;
    else if (term.includes(q)) score = 3;
    else if ((e.aliases || []).some((a) => fold(a).includes(q)) || fold(e.slug).includes(q)) score = 2;
    else if (fold(`${e.short}\n${e.inSheet}\n${e.example || ''}`).includes(q)) score = 1;
    if (score) scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score || fold(a.e.term).localeCompare(fold(b.e.term))).map((x) => x.e);
}

/**
 * Group (alphabetically ordered) entries by letter.
 * @param {GlossaryEntry[]} entries
 * @returns {Array<{ letter: string, items: GlossaryEntry[] }>}
 */
export function groupByLetter(entries) {
  /** @type {Map<string, GlossaryEntry[]>} */
  const by = new Map();
  for (const e of entries) {
    const l = letterOf(e.term);
    if (!by.has(l)) by.set(l, []);
    by.get(l).push(e);
  }
  return [...by.keys()].sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b))).map((letter) => ({ letter, items: by.get(letter) }));
}

/**
 * Rules in number order, optionally only one state; with a query, rules whose number, title or text
 * match (accents and case ignored).
 * @param {RuleEntry[]} rules
 * @param {{ state?: string, q?: string }} [opts]
 */
export function filterRules(rules, opts = {}) {
  const q = fold(opts.q || '').trim();
  return rules.filter((r) => {
    if (opts.state && r.state !== opts.state) return false;
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(r.n) === q;
    return fold(`${r.title}\n${r.short || ''}\n${r.says}\n${r.why || ''}`).includes(q);
  });
}

/** How many rules per state. @param {RuleEntry[]} rules */
export function ruleStateCounts(rules) {
  /** @type {Record<string, number>} */
  const out = Object.fromEntries(RULE_STATES.map((s) => [s, 0]));
  for (const r of rules) out[r.state] = (out[r.state] || 0) + 1;
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Inline term links: the glossary's own terms and aliases found in a text, first occurrence per
// paragraph. Data only (tokens); the UI renders each token as text or a link, never as HTML.
// ---------------------------------------------------------------------------------------------------

/**
 * Needles too common to link (folded, lower case): ordinary words that are also aliases.
 */
const TERM_SKIP = new Set([
  'cuota', 'precio', 'odds', 'price', 'apuesta', 'apuestas', 'u', 'n', 'z', 'ic', 'ci', 'over', 'under', 'mas de', 'menos de',
  'favorito', 'favourite', 'favorite', 'media', 'mean', 'tope', 'cap', 'minima', 'plano', 'flat', 'live', 'value', 'valor', 'suerte',
  'azar', 'luck', 'noise', 'movimiento', 'movement', 'historial', 'ganador', 'resultado', 'winner', 'match result', 'doble',
  'double', 'combo', 'feed', 'sample', 'muestra', 'ratio', 'gap', 'brecha', 'referencia', 'reference', 'rechazo', 'reject',
  'rejected', 'apertura', 'opening', 'close', 'power', 'proporcional', 'proportional', 'sharp', 'soft', 'edge', 'ventaja',
  'return', 'mix', 'mezcla', 'forma', 'form', 'escaneo', 'scan', 'salto', 'skip', 'omitir', 'candidato', 'candidate', 'publicable',
  'publishable', 'filler', 'relleno', 'tiros', 'shots', 'tarjetas', 'cards', 'corners', 'esquinas', 'card', 'equilibrio', 'acierto',
  'stake', 'monto apostado', 'bet size', 'amount staked', 'asiatico', 'asian', 'handicap', 'hit rate', 'otro lado', 'sin linea',
  'solo over', 'won', 'win', 'lost', 'loss', 'void', 'push', 'refund', 'pending', 'open', 'replaced', 'in force', 'provisional',
  'devuelta', 'anulada', 'calibrado', 'calibrated', 'milestone', 'gate', 'puerta', 'ia', 'ai', 'model mean', 'real bet', 'priced',
  'not priced', 'no verdict', 'unidades', 'units', 'unidad', 'ganada', 'perdida', 'nula', 'pendiente', 'vigente', 'abierta',
  'reemplazada', 'apuestas reales', 'real bets', 'decisiones', 'reglas', 'apuestas', 'sombra', 'formas', 'stake.com',
  'casa', 'book', 'pestana', 'tab', 'concepto', 'concept', 'arbitro', 'referee', 'justa', 'tesis', 'thesis',
]);

/** Categories whose entries are linked only by their capitalised sheet words (FUERZA, VALOR CASI). */
const CAPS_ONLY_CATEGORIES = new Set(['notes', 'statuses', 'tags']);

/**
 * @typedef {{ needle: string, slug: string, exact: boolean }} TermNeedle
 * @typedef {{ needles: TermNeedle[], folded: RegExp | null, exact: RegExp | null, bySlugNeedle: Map<string, string> }} TermIndex
 */

/** Is a needle written in capitals (two or more letters, no lower-case letter)? @param {string} s */
const isCaps = (s) => (s.match(/\p{L}/gu) || []).length >= 2 && s === s.toUpperCase();
const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build the inline-link index from the glossary entries: each entry's term (and the parts of a term
 * written "Term (other name)") and its aliases. Capitalised needles (DNB, BTTS, ML, VALOR CASI) match
 * only as written; the others match without case or accents. Common words (TERM_SKIP), needles of one
 * letter, rule names ("regla 23": RefText links those) and pure numbers are left out. When two entries
 * share a needle the first entry in the file wins.
 * @param {GlossaryEntry[]} entries   in file order
 * @returns {TermIndex}
 */
export function buildTermIndex(entries) {
  /** @type {Map<string, TermNeedle>} */
  const seen = new Map();
  // Two passes: whole terms first, so "SHADOW" belongs to the SHADOW entry and "Sofascore" to the
  // Sofascore entry rather than to "SHADOW (regla 30)" or "Favoritos (Sofascore)"; then the parts of
  // "Term (other name)" and the aliases.
  /** @type {Array<[GlossaryEntry, string[]]>} */
  const passes = [];
  for (const e of entries) {
    const m = /^(.*?)\s*\((.+)\)\s*$/.exec(e.term);
    passes.push([e, m ? [] : [e.term]]);
  }
  for (const e of entries) {
    const m = /^(.*?)\s*\((.+)\)\s*$/.exec(e.term);
    passes.push([e, [...(m ? [m[1], m[2]] : []), ...(e.aliases || [])]]);
  }
  for (const [e, raw] of passes) {
    const capsOnly = CAPS_ONLY_CATEGORIES.has(e.category);
    for (const r of raw) {
      const s = String(r || '').trim();
      if (!s || s.includes('/') && !/^O\/U$/.test(s) && !/^1\/4/.test(s)) continue; // "ref feed / ref N casas" shapes
      if ((s.match(/[\p{L}]/gu) || []).length < 2) continue;
      if (/^(?:reglas?|rules?)\s+\d/i.test(s) || /^[\d\s.,+−-]+$/.test(s)) continue;
      const exact = isCaps(s);
      if (capsOnly && !exact) continue;
      const key = exact ? s : fold(s);
      if (!exact && TERM_SKIP.has(key)) continue;
      if (exact && s.length < 2) continue;
      const id = (exact ? 'x:' : 'f:') + key;
      if (!seen.has(id)) seen.set(id, { needle: key, slug: e.slug, exact });
    }
  }
  const needles = [...seen.values()].sort((a, b) => b.needle.length - a.needle.length);
  const alt = (/** @type {TermNeedle[]} */ list) => (list.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map((x) => escapeRe(x.needle)).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null);
  const bySlugNeedle = new Map(needles.map((x) => [(x.exact ? 'x:' : 'f:') + x.needle, x.slug]));
  return { needles, folded: alt(needles.filter((x) => !x.exact)), exact: alt(needles.filter((x) => x.exact)), bySlugNeedle };
}

/**
 * Fold `text` char by char, remembering where each folded char came from (accents and case removed,
 * offsets back into the original).
 * @param {string} src
 */
function foldWithMap(src) {
  let folded = '';
  /** @type {number[]} */
  const from = [];
  for (let i = 0; i < src.length; ) {
    const ch = String.fromCodePoint(/** @type {number} */ (src.codePointAt(i)));
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) from.push(i);
    folded += f;
    i += ch.length;
  }
  from.push(src.length);
  return { folded, from };
}

/**
 * Split a text into plain text and glossary-term links. Only the first occurrence of each entry is
 * linked (pass the same `seen` set to several calls to share it across the pieces of one paragraph);
 * `exclude` slugs are never linked (an entry's own page). Longest match wins; matches never overlap.
 * @param {string} text
 * @param {TermIndex | null | undefined} index
 * @param {{ seen?: Set<string>, exclude?: string[] }} [opts]
 * @returns {Array<{ type: 'text', text: string } | { type: 'term', text: string, slug: string }>}
 */
export function linkTerms(text, index, opts = {}) {
  const src = String(text ?? '');
  if (!src || !index) return src ? [{ type: 'text', text: src }] : [];
  const seen = opts.seen || new Set();
  const exclude = new Set(opts.exclude || []);
  /** @type {Array<{ start: number, end: number, slug: string }>} */
  const hits = [];
  if (index.exact) {
    index.exact.lastIndex = 0;
    for (let m = index.exact.exec(src); m; m = index.exact.exec(src)) {
      hits.push({ start: m.index, end: m.index + m[0].length, slug: /** @type {string} */ (index.bySlugNeedle.get('x:' + m[0])) });
    }
  }
  if (index.folded) {
    const { folded, from } = foldWithMap(src);
    index.folded.lastIndex = 0;
    for (let m = index.folded.exec(folded); m; m = index.folded.exec(folded)) {
      hits.push({ start: from[m.index], end: from[m.index + m[0].length] ?? src.length, slug: /** @type {string} */ (index.bySlugNeedle.get('f:' + m[0])) });
    }
  }
  // Earliest first, longest first at the same start.
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  /** @type {Array<{ type: 'text', text: string } | { type: 'term', text: string, slug: string }>} */
  const out = [];
  let pos = 0;
  for (const h of hits) {
    if (!h.slug || h.start < pos || h.end <= h.start) continue;
    if (seen.has(h.slug) || exclude.has(h.slug)) continue;
    seen.add(h.slug);
    if (h.start > pos) out.push({ type: 'text', text: src.slice(pos, h.start) });
    out.push({ type: 'term', text: src.slice(h.start, h.end), slug: h.slug });
    pos = h.end;
  }
  if (pos < src.length) out.push({ type: 'text', text: src.slice(pos) });
  return out;
}
