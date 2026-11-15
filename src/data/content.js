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
    return fold(`${r.title}\n${r.says}\n${r.why || ''}`).includes(q);
  });
}

/** How many rules per state. @param {RuleEntry[]} rules */
export function ruleStateCounts(rules) {
  /** @type {Record<string, number>} */
  const out = Object.fromEntries(RULE_STATES.map((s) => [s, 0]));
  for (const r of rules) out[r.state] = (out[r.state] || 0) + 1;
  return out;
}
