// The decision log (tab Decisiones): status kinds, themes, cross-references, search, filters and the
// URL state of the Decisions section. Pure functions only; the screen lives in src/features/decisions.
//
// Sheet text is Spanish (and some English the scripts wrote), so the patterns below match Spanish and
// English words. Everything else is English.

/** @typedef {import('./types').Decision} Decision */

/**
 * Status kinds. The sheet writes exactly one of four words in Estado (betting-analyst, "Decisions log").
 * The UI shows the sheet's word as written; the kind only drives the chip style and the filter.
 */
export const DECISION_STATUSES = /** @type {const} */ ([
  { id: 'in_force', label: 'Vigente' },
  { id: 'provisional', label: 'Provisional' },
  { id: 'open', label: 'Abierta' },
  { id: 'replaced', label: 'Reemplazada' },
]);

/** @typedef {'in_force' | 'provisional' | 'open' | 'replaced' | 'other'} DecisionStatusKind */

/**
 * Kind of an Estado value (exact word, case and accents ignored). Anything else is 'other'.
 * @param {string} status
 * @returns {DecisionStatusKind}
 */
export function decisionStatusKind(status) {
  const s = fold(status).trim();
  const hit = DECISION_STATUSES.find((x) => fold(x.label) === s);
  return hit ? hit.id : 'other';
}

/** Kinds that are "in force now" (the Vigentes view). */
export const IN_FORCE_KINDS = /** @type {DecisionStatusKind[]} */ (['in_force', 'provisional']);

// ---------------------------------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------------------------------

/**
 * Themes derived from the topic (Tema). Rule: the topic is folded (lower case, no accents) and the
 * first theme whose pattern matches wins, in this order; if none matches, the decision text is tried
 * the same way; otherwise 'workflow'. A theme may appear twice (a narrow early pattern and a broad
 * later one); THEME_IDS lists each once. The order puts the most specific themes first: a "Revisión Sombra
 * 300 filas" topic is a review, not a shadow test; a "Regla 24 (filtro 5)" topic is a filter.
 * @type {Array<{ id: string, re: RegExp }>}
 */
export const DECISION_THEMES = [
  // Narrow topic shapes first (checked on the real topics, 15 Nov 2026): a topic that names a script,
  // an audit, a run or a closing-price task is about how the work is done even when it mentions Grok, the
  // model or a filter; an audit of CLV or a topic that starts with the close is a measure; a topic that
  // starts with the Sofascore AI or a backtest is about the model; the value scan and data endpoints are
  // data; rule 25 (shots are SHADOW) and a topic that starts with "Prueba" are shadow tests.
  { id: 'workflow', re: /^tareas|clv-scheduler|^script\b|^auditoria del\b|^los comandos|^slate\.json|^mensaje del slate|^ventana del slate/ },
  { id: 'measures', re: /^auditoria de clv|^cuota de cierre|^cierres? del feed|^clv\b/ },
  { id: 'model', re: /^ia de sofascore|^backtest|^reconstruccion del modelo|^datos y modelo/ },
  { id: 'data', re: /^escaneo de valor|endpoint|^arbitros:|^rutas de datos|^formato del feed|^apertura del feed|^recibo del paso|^oddalerts/ },
  { id: 'shadow', re: /^regla 25\b|^pruebas?\b/ },
  // Milestone reviews and how reviews report ("Revisión Sombra 150 filas", "Revisiones: …").
  { id: 'reviews', re: /^revision|^revisiones|\breview\b|review\.py/ },
  // The Grok tab and Grok's picks.
  { id: 'grok', re: /\bgrok\b/ },
  // Stake size, real money, free bets, price exceptions, early-payout bets.
  { id: 'staking', re: /\bstakes\b|dinero real|apuestas? gratis|freebet|excepcion|pago anticipado|kelly/ },
  // Filters and the rules that act as filters (sample, gaps, referee, razor).
  { id: 'filters', re: /filtro|f-gap|f-ratio|razor|regla (?:3|18|19|20|21|22|23|24)\b|muestra|arbitro/ },
  // Closing line value, fair-close EV, gates, closing prices.
  { id: 'measures', re: /\bclv\b|ev justo|puerta|cierre|lineas que (?:casi )?no se mueven|rezagad/ },
  // Reading prices and data for the value scan ("Stake: página propia primero en el escaneo de valor").
  { id: 'data', re: /escaneo de valor|^stake:|oddspedia|rutas de datos/ },
  // Shadow tests and Sombra categories.
  { id: 'shadow', re: /sombra|shadow|prueba|\bvalor\b|modelo solo|ia-watch|corners de equipo|tarjetas under|publicad|pinnacle|\bmov\b/ },
  // The model and its scripts, backtests and calibration.
  { id: 'model', re: /modelo|model\.py|backtest|calibracion|fuerza|encogid|regla (?:29|30|32|36)\b|\bia de sofascore\b/ },
  // Where the data comes from: books, feeds, fstats, Sofascore, card counts.
  { id: 'data', re: /fstats|sofascore|oddspedia|oddalerts|\bfeed\b|casas|betano|betsson|\bstake\b|datos|rutas|tarjetas|favoritos/ },
  // How runs work: tasks, skills, grading, writing to and reading the sheet, messages, the slate window.
  { id: 'workflow', re: /tareas|flujo de trabajo|\bslates?\b|\bskills?\b|calificacion|registro|escritura|lecturas? de la hoja|subagente|script|mensaje|comandos|auditoria|correccion|navegador/ },
  // Catch-all (only when neither the topic nor the decision text matches anything above).
  { id: 'workflow', re: /./ },
];

/** Theme ids in display order (the order of the filter chips and of the "in force" view). */
export const THEME_IDS = ['reviews', 'grok', 'staking', 'filters', 'measures', 'data', 'shadow', 'model', 'workflow'];

/**
 * Theme of a decision (see DECISION_THEMES for the rule).
 * @param {{ topic?: string, decision?: string }} d
 * @returns {string}
 */
export function decisionTheme(d) {
  return decisionThemeMatch(d).theme;
}

/**
 * Theme of a decision and what decided it: the topic, the decision text, or the catch-all (neither
 * matched). Used by the tests that keep the catch-all small.
 * @param {{ topic?: string, decision?: string }} d
 * @returns {{ theme: string, by: 'topic' | 'decision' | 'fallback' }}
 */
export function decisionThemeMatch(d) {
  const topic = fold(d.topic || '');
  for (const th of DECISION_THEMES.slice(0, -1)) if (th.re.test(topic)) return { theme: th.id, by: 'topic' };
  const text = fold(d.decision || '');
  for (const th of DECISION_THEMES.slice(0, -1)) if (th.re.test(text)) return { theme: th.id, by: 'decision' };
  return { theme: 'workflow', by: 'fallback' };
}

// ---------------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------------

/** Lower case without accents ("Revisión" → "revision"). @param {string} s */
export function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Split `text` into segments marking every accent- and case-insensitive occurrence of `query`.
 * Offsets refer to the original text, so accents and case are kept as written.
 * @param {string} text
 * @param {string} query
 * @returns {Array<{ text: string, hit: boolean }>}
 */
export function highlightSegments(text, query) {
  const src = String(text ?? '');
  const q = fold(query).trim();
  if (!q || !src) return src ? [{ text: src, hit: false }] : [];
  // Fold char by char and remember where each folded char came from.
  let folded = '';
  /** @type {number[]} */
  const from = [];
  for (let i = 0; i < src.length; ) {
    const cp = src.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) from.push(i);
    folded += f;
    i += ch.length;
  }
  from.push(src.length);
  /** @type {Array<{ text: string, hit: boolean }>} */
  const out = [];
  let last = 0;
  let at = folded.indexOf(q);
  while (at !== -1) {
    const s = from[at];
    const e = from[at + q.length] ?? src.length;
    if (s > last) out.push({ text: src.slice(last, s), hit: false });
    if (e > s) out.push({ text: src.slice(s, e), hit: true });
    last = Math.max(last, e);
    at = folded.indexOf(q, at + q.length);
  }
  if (last < src.length) out.push({ text: src.slice(last), hit: false });
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Cross-references
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {{ type: 'text', text: string }
 *   | { type: 'decision', text: string, row: number }
 *   | { type: 'rule', text: string, n: number }} RefToken
 */

const NUM = String.raw`\d+[a-f]?`;
const SEP = String.raw`\s*(?:[-–]|,|\by\b|\band\b|&)\s*`;
// "Decisiones row 110", "`Decisiones` rows 63–64", "fila 110", "filas 84, 85, 91, 102 y 106", "row 31".
const DECISION_RE = new RegExp(String.raw`((?:\x60?Decisiones\x60?\s+)?(?:rows?|filas?)\s+)(` + NUM + String.raw`(?:` + SEP + NUM + String.raw`)*)`, 'gi');
// "regla 30", "reglas 29 y 30", "rule 34e", "rules 18–20".
const RULE_RE = new RegExp(String.raw`((?:reglas?|rules?)\s+)(` + NUM + String.raw`(?:` + SEP + NUM + String.raw`)*)`, 'gi');
// Another tab named right before ("Sombra fila 412", "`Grok` rows 2–154") or right after ("fila 17 de
// Apuestas", "filas 125, 127 de Grok"): those rows are not decisions.
const OTHER_TAB_BEFORE = /(?:sombra|grok|apuestas|pinnacle|reglas)\W{0,3}$/i;
const OTHER_TAB_AFTER = /^\s*(?:de|del|of|in|en)\s+(?:la\s+)?(?:pesta[ñn]a\s+)?\x60?(?:sombra|grok|apuestas|pinnacle)\b/i;

/**
 * Split text into plain text and links: decision rows ("Decisiones row N", "fila N", "row N") and
 * betting-analyst rules ("regla N", "rule N"). A group of numbers ("filas 84-85", "reglas 29 y 30")
 * is linked number by number, and only when every number in it is a known decision row / rule
 * (so "filas 2-515" of Sombra stays plain). The sheet's own Reglas tab ("Reglas rule 4") is never
 * linked. Returns data only: the screen renders each token as text or an <a>, never as HTML.
 * @param {string} text
 * @param {{ decisionRows?: Set<number> | number[], ruleNumbers?: Set<number> | number[] }} [known]
 * @returns {RefToken[]}
 */
export function tokenizeRefs(text, known = {}) {
  const src = String(text ?? '');
  const rows = known.decisionRows instanceof Set ? known.decisionRows : new Set(known.decisionRows || []);
  const rules = known.ruleNumbers instanceof Set ? known.ruleNumbers : new Set(known.ruleNumbers || []);
  /** @type {Array<{ start: number, end: number, tokens: RefToken[] }>} */
  const spans = [];
  collect(src, DECISION_RE, 'decision', rows, spans);
  collect(src, RULE_RE, 'rule', rules, spans);
  spans.sort((a, b) => a.start - b.start);
  /** @type {RefToken[]} */
  const out = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue; // overlapping match: the earlier one wins
    if (s.start > pos) pushText(out, src.slice(pos, s.start));
    for (const tk of s.tokens) tk.type === 'text' ? pushText(out, tk.text) : out.push(tk);
    pos = s.end;
  }
  if (pos < src.length) pushText(out, src.slice(pos));
  return out;
}

/** @param {RefToken[]} out @param {string} text */
function pushText(out, text) {
  if (!text) return;
  const prev = out[out.length - 1];
  if (prev && prev.type === 'text') prev.text += text;
  else out.push({ type: 'text', text });
}

/**
 * @param {string} src @param {RegExp} re @param {'decision' | 'rule'} type @param {Set<number>} valid
 * @param {Array<{ start: number, end: number, tokens: RefToken[] }>} spans
 */
function collect(src, re, type, valid, spans) {
  re.lastIndex = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const [whole, prefix, list] = m;
    const start = m.index;
    const before = src.slice(Math.max(0, start - 14), start);
    const after = src.slice(start + whole.length);
    if (type === 'decision' && !/^\x60?decisiones/i.test(prefix) && (OTHER_TAB_BEFORE.test(before) || OTHER_TAB_AFTER.test(after))) continue;
    if (type === 'rule' && /Reglas\W{0,3}$/.test(before)) continue; // "Reglas rule 4": the sheet's tab
    if (type === 'decision' && /^\s*%/.test(after)) continue;
    // Split the number list, keeping separators as text.
    const parts = list.split(new RegExp(`(${SEP})`, 'i'));
    const nums = parts.filter((_, i) => i % 2 === 0).map((p) => parseInt(p, 10));
    if (!nums.length || nums.some((n) => !valid.has(n))) continue;
    /** @type {RefToken[]} */
    const tokens = [];
    parts.forEach((p, i) => {
      if (i % 2 === 1) return tokens.push({ type: 'text', text: p });
      const n = parseInt(p, 10);
      const label = i === 0 ? prefix + p : p;
      tokens.push(type === 'decision' ? { type: 'decision', text: label, row: n } : { type: 'rule', text: label, n });
    });
    spans.push({ start, end: start + whole.length, tokens });
  }
}

/**
 * Decision rows and rule numbers a text refers to (deduplicated, in order of appearance).
 * @param {string} text
 * @param {{ decisionRows?: Set<number> | number[], ruleNumbers?: Set<number> | number[] }} known
 */
export function refsIn(text, known) {
  const rows = new Set();
  const rules = new Set();
  for (const tk of tokenizeRefs(text, known)) {
    if (tk.type === 'decision') rows.add(tk.row);
    else if (tk.type === 'rule') rules.add(tk.n);
  }
  return { rows: [...rows], rules: [...rules] };
}

/** All text of a decision, in column order. @param {Decision} d */
export function decisionText(d) {
  return [d.topic, d.decision, d.evidence, d.review].filter(Boolean).join('\n');
}

/**
 * Who cites whom. For each decision row: `cites` (rows its texts refer to, itself excluded),
 * `citedBy` (rows whose texts refer to it) and `rules` (betting-analyst rules it names).
 * @param {Decision[]} decisions
 * @param {Set<number> | number[]} ruleNumbers
 * @returns {Map<number, { cites: number[], citedBy: number[], rules: number[] }>}
 */
export function decisionGraph(decisions, ruleNumbers) {
  const known = { decisionRows: new Set(decisions.map((d) => d.row)), ruleNumbers };
  /** @type {Map<number, { cites: number[], citedBy: number[], rules: number[] }>} */
  const graph = new Map(decisions.map((d) => [d.row, { cites: [], citedBy: [], rules: [] }]));
  for (const d of decisions) {
    const { rows, rules } = refsIn(decisionText(d), known);
    const node = graph.get(d.row);
    node.cites = rows.filter((r) => r !== d.row);
    node.rules = rules;
  }
  for (const [row, node] of graph) for (const r of node.cites) graph.get(r)?.citedBy.push(row);
  for (const node of graph.values()) node.citedBy.sort((a, b) => a - b);
  return graph;
}

// ---------------------------------------------------------------------------------------------------
// Filters, grouping, counts
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {object} DecisionFilters
 * @property {string} q                      free text (topic, decision, evidence, review, status, date)
 * @property {DecisionStatusKind[]} statuses
 * @property {string[]} themes
 * @property {string} from                   YYYY-MM-DD or ''
 * @property {string} to                     YYYY-MM-DD or ''
 * @property {'timeline' | 'now'} view
 * @property {number} page
 */

/** @returns {DecisionFilters} */
export function defaultDecisionFilters() {
  return { q: '', statuses: [], themes: [], from: '', to: '', view: 'timeline', page: 1 };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_IDS = new Set([...DECISION_STATUSES.map((s) => s.id), 'other']);

/** Filters from the hash query (`q`, `st`, `th`, `from`, `to`, `view`, `page`). @param {Record<string, string>} query */
export function decisionFiltersFromQuery(query = {}) {
  const list = (/** @type {string | undefined} */ v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const f = defaultDecisionFilters();
  f.q = String(query.q || '');
  f.statuses = /** @type {DecisionStatusKind[]} */ (list(query.st).filter((x) => STATUS_IDS.has(x)));
  f.themes = list(query.th).filter((x) => THEME_IDS.includes(x));
  f.from = DATE_RE.test(query.from || '') ? query.from : '';
  f.to = DATE_RE.test(query.to || '') ? query.to : '';
  f.view = query.view === 'now' ? 'now' : 'timeline';
  const page = parseInt(query.page || '1', 10);
  f.page = Number.isFinite(page) && page > 0 ? page : 1;
  return f;
}

/** Query string for the filters (defaults left out). @param {DecisionFilters} f */
export function decisionFiltersToQuery(f) {
  const p = new URLSearchParams();
  if (f.view === 'now') p.set('view', 'now');
  if (f.q) p.set('q', f.q);
  if (f.statuses.length) p.set('st', f.statuses.join(','));
  if (f.themes.length) p.set('th', f.themes.join(','));
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.page > 1) p.set('page', String(f.page));
  return p.toString();
}

/** True when the free text matches a decision (accents and case ignored; a number also matches the row). */
export function decisionMatches(/** @type {Decision} */ d, /** @type {string} */ q) {
  const needle = fold(q).trim();
  if (!needle) return true;
  if (/^\d+$/.test(needle) && String(d.row) === needle) return true;
  return fold([decisionText(d), d.status, d.date].join('\n')).includes(needle);
}

/**
 * Apply the filters. The 'now' view keeps only Vigente and Provisional (on top of any status filter).
 * @param {Decision[]} decisions
 * @param {DecisionFilters} f
 */
export function filterDecisions(decisions, f) {
  return decisions.filter((d) => {
    const kind = decisionStatusKind(d.status);
    if (f.view === 'now' && !IN_FORCE_KINDS.includes(kind)) return false;
    if (f.statuses.length && !f.statuses.includes(kind)) return false;
    if (f.themes.length && !f.themes.includes(decisionTheme(d))) return false;
    if (f.from && d.date < f.from) return false;
    if (f.to && d.date > f.to) return false;
    return decisionMatches(d, f.q);
  });
}

/** Newest first: date descending, then row descending. @param {Decision[]} decisions */
export function newestFirst(decisions) {
  return [...decisions].sort((a, b) => (a.date === b.date ? b.row - a.row : a.date < b.date ? 1 : -1));
}

/**
 * Group (already ordered) decisions by month 'YYYY-MM', keeping the order.
 * @param {Decision[]} decisions
 * @returns {Array<{ month: string, items: Decision[] }>}
 */
export function groupByMonth(decisions) {
  /** @type {Array<{ month: string, items: Decision[] }>} */
  const out = [];
  for (const d of decisions) {
    const month = (d.date || '').slice(0, 7) || '—';
    const last = out[out.length - 1];
    if (last && last.month === month) last.items.push(d);
    else out.push({ month, items: [d] });
  }
  return out;
}

/**
 * Group decisions by theme in THEME_IDS order (empty themes left out), newest first inside.
 * @param {Decision[]} decisions
 * @returns {Array<{ theme: string, items: Decision[] }>}
 */
export function groupByTheme(decisions) {
  const by = new Map(THEME_IDS.map((id) => [id, /** @type {Decision[]} */ ([])]));
  for (const d of newestFirst(decisions)) by.get(decisionTheme(d)).push(d);
  return THEME_IDS.filter((id) => by.get(id).length).map((theme) => ({ theme, items: by.get(theme) }));
}

/**
 * How many decisions per status kind, plus the total and the "in force now" count.
 * @param {Decision[]} decisions
 */
export function decisionCounts(decisions) {
  /** @type {Record<DecisionStatusKind, number>} */
  const byStatus = { in_force: 0, provisional: 0, open: 0, replaced: 0, other: 0 };
  for (const d of decisions) byStatus[decisionStatusKind(d.status)]++;
  return { total: decisions.length, inForceNow: byStatus.in_force + byStatus.provisional, byStatus };
}

/** The sheet's text for a rule line of the Reglas tab ("2. Stake …") split into number and text. */
export function parseSheetRule(/** @type {string} */ line) {
  const m = /^\s*(\d+)[.)]\s*(.*)$/s.exec(String(line || ''));
  return m ? { n: Number(m[1]), text: m[2].trim() } : { n: null, text: String(line || '').trim() };
}

/**
 * How many decisions each month has in a list (the filtered list, before paging), so a month header
 * says the month's count under the active filters and not only the part on the current page (round 2).
 * @param {Decision[]} decisions
 * @returns {Map<string, number>} 'YYYY-MM' (or '—' without a date) → count
 */
export function monthCounts(decisions) {
  const m = new Map();
  for (const d of decisions) {
    const month = (d.date || '').slice(0, 7) || '—';
    m.set(month, (m.get(month) || 0) + 1);
  }
  return m;
}
