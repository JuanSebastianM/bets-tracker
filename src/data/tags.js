// Row categories (tags), market families and rejection reasons.
// The sheet text these patterns match is Spanish; ids are English (docs/DATA_CONTRACT.md section 5).
// review.py (betting-review skill) is the reference: classification is by the START of the text.

/** @typedef {import('./types').TagId} TagId */
/** @typedef {import('./types').MarketFamily} MarketFamily */
/** @typedef {import('./types').ReviewClass} ReviewClass */
/** @typedef {import('./types').FilterReason} FilterReason */

/**
 * Sombra tags in match order (first match wins). `label` is the sheet's own wording, shown as is.
 * @type {Array<{ id: TagId, label: string, test: (upper: string) => boolean }>}
 */
export const SHADOW_TAGS = [
  { id: 'published_bet', label: 'PUBLICADA Y APOSTADA', test: (u) => u.startsWith('PUBLICADA Y APOSTADA') },
  { id: 'published', label: 'PUBLICADA, NO APOSTADA', test: (u) => u.startsWith('PUBLICADA, NO APOSTADA') },
  { id: 'prop_near_value', label: 'VALOR PROP CASI', test: (u) => u.startsWith('VALOR PROP CASI') },
  { id: 'prop_value', label: 'VALOR PROP', test: (u) => u.startsWith('VALOR PROP') },
  { id: 'near_value', label: 'VALOR CASI', test: (u) => u.startsWith('VALOR CASI') },
  { id: 'value', label: 'VALOR', test: (u) => u.startsWith('VALOR:') || u.startsWith('VALOR ') },
  { id: 'cards_under', label: 'TARJETAS UNDER', test: (u) => u.startsWith('TARJETAS UNDER') },
  { id: 'team_corners', label: 'CÓRNERS EQUIPO', test: (u) => /^C[ÓO]RNERS EQUIPO/.test(u) },
  { id: 'corner_rejects', label: 'CÓRNERS RECHAZO', test: (u) => /^C[ÓO]RNERS RECHAZO/.test(u) },
  { id: 'model_only_shots', label: 'MODELO SOLO', test: (u) => u.startsWith('MODELO SOLO') },
  { id: 'shadow_rule30', label: 'SHADOW (regla 30)', test: (u) => u.startsWith('SHADOW') && /REGLA 30|PAS[ÓA] TODOS LOS FILTROS/.test(u) },
  { id: 'shadow', label: 'SHADOW', test: (u) => u.startsWith('SHADOW') },
  { id: 'ai_watch', label: 'IA-WATCH', test: (u) => u.startsWith('IA-WATCH') },
  { id: 'low_edge', label: 'Pasó los filtros, stake mínimo', test: (u) => /^PAS[ÓA] TODOS LOS FILTROS/.test(u) || /^STAKE\s*</.test(u) },
];

/** Every tag with its sheet label, in display order. Grok and Apuestas tags included. */
export const TAGS = /** @type {Array<{ id: TagId, label: string, source: import('./types').Source }>} */ ([
  ...SHADOW_TAGS.map((t) => ({ id: t.id, label: t.label, source: /** @type {const} */ ('shadow') })),
  { id: 'filter_reject', label: 'Filtro (rechazo)', source: 'shadow' },
  { id: 'bet', label: 'Apuesta', source: 'bets' },
  { id: 'grok_priced', label: 'Cotizado', source: 'grok' },
  { id: 'grok_not_priced', label: 'No cotizado', source: 'grok' },
  { id: 'grok_other', label: 'Sin veredicto', source: 'grok' },
]);

const TAG_LABEL = new Map(TAGS.map((t) => [t.id, t.label]));

/** The sheet's label for a tag ("VALOR CASI"). @param {TagId} id */
export function tagLabel(id) {
  return TAG_LABEL.get(id) || id;
}

/**
 * Category of a Sombra row from `Motivo de descarte`.
 * @param {string} reason
 * @returns {TagId}
 */
export function classifyShadow(reason) {
  const u = String(reason || '').trim().toUpperCase();
  for (const t of SHADOW_TAGS) if (t.test(u)) return t.id;
  return 'filter_reject';
}

/**
 * Category of a Grok row from `Nuestro veredicto` ("Cotizado: …", "Cotizado (regla 29): …", "No cotizado: …").
 * @param {string} verdict
 * @returns {TagId}
 */
export function classifyGrok(verdict) {
  const v = String(verdict || '').trim().toLowerCase();
  if (v.startsWith('no cotizado')) return 'grok_not_priced';
  if (v.startsWith('cotizado')) return 'grok_priced';
  return 'grok_other';
}

/** Price-first tags: judged against a consensus fair price, no model involved. */
export const PRICE_FIRST_TAGS = /** @type {TagId[]} */ (['value', 'near_value', 'prop_value', 'prop_near_value']);

/**
 * review.py's is_model: a Sombra row priced by the model (not IA-WATCH, not price-first, not published).
 * @param {TagId} tag
 */
export function isModelTag(tag) {
  return !['ai_watch', 'published', 'published_bet', ...PRICE_FIRST_TAGS, 'bet', 'grok_priced', 'grok_not_priced', 'grok_other'].includes(tag);
}

/**
 * Market family of a raw `Mercado` text (docs/DATA_CONTRACT.md section 4).
 * @param {string} raw
 * @returns {MarketFamily}
 */
export function marketFamily(raw) {
  const m = String(raw || '').trim().toLowerCase();
  if (!m) return 'other';
  if (/\+|×|\bdoble\b|crear apuesta|builder/.test(m) && !m.startsWith('doble oportunidad')) return 'combo';
  if (m.startsWith('tiros')) return 'shots';
  if (/^c[óo]rners/.test(m) || m.startsWith('más córners') || m.startsWith('mas corners') || m.startsWith('más corners')) {
    if (/^c[óo]rners (totales|total)/.test(m)) return 'corners_total';
    return 'corners_team';
  }
  if (m.startsWith('tarjetas') || m.startsWith('más tarjetas') || m.startsWith('mas tarjetas')) {
    if (/^tarjetas (totales|total)/.test(m)) return 'cards_total';
    return 'cards_team';
  }
  if (/^(goles|btts|ambos)/.test(m)) return 'goals';
  if (/^(1x2|doble oportunidad|empate no apuesta|dnb|h[áa]ndicap|resultado)/.test(m)) return 'result';
  return 'other';
}

/** All market families in display order. */
export const MARKET_FAMILIES = /** @type {MarketFamily[]} */ ([
  'result', 'goals', 'corners_total', 'corners_team', 'cards_total', 'cards_team', 'shots', 'combo', 'other',
]);

/**
 * review.py's mclass(): the market groups reviews and frozen tests use.
 * @param {string} raw
 * @returns {ReviewClass}
 */
export function reviewClass(raw) {
  const m = String(raw || '').trim().toLowerCase();
  if (m.startsWith('tiros')) return 'shots';
  if (m.startsWith('córners equipo') || m.startsWith('corners equipo')) return 'team_corners';
  if (m.startsWith('córners') || m.startsWith('corners')) return 'corners';
  if (m.startsWith('tarjetas')) return 'cards';
  if (m.startsWith('goles') || m.startsWith('btts') || m.startsWith('ambos')) return 'goals';
  return 'result';
}

/**
 * Over / under side of a selection (review.py's side()).
 * @param {string} selection
 * @returns {'over' | 'under' | ''}
 */
export function sideOf(selection) {
  const s = String(selection || '').toLowerCase();
  if (s.includes('under') || s.includes('menos')) return 'under';
  if (s.includes('over') || s.includes('más')) return 'over';
  return '';
}

/** Team shots / SoT line (review.py's team_shot). @param {string} marketRaw */
export function isTeamShots(marketRaw) {
  return reviewClass(marketRaw) === 'shots' && String(marketRaw).toLowerCase().includes('equipo');
}

/** review.py's passed_all: "pasó todos los filtros" in the reason or the notes. */
export function passedAll(/** @type {string} */ reason, /** @type {string} */ notes) {
  return /pas[óa] todos los filtros/i.test(`${reason || ''} | ${notes || ''}`);
}

/**
 * Rejection reasons, review.py's REASONS. Patterns match sheet text (Spanish and the English the
 * scripts wrote for a while).
 * @type {Array<[FilterReason, RegExp]>}
 */
export const FILTER_REASONS = [
  ['gap', /F-gap|brecha/i],
  ['ratio', /F-ratio|ratio/i],
  ['sample', /F-sample|F-muestra|^\s*muestra\s*\(/i],
  ['razor', /razor/i],
  ['filter4', /filtro 4|filter 4/i],
  ['filter5', /filtro 5|filter 5/i],
  ['rule1', /(?:regla|rule) 1(?!\d)/i],
  ['rule18', /(?:regla|rule) 18|muestra relajada|\b[6-9] (?:partidos|PJ)\b|6[-–]9/i],
  ['rule23', /(?:regla|rule) 23/i],
  ['low_stake', /stake\s*<\s*0[.,]25u|edge\s*<\s*4%/i],
];

const TAG_RE = String.raw`(?:(?:rule|regla) \d+ )?(?:razor|F-gap|F-ratio|F-sample|F-muestra|filtro \d|filter \d)`;
const TAG_ONLY = new RegExp(
  String.raw`^(?:rechazos?:\s*|tambi[eé]n\s+)?` + TAG_RE + String.raw`(?:\s*\([^)]*\))?(?:\s*[;,]\s*` + TAG_RE + String.raw`(?:\s*[\d.]+x)?(?:\s*\([^)]*\))?)*\s*$`,
  'i',
);
const TAG_PAREN = new RegExp(String.raw`\((?:\s*` + TAG_RE + String.raw`\s*[;,]?)+\)`, 'i');

/**
 * Rejection reasons of a model row (review.py's reasons()): from the reason text plus the reason
 * tags older rows carry in the notes. Empty for non-model rows and MODELO SOLO.
 * @param {TagId} tag
 * @param {string} reason
 * @param {string} notes
 * @returns {FilterReason[]}
 */
export function filterReasons(tag, reason, notes) {
  if (!isModelTag(tag) || tag === 'model_only_shots') return [];
  let text = String(reason || '');
  for (const seg of String(notes || '').split(' | ')) {
    const parts = /tambi[eé]n /i.test(seg) ? seg.split(';') : [seg];
    for (const part of parts) {
      const p = part.trim();
      if (TAG_ONLY.test(p) || TAG_PAREN.test(p) || /^(?:rechazos?:|tambi[eé]n )/i.test(p)) text += ' ; ' + p;
    }
  }
  return FILTER_REASONS.filter(([, re]) => re.test(text)).map(([id]) => id);
}

/** The three books Juan uses. */
export const BOOKS = /** @type {const} */ (['Betano', 'Betsson', 'Stake']);

/**
 * Books named for the taken price in a VALOR-style reason ("VALOR: Betano/Betsson 2.15 vs justa …").
 * @param {string} reason
 * @returns {string[]}
 */
export function booksInReason(reason) {
  const m = String(reason || '').match(/^\s*VALOR(?: PROP)?(?: CASI)?:\s*([A-Za-z/]+)\s/i);
  if (!m) return [];
  return m[1].split('/').map((b) => BOOKS.find((x) => x.toLowerCase() === b.toLowerCase())).filter(Boolean);
}

/**
 * Tags in groups for the filter panel (label key `filters.tagGroup.<id>`). Every id of TAGS is in
 * exactly one group.
 * @type {Array<{ id: string, tags: TagId[] }>}
 */
export const TAG_GROUPS = [
  { id: 'price_first', tags: ['value', 'near_value', 'prop_value', 'prop_near_value'] },
  { id: 'model_tests', tags: ['cards_under', 'team_corners', 'corner_rejects', 'model_only_shots', 'shadow_rule30', 'shadow', 'low_edge'] },
  { id: 'published', tags: ['published', 'published_bet'] },
  { id: 'rejects', tags: ['filter_reject', 'ai_watch'] },
  { id: 'bets', tags: ['bet'] },
  { id: 'grok', tags: ['grok_priced', 'grok_not_priced', 'grok_other'] },
];

// Glossary slug of a tag ('near_value' -> 'near-value', the `#/glossary/:term` form): one
// implementation, in src/lib/glossary-links.js, re-exported here for the callers that import it from tags.
export { tagSlug } from '../lib/glossary-links.js';
