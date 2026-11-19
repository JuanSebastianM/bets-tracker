// The line and side of a pick ("Under 4.5", "Over 9.5", "Hándicap +0.25"), read from the free-text
// selection the sheet keeps (docs/DATA_CONTRACT.md section 4, "Lines"). Pure functions; the only
// impure part is the label, which goes through t().
//
//   parseLine('Tarjetas totales', 'Under 4.5', 'cards_total')   -> { line: 4.5, lineKey: 'cards:under:4.5' }
//   parseLine('Córners equipo', 'Fürth over 4.5', 'corners_team') -> { line: 4.5, lineKey: 'corners_team:over:4.5' }
//   parseLine('Hándicap asiático', 'Vélez +0.25', 'result')      -> { line: 0.25, lineKey: 'ah:+0.25' }
//   parseLine('Goles', 'Under 3.5 × Under 3.5', 'goals')        -> { line: null, lineKey: null }  (a double)
//
// A lineKey is `<scope>:<over|under>:<value>` for totals and `ah:<signed value>` for Asian handicaps.
// The scope keeps "Under 4.5 cards" apart from "Under 4.5 team corners" (same words, different bet).

import { t } from '../lib/i18n.js';
import { groupBy } from './stats.js';

/** @typedef {import('./types').Pick} Pick */
/** @typedef {import('./types').MarketFamily} MarketFamily */

/**
 * Line scopes in display order (the filter panel groups by them). Label key `lines.scope.<id>`.
 * @type {readonly string[]}
 */
export const LINE_SCOPES = /** @type {const} */ ([
  'cards', 'cards_team', 'corners', 'corners_team', 'goals', 'goals_team', 'goals_1h', 'shots', 'shots_team', 'sot', 'sot_team', 'ah',
]);

/** Sides the `sides` filter offers (review.py's side(); see sideOf in tags.js). */
export const LINE_SIDES = /** @type {const} */ (['over', 'under']);

/**
 * The line scope of a raw market, or null when the market has no single line (1X2, BTTS, doubles…).
 * @param {string} marketRaw @param {MarketFamily} family
 * @returns {string | null}
 */
export function lineScope(marketRaw, family) {
  const m = String(marketRaw || '').trim().toLowerCase();
  const team = /equipo/.test(m);
  switch (family) {
    case 'cards_total':
      return 'cards';
    case 'cards_team':
      return 'cards_team';
    case 'corners_total':
      return 'corners';
    case 'corners_team':
      return 'corners_team';
    case 'shots':
      return (/al arco/.test(m) ? 'sot' : 'shots') + (team ? '_team' : '');
    case 'goals':
      if (team) return 'goals_team';
      if (/1er tiempo|primer tiempo/.test(m)) return 'goals_1h';
      return 'goals';
    case 'result':
      return /^h[áa]ndicap/.test(m) ? 'ah' : null;
    default:
      return null;
  }
}

/** '4.5', '3', '0.25', '2.75' (no trailing zeros). @param {number} v */
const fmtValue = (v) => String(Math.round(v * 100) / 100);

/** '+0.25', '-1', '0'. @param {number} v */
const fmtSigned = (v) => (v > 0 ? `+${fmtValue(v)}` : v < 0 ? `-${fmtValue(-v)}` : '0');

const num = (/** @type {string} */ s) => Number(s.replace(',', '.'));

/** A double or a builder written in one selection ("Under 3.5 × Under 3.5", "… goles + … córners …"). */
const COMBO_SELECTION = /×|\s\+\s/;
/** Over / under and the number after it; Spanish "más de / menos de" too. */
const TOTAL_RE = /(?:^|[^a-záéíóúñ])(over|under|m[áa]s de|menos de)\s*(\d+(?:[.,]\d+)?)/i;
/** The last signed number of a handicap selection ("Napoli -1", "Vélez +0.25"); a bare 0 too. */
const AH_RE = /(?:^|\s)([+\-−–])\s?(\d+(?:[.,]\d+)?)(?!.*[+\-−–]\s?\d)/;
const AH_ZERO_RE = /(?:^|\s)0(?:[.,]0+)?(?:\s|$)/;

/** Three-way corner and card markets: no line. */
const THREE_WAY_NO_LINE = /^(?:c[oó]rners 1x2|tarjetas 1x2|m[aá]s c[oó]rners|m[aá]s tarjetas)/i;

/**
 * Line of a selection.
 * @param {string} marketRaw @param {string} selection @param {MarketFamily} family
 * @returns {{ line: number | null, lineKey: string | null }}
 */
export function parseLine(marketRaw, selection, family) {
  const none = { line: null, lineKey: null };
  const sel = String(selection || '').trim();
  if (!sel || family === 'combo' || COMBO_SELECTION.test(sel)) return none;
  // Three-way corner and card markets ('Córners 1X2', 'Más córners (equipo)', 'Tarjetas 1X2', 'Más
  // tarjetas (3 vías)') have no line (DATA_CONTRACT section 4), even when the selection carries a number.
  if (THREE_WAY_NO_LINE.test(String(marketRaw || '').trim())) return none;
  const scope = lineScope(marketRaw, family);
  if (!scope) return none;
  if (scope === 'ah') {
    const m = AH_RE.exec(sel);
    if (m) {
      const v = num(m[2]) * (m[1] === '+' ? 1 : -1);
      if (Number.isFinite(v)) return { line: v === 0 ? 0 : v, lineKey: `ah:${fmtSigned(v)}` };
    }
    if (AH_ZERO_RE.test(sel)) return { line: 0, lineKey: 'ah:0' };
    return none;
  }
  const m = TOTAL_RE.exec(sel);
  if (!m) return none;
  const word = m[1].toLowerCase();
  const kind = word === 'over' || /^m[áa]s/.test(word) ? 'over' : 'under';
  const v = num(m[2]);
  if (!Number.isFinite(v)) return none;
  return { line: v, lineKey: `${scope}:${kind}:${fmtValue(v)}` };
}

/**
 * The parts of a lineKey, or null when it is not one.
 * @param {string | null | undefined} key
 * @returns {{ scope: string, kind: 'over' | 'under' | 'ah', value: number } | null}
 */
export function parseLineKey(key) {
  if (!key) return null;
  const parts = String(key).split(':');
  if (parts[0] === 'ah' && parts.length === 2) {
    const v = Number(parts[1]);
    return Number.isFinite(v) ? { scope: 'ah', kind: 'ah', value: v } : null;
  }
  if (parts.length !== 3 || !LINE_SCOPES.includes(parts[0]) || (parts[1] !== 'over' && parts[1] !== 'under')) return null;
  const v = Number(parts[2]);
  return Number.isFinite(v) ? { scope: parts[0], kind: /** @type {'over' | 'under'} */ (parts[1]), value: v } : null;
}

/** A valid lineKey? @param {unknown} key */
export const isLineKey = (key) => typeof key === 'string' && parseLineKey(key) != null;

/**
 * Order of line keys: by scope (LINE_SCOPES), then by value, then under before over.
 * @param {string} a @param {string} b
 */
export function compareLineKeys(a, b) {
  const x = parseLineKey(a);
  const y = parseLineKey(b);
  if (!x || !y) return x ? -1 : y ? 1 : String(a).localeCompare(String(b));
  return LINE_SCOPES.indexOf(x.scope) - LINE_SCOPES.indexOf(y.scope) || x.value - y.value || (x.kind === y.kind ? 0 : x.kind === 'under' ? -1 : 1);
}

/**
 * The words of a line: "Under 4.5", "Over 9.5", "Hándicap +0.25"; with `scope`, "Tarjetas: Under 4.5".
 * @param {string | null | undefined} key @param {{ scope?: boolean }} [opts]
 */
export function lineLabel(key, opts = {}) {
  const k = parseLineKey(key);
  if (!k) return String(key || '');
  const base = k.kind === 'ah' ? t('lines.ah', { line: fmtSigned(k.value) }) : t(`lines.${k.kind}`, { line: fmtValue(k.value) });
  return opts.scope && k.scope !== 'ah' ? t('lines.withScope', { scope: t(`lines.scope.${k.scope}`), line: base }) : base;
}

/** Label of a scope ("Tarjetas"). @param {string} scope */
export const lineScopeLabel = (scope) => t(`lines.scope.${scope}`);

const fold = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ');

/**
 * Whether showing the line label next to the selection adds anything: false when the selection
 * already says it ("Under 4.5", "Fürth over 4.5", "Napoli -1"), true otherwise.
 * @param {Pick} p
 */
export function lineAddsInfo(p) {
  const k = parseLineKey(p.lineKey);
  if (!k) return false;
  const sel = fold(p.selection || '');
  if (k.kind === 'ah') return !sel.includes(fmtSigned(k.value)) && !(k.value === 0 && /(^|\s)0(\s|$)/.test(sel));
  const v = fmtValue(k.value);
  const words = k.kind === 'over' ? ['over', 'mas de'] : ['under', 'menos de'];
  return !words.some((w) => new RegExp(`(^|[^a-z])${w}\\s*${v.replace('.', '\\.')}(?![\\d])`).test(sel));
}

/**
 * Picks grouped by line (picks without a line left out), in line order, each with its summary
 * (1u flat, stats.js). `opts` goes to summarize.
 * @param {Pick[]} picks @param {object} [opts]
 * @returns {Array<{ key: string, picks: Pick[], summary: import('./stats.js').Summary }>}
 */
export function groupByLine(picks, opts) {
  return groupBy(
    picks.filter((p) => p.lineKey),
    (p) => /** @type {string} */ (p.lineKey),
    /** @type {any} */ (opts),
  ).sort((a, b) => compareLineKeys(a.key, b.key));
}
