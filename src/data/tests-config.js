// The frozen tests and the Sombra review schedule, as data (betting-analyst "Frozen tests",
// Juan 9 Nov 2026, Decisiones row 111; milestone-reviewer "Frozen tests"; review.py v1.0).
// Membership predicates are a port of review.py's FROZEN TESTS block.

import { isTeamShots } from './tags.js';
import { isCountable, isGraded, measureStat, summarize } from './stats.js';

/** @typedef {import('./types').Pick} Pick */

/** The rule every frozen test is decided by (Decisiones row 111). */
export const FROZEN_RULE = {
  decisionRow: 111,
  minGraded: 100,
  minWithClose: 50,
  zThreshold: 2,
  /** What is proposed when z ≥ zThreshold (never applied without Juan). */
  passStakeU: 0.25,
  /** The measure: F × de-vigged closing probability − 1 (own-book close first, else bet365 feed). */
  measure: 'fairCloseEv',
};

/**
 * @typedef {object} FrozenTest
 * @property {string} id
 * @property {string} sheetLabel  how the sheet and the reviews name it
 * @property {string | null} startDate first date that counts (null: the category's first row)
 * @property {string} since       the Decisiones row or rule that set it up
 * @property {(p: Pick) => boolean} match membership (shadow picks only)
 */

const shadowModel = (/** @type {Pick} */ p) =>
  p.source === 'shadow' && !['ai_watch', 'published', 'published_bet', 'value', 'near_value', 'prop_value', 'prop_near_value'].includes(p.tag);
const inBand = (/** @type {Pick} */ p) => p.price != null && p.price >= 1.7 && p.price <= 4.0;

/** @type {FrozenTest[]} */
export const FROZEN_TESTS = [
  {
    id: 'rule30_pass_all',
    sheetLabel: 'SHADOW (pasó todos los filtros, regla 30)',
    startDate: '2026-10-13',
    since: 'Decisiones 70',
    match: (p) => shadowModel(p) && (p.reviewClass === 'corners' || p.reviewClass === 'cards') && p.date >= '2026-10-13' && p.parsed.passedAll,
  },
  {
    id: 'cards_under',
    sheetLabel: 'TARJETAS UNDER (modelo)',
    startDate: '2026-11-01',
    since: 'Decisiones 84',
    match: (p) => shadowModel(p) && p.reviewClass === 'cards' && p.side === 'under' && p.date >= '2026-11-01' && inBand(p),
  },
  {
    id: 'under45_control',
    sheetLabel: 'Under 4.5 (línea de control)',
    startDate: '2026-11-01',
    since: 'Decisiones 84',
    match: (p) =>
      shadowModel(p) && p.reviewClass === 'cards' && p.side === 'under' && p.date >= '2026-11-01' && inBand(p) && /under\s*4[.,]5/i.test(p.selection),
  },
  {
    id: 'corner_rejects',
    sheetLabel: 'CÓRNERS RECHAZO ≤2.0',
    startDate: '2026-11-09',
    since: 'Decisiones 106',
    match: (p) => p.source === 'shadow' && p.tag === 'corner_rejects' && p.date >= '2026-11-09',
  },
  {
    id: 'team_corners',
    sheetLabel: 'CÓRNERS EQUIPO (pasó todos los filtros)',
    startDate: null,
    since: 'Regla 32, Decisiones 88',
    match: (p) => shadowModel(p) && p.reviewClass === 'team_corners' && (p.parsed.passedAll || p.date >= '2026-11-03'),
  },
  {
    id: 'model_only_shots',
    sheetLabel: 'MODELO SOLO (tiros), 1.70–4.0',
    startDate: null,
    since: 'Decisiones 66, 91',
    match: (p) => p.source === 'shadow' && p.tag === 'model_only_shots' && inBand(p),
  },
  {
    id: 'match_total_shots',
    sheetLabel: 'Tiros totales del partido',
    startDate: null,
    since: 'Regla 25',
    match: (p) => shadowModel(p) && p.reviewClass === 'shots' && !isTeamShots(p.marketRaw) && p.tag !== 'model_only_shots',
  },
  {
    id: 'relaxed_sample_corners',
    sheetLabel: 'Córners muestra 6–9 (regla 18)',
    startDate: null,
    since: 'Regla 18',
    match: (p) => shadowModel(p) && p.reviewClass === 'corners' && p.parsed.filters.includes('rule18'),
  },
];

/**
 * Progress of one frozen test: graded rows out of 100, rows with a two-sided close out of 50,
 * mean fair-close EV with SE clustered by match, z, and the decision state.
 * @param {FrozenTest} test @param {Pick[]} picks
 */
export function frozenProgress(test, picks) {
  const rows = picks.filter((p) => isCountable(p) && test.match(p));
  const graded = rows.filter((p) => isGraded(p) && p.price != null);
  const ev = measureStat(graded, (p) => p.fairCloseEv);
  const ready = graded.length >= FROZEN_RULE.minGraded && ev.n >= FROZEN_RULE.minWithClose;
  /** @type {'collecting' | 'pass' | 'stop'} */
  const state = !ready ? 'collecting' : ev.z != null && ev.z >= FROZEN_RULE.zThreshold ? 'pass' : 'stop';
  const sameBook = graded.filter((p) => p.fairCloseEv != null && p.closeSource === 'same_book').length;
  return {
    test,
    rows,
    graded: graded.length,
    pending: rows.filter((p) => p.status === 'pending').length,
    withClose: ev.n,
    withCloseSameBook: sameBook,
    withCloseFeed: ev.n - sameBook,
    ev,
    summary: summarize(rows),
    firstDate: rows.length ? rows.reduce((m, p) => (p.date < m ? p.date : m), rows[0].date) : null,
    ready,
    state,
  };
}

/** Sombra review schedule (Decisiones row 112): both conditions since the last "Revisión Sombra N filas". */
export const SHADOW_REVIEW = {
  decisionRow: 112,
  minDays: 14,
  minNewGraded: 150,
  titlePattern: /Revisi[óo]n Sombra (\d+) filas/i,
};

/**
 * When the next Sombra review is due.
 * @param {import('./types').Decision[]} decisions
 * @param {Pick[]} picks
 * @param {string} today YYYY-MM-DD
 */
export function nextShadowReview(decisions, picks, today) {
  let last = null;
  for (const d of decisions) {
    const m = SHADOW_REVIEW.titlePattern.exec(d.topic) || SHADOW_REVIEW.titlePattern.exec(d.decision);
    if (m && (!last || d.date >= last.date)) last = { date: d.date, rows: Number(m[1]), decisionRow: d.row };
  }
  const graded = picks.filter((p) => p.source === 'shadow' && p.status !== 'pending').length;
  if (!last) return { last: null, graded, dueDate: null, dueRows: null, daysLeft: null, rowsLeft: null, due: false };
  const [y, m, d] = last.date.split('-').map(Number);
  const dueDate = new Date(Date.UTC(y, m - 1, d + SHADOW_REVIEW.minDays)).toISOString().slice(0, 10);
  const dueRows = last.rows + SHADOW_REVIEW.minNewGraded;
  const dayMs = 86400000;
  const daysLeft = Math.max(0, Math.round((Date.parse(dueDate) - Date.parse(today)) / dayMs));
  const rowsLeft = Math.max(0, dueRows - graded);
  return { last, graded, dueDate, dueRows, daysLeft, rowsLeft, due: daysLeft === 0 && rowsLeft === 0 };
}
