// The frozen tests and the Sombra review schedule, as data (betting-analyst "Frozen tests",
// Juan 9 Nov 2026, Decisiones row 111; milestone-reviewer "Frozen tests"; review.py v1.0).
// Membership predicates are a port of review.py's FROZEN TESTS block.

import { BOOKS, isTeamShots } from './tags.js';
import { powerProb } from './notes.js';
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
 * @property {number} [decisionRow] the Decisiones row that defines the test (all are decided by row 111)
 * @property {Partial<import('./filters.js').FilterState>} [explorer] closest Explorer filter (a superset
 *   when the membership has conditions the filters cannot express)
 */

/** Tolerance for "z of 2 or more": a mean exactly 2 SE above zero passes despite floating-point error. */
export const Z_EPS = 1e-9;

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
    decisionRow: 70,
    explorer: { sources: ['shadow'], tags: ['shadow_rule30'], markets: ['corners_total', 'cards_total'], dateFrom: '2026-10-13' },
    match: (p) => shadowModel(p) && (p.reviewClass === 'corners' || p.reviewClass === 'cards') && p.date >= '2026-10-13' && p.parsed.passedAll,
  },
  {
    id: 'cards_under',
    sheetLabel: 'TARJETAS UNDER (modelo)',
    startDate: '2026-11-01',
    since: 'Decisiones 84',
    decisionRow: 84,
    explorer: { sources: ['shadow'], tags: ['cards_under', 'shadow_rule30'], markets: ['cards_total'], dateFrom: '2026-11-01', price: { min: 1.7, max: 4 }, q: 'under' },
    match: (p) => shadowModel(p) && p.reviewClass === 'cards' && p.side === 'under' && p.date >= '2026-11-01' && inBand(p),
  },
  {
    id: 'under45_control',
    sheetLabel: 'Under 4.5 (línea de control)',
    startDate: '2026-11-01',
    since: 'Decisiones 84',
    decisionRow: 85,
    explorer: { sources: ['shadow'], tags: ['cards_under', 'shadow_rule30'], markets: ['cards_total'], dateFrom: '2026-11-01', price: { min: 1.7, max: 4 }, q: 'under 4.5' },
    match: (p) =>
      shadowModel(p) && p.reviewClass === 'cards' && p.side === 'under' && p.date >= '2026-11-01' && inBand(p) && /under\s*4[.,]5/i.test(p.selection),
  },
  {
    id: 'corner_rejects',
    sheetLabel: 'CÓRNERS RECHAZO ≤2.0',
    startDate: '2026-11-09',
    since: 'Decisiones 106',
    decisionRow: 106,
    explorer: { sources: ['shadow'], tags: ['corner_rejects'], dateFrom: '2026-11-09' },
    match: (p) => p.source === 'shadow' && p.tag === 'corner_rejects' && p.date >= '2026-11-09',
  },
  {
    id: 'team_corners',
    sheetLabel: 'CÓRNERS EQUIPO (pasó todos los filtros)',
    startDate: null,
    since: 'Regla 32, Decisiones 88',
    decisionRow: 88,
    explorer: { sources: ['shadow'], tags: ['team_corners'], markets: ['corners_team'] },
    match: (p) => shadowModel(p) && p.reviewClass === 'team_corners' && (p.parsed.passedAll || p.date >= '2026-11-03'),
  },
  {
    id: 'model_only_shots',
    sheetLabel: 'MODELO SOLO (tiros), 1.70–4.0',
    startDate: null,
    since: 'Decisiones 66, 91',
    decisionRow: 91,
    explorer: { sources: ['shadow'], tags: ['model_only_shots'], price: { min: 1.7, max: 4 } },
    match: (p) => p.source === 'shadow' && p.tag === 'model_only_shots' && inBand(p),
  },
  {
    id: 'match_total_shots',
    sheetLabel: 'Tiros totales del partido',
    startDate: null,
    since: 'Regla 25',
    decisionRow: 64,
    explorer: { sources: ['shadow'], markets: ['shots'], marketsRaw: ['Tiros (total)', 'Tiros totales', 'Tiros al arco (total)', 'Tiros al arco totales'] },
    match: (p) => shadowModel(p) && p.reviewClass === 'shots' && !isTeamShots(p.marketRaw) && p.tag !== 'model_only_shots',
  },
  {
    id: 'relaxed_sample_corners',
    sheetLabel: 'Córners muestra 6–9 (regla 18)',
    startDate: null,
    since: 'Regla 18',
    decisionRow: 5,
    explorer: { sources: ['shadow'], markets: ['corners_total'], reasons: ['rule18'] },
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
  const state = !ready ? 'collecting' : ev.z != null && ev.z >= FROZEN_RULE.zThreshold - Z_EPS ? 'pass' : 'stop';
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

// ---------------------------------------------------------------- Tests section additions
// Everything below is used by the Tests screen (src/features/tests). Formulas stay here, never in the screen.

const DAY_MS = 86400000;
/** Whole days from a to b ('YYYY-MM-DD'). @param {string} a @param {string} b */
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
/** 'YYYY-MM-DD' plus n days. @param {string} d @param {number} n */
export function plusDays(d, n) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

/** Days of recent history the projections use for the pace. */
export const PACE_WINDOW_DAYS = 14;

/**
 * Estimated date a count reaches `need`, at the pace of the last days.
 * @param {{ have: number, need: number, recent: number, windowDays: number, today: string }} o
 *   recent = how many were added in the last `windowDays` days (today included)
 * @returns {{ reached: boolean, perDay: number, daysLeft: number | null, date: string | null }}
 */
export function projectDate({ have, need, recent, windowDays, today }) {
  if (have >= need) return { reached: true, perDay: windowDays > 0 ? recent / windowDays : 0, daysLeft: 0, date: today };
  const perDay = windowDays > 0 ? recent / windowDays : 0;
  if (!(perDay > 0)) return { reached: false, perDay: 0, daysLeft: null, date: null };
  const daysLeft = Math.ceil((need - have) / perDay - 1e-9);
  return { reached: false, perDay, daysLeft, date: plusDays(today, daysLeft) };
}

/**
 * When a frozen test reaches its decision (100 graded and 50 with a close) at its recent pace.
 * The pace counts graded rows by match date over the last 14 days, or since the test's start when it
 * is younger. It is an estimate: slates vary in size.
 * @param {ReturnType<typeof frozenProgress>} progress
 * @param {string} today YYYY-MM-DD
 * @param {number} [windowDays]
 */
export function frozenProjection(progress, today, windowDays = PACE_WINDOW_DAYS) {
  const start = progress.test.startDate || progress.firstDate;
  const age = start ? daysBetween(start, today) + 1 : 0;
  const win = Math.max(0, Math.min(windowDays, age));
  const from = plusDays(today, -(win - 1));
  const graded = progress.rows.filter((p) => isGraded(p) && p.price != null);
  const recentGraded = win ? graded.filter((p) => p.date >= from && p.date <= today).length : 0;
  const recentClose = win ? graded.filter((p) => p.date >= from && p.date <= today && p.fairCloseEv != null).length : 0;
  const g = projectDate({ have: progress.graded, need: FROZEN_RULE.minGraded, recent: recentGraded, windowDays: win, today });
  const c = projectDate({ have: progress.withClose, need: FROZEN_RULE.minWithClose, recent: recentClose, windowDays: win, today });
  const date = g.date && c.date ? (g.date > c.date ? g.date : c.date) : null;
  return { windowDays: win, graded: g, withClose: c, date, reached: g.reached && c.reached };
}

/**
 * How far a frozen test is from its decision, 0–1: the smaller of graded / 100 and closes / 50
 * (both are needed, so the slower one sets the distance).
 * @param {{ graded: number, withClose: number }} p
 */
export function decisionShare(p) {
  return Math.min(1, p.graded / FROZEN_RULE.minGraded, p.withClose / FROZEN_RULE.minWithClose);
}

/**
 * What the frozen test still waits for: 'graded', 'closes', 'both' or null when ready.
 * @param {{ graded: number, withClose: number }} p
 */
export function waitingFor(p) {
  const g = p.graded < FROZEN_RULE.minGraded;
  const c = p.withClose < FROZEN_RULE.minWithClose;
  return g && c ? 'both' : g ? 'graded' : c ? 'closes' : null;
}

/**
 * The overview strip: how many tests are collecting, how many reached their decision count, and the
 * closest one to its decision among those still collecting.
 * @param {Array<ReturnType<typeof frozenProgress>>} list
 */
export function testsOverview(list) {
  const collecting = list.filter((p) => !p.ready);
  const ready = list.filter((p) => p.ready);
  let closest = null;
  for (const p of collecting) if (!closest || decisionShare(p) > decisionShare(closest)) closest = p;
  return { total: list.length, collecting: collecting.length, ready: ready.length, closest, closestShare: closest ? decisionShare(closest) : null };
}

/**
 * Past Sombra reviews: Decisiones rows whose topic starts with "Revisión Sombra", newest first, with
 * the row count from "Revisión Sombra N filas" when it is there.
 * @param {import('./types').Decision[]} decisions
 */
export function shadowReviewHistory(decisions) {
  return decisions
    .filter((d) => /^\s*revisi[óo]n sombra\b/i.test(d.topic || ''))
    .map((d) => {
      const m = SHADOW_REVIEW.titlePattern.exec(d.topic);
      return { row: d.row, date: d.date, topic: d.topic, status: d.status, rows: m ? Number(m[1]) : null };
    })
    .sort((a, b) => (a.date === b.date ? b.row - a.row : a.date < b.date ? 1 : -1));
}

/**
 * The two parts of the review schedule as progress: days since the last review out of 14 and rows
 * graded since it out of 150.
 * @param {ReturnType<typeof nextShadowReview>} r
 */
export function shadowReviewParts(r) {
  if (!r.last) return null;
  const days = SHADOW_REVIEW.minDays - r.daysLeft;
  const rows = Math.max(0, r.graded - r.last.rows);
  return {
    days,
    daysShare: Math.min(1, days / SHADOW_REVIEW.minDays),
    rows,
    rowsShare: Math.min(1, rows / SHADOW_REVIEW.minNewGraded),
    daysMet: r.daysLeft === 0,
    rowsMet: r.rowsLeft === 0,
  };
}

// ---------------------------------------------------------------- price-first tests

/** z for a two-sided 95% interval (Decisiones row 97 asks for a 95% CI; review.py uses 1.96 × the clustered SE). */
export const Z95 = 1.96;

/**
 * VALOR PROP's measure (Decisiones row 97, review.py's vprop_measure): F × the power-de-vigged bet365
 * close − 1, only when the feed close in the notes has exactly one other side.
 * @param {Pick} p
 */
export function propCloseEv(p) {
  const c = p.parsed && p.parsed.close;
  if (!p.price || !c || !c.price || !Array.isArray(c.others) || c.others.length !== 1) return null;
  return p.price * powerProb(c.price, c.others) - 1;
}

/**
 * The price-first tests (rule 29 value and the prop consensus test). Each keeps its own rule, not row 111.
 * @typedef {object} PriceFirstTest
 * @property {string} id
 * @property {import('./types').TagId} tag
 * @property {string} sheetLabel
 * @property {number[]} decisionRows the Decisiones rows that define it
 * @property {'value' | 'prop' | 'context'} rule which rule decides it ('context': reported beside another, decides nothing)
 * @property {string | null} startDate
 * @property {Partial<import('./filters.js').FilterState>} explorer
 */

/** @type {PriceFirstTest[]} */
export const PRICE_FIRST_TESTS = [
  { id: 'value', tag: 'value', sheetLabel: 'VALOR', decisionRows: [79, 80, 108], rule: 'value', startDate: null, explorer: { sources: ['shadow'], tags: ['value'] } },
  { id: 'near_value', tag: 'near_value', sheetLabel: 'VALOR CASI', decisionRows: [58, 80], rule: 'context', startDate: null, explorer: { sources: ['shadow'], tags: ['near_value'] } },
  { id: 'prop_value', tag: 'prop_value', sheetLabel: 'VALOR PROP', decisionRows: [97], rule: 'prop', startDate: null, explorer: { sources: ['shadow'], tags: ['prop_value'] } },
  { id: 'prop_near_value', tag: 'prop_near_value', sheetLabel: 'VALOR PROP CASI', decisionRows: [97], rule: 'context', startDate: null, explorer: { sources: ['shadow'], tags: ['prop_near_value'] } },
];

/**
 * Rule 29 value (Decisiones rows 79 and 80): the gate is measured on the 4.0-or-less line: mean
 * fair-close EV (the opening against the close at its own source, milestone-reviewer's fair-close EV)
 * above zero over 30+ graded rows that have it, and positive flat yield. Decided before the data:
 * (a) ≤4.0 clears it → propose ≤4.0, or ≤3.0 only if the 3.0–4.0 band has 10+ rows with the EV and a
 * negative mean; (b) ≤4.0 fails but ≤3.0 clears → judge ≤3.0 only on rows dated 30 Oct 2026 or later,
 * and propose it once those alone clear the gate; (c) neither → results and goals stay SHADOW.
 * Pinnacle (row 108): at 100 graded VALOR and VALOR CASI rows with a Pinnacle close, VALOR is also judged
 * on F × de-vigged Pinnacle close − 1.
 */
export const VALUE_RULE = {
  decisionRows: [79, 80],
  gateMax: 4.0,
  checkMax: 3.0,
  minWithEv: 30,
  bandMinWithEv: 10,
  freshSince: '2026-10-30',
  pinnacleRow: 108,
  pinnacleMin: 100,
};

/** VALOR PROP (Decisiones row 97): 60 rows with the measure, then 120 if not clear either way. */
export const PROP_RULE = { decisionRow: 97, firstLook: 60, finalLook: 120, passStakeU: 0.25 };

/**
 * Record, flat yield and the measure of a set of rows.
 * @param {Pick[]} rows @param {(p: Pick) => number | null} get
 */
function line(rows, get) {
  const graded = rows.filter((p) => isGraded(p) && p.price != null);
  const ev = measureStat(graded, get);
  const lo95 = ev.se != null && ev.mean != null ? ev.mean - Z95 * ev.se : null;
  const hi95 = ev.se != null && ev.mean != null ? ev.mean + Z95 * ev.se : null;
  return { rows, graded: graded.length, summary: summarize(rows), ev, lo95, hi95 };
}

/** @param {ReturnType<typeof line>} l */
const clearsValueGate = (l) => l.ev.n >= VALUE_RULE.minWithEv && l.ev.mean > 0 && l.summary.yield != null && l.summary.yield > 0;

/**
 * Progress of a price-first test, with its own rule.
 * @param {PriceFirstTest} test @param {Pick[]} picks
 */
export function priceFirstProgress(test, picks) {
  const rows = picks.filter((p) => p.source === 'shadow' && isCountable(p) && p.tag === test.tag && (!test.startDate || p.date >= test.startDate));
  const pending = rows.filter((p) => p.status === 'pending').length;
  const slates = new Set(rows.map((p) => p.date)).size;
  const base = { test, rows, pending, slates, perSlate: slates ? rows.length / slates : null };
  if (test.id === 'value' || test.id === 'near_value') {
    const get = (/** @type {Pick} */ p) => p.openingFairEv;
    const all = line(rows, get);
    const le4 = line(rows.filter((p) => p.price != null && p.price <= VALUE_RULE.gateMax), get);
    const le3 = line(rows.filter((p) => p.price != null && p.price <= VALUE_RULE.checkMax), get);
    const band34 = line(rows.filter((p) => p.price != null && p.price > VALUE_RULE.checkMax && p.price <= VALUE_RULE.gateMax), get);
    const gt4 = line(rows.filter((p) => p.price != null && p.price > VALUE_RULE.gateMax), get);
    const le3Fresh = line(rows.filter((p) => p.price != null && p.price <= VALUE_RULE.checkMax && p.date >= VALUE_RULE.freshSince), get);
    const byBook = BOOKS.map((b) => ({ book: b, ...line(rows.filter((p) => p.parsed.priceSource === b), get) }));
    const otherSource = line(rows.filter((p) => !BOOKS.includes(/** @type {any} */ (p.parsed.priceSource))), get);
    /** @type {'collecting' | 'pass' | 'stop' | 'context'} */
    let state = 'collecting';
    /** @type {'a' | 'a_le3' | 'b' | 'b_waiting' | 'c' | null} */
    let decisionCase = null;
    if (test.rule === 'context') state = 'context';
    else if (clearsValueGate(le4)) {
      state = 'pass';
      decisionCase = band34.ev.n >= VALUE_RULE.bandMinWithEv && band34.ev.mean < 0 ? 'a_le3' : 'a';
    } else if (clearsValueGate(le3)) {
      decisionCase = clearsValueGate(le3Fresh) ? 'b' : 'b_waiting';
      state = decisionCase === 'b' ? 'pass' : 'collecting';
    } else if (le4.ev.n >= VALUE_RULE.minWithEv) {
      state = 'stop';
      decisionCase = 'c';
    }
    const pinGraded = picks.filter(
      (p) => p.source === 'shadow' && isCountable(p) && (p.tag === 'value' || p.tag === 'near_value') && isGraded(p) && p.parsed.pin && p.parsed.pin.id,
    ).length;
    return { ...base, kind: 'value', measure: 'openingFairEv', all, le4, le3, band34, gt4, le3Fresh, byBook, otherSource, state, decisionCase, pinGraded, gateLine: le4 };
  }
  const all = line(rows, propCloseEv);
  const byBook = BOOKS.map((b) => ({ book: b, ...line(rows.filter((p) => p.parsed.priceSource === b), propCloseEv) }));
  const n = all.ev.n;
  const clear = all.lo95 != null && all.lo95 > 0 && all.summary.yield != null && all.summary.yield > 0;
  /** @type {'collecting' | 'pass' | 'stop' | 'context' | 'extended'} */
  let state = 'collecting';
  if (test.rule === 'context') state = 'context';
  else if (n >= PROP_RULE.finalLook) state = clear ? 'pass' : 'stop';
  else if (n >= PROP_RULE.firstLook) state = clear ? 'pass' : all.ev.mean != null && all.ev.mean <= 0 ? 'stop' : 'extended';
  return { ...base, kind: 'prop', measure: 'propCloseEv', all, byBook, state, clear, gateLine: all, target: n >= PROP_RULE.firstLook && state === 'extended' ? PROP_RULE.finalLook : PROP_RULE.firstLook };
}

// ---------------------------------------------------------------- stopped or paused categories

/**
 * Categories no longer logged (or rows that never count), so old Sombra rows make sense.
 * @typedef {object} StoppedCategory
 * @property {string} id
 * @property {string} sheetLabel
 * @property {string} stoppedOn YYYY-MM-DD
 * @property {number} decisionRow
 * @property {(p: Pick) => boolean} match
 * @property {Partial<import('./filters.js').FilterState>} explorer
 */

/** @type {StoppedCategory[]} */
export const STOPPED_CATEGORIES = [
  {
    id: 'ai_watch_corners', sheetLabel: 'IA-WATCH (córners)', stoppedOn: '2026-10-29', decisionRow: 76,
    match: (p) => p.source === 'shadow' && p.tag === 'ai_watch' && p.reviewClass === 'corners',
    explorer: { sources: ['shadow'], tags: ['ai_watch'], markets: ['corners_total'] },
  },
  {
    id: 'ai_watch_cards', sheetLabel: 'IA-WATCH (tarjetas)', stoppedOn: '2026-11-02', decisionRow: 88,
    match: (p) => p.source === 'shadow' && p.tag === 'ai_watch' && p.reviewClass === 'cards',
    explorer: { sources: ['shadow'], tags: ['ai_watch'], markets: ['cards_total'] },
  },
  {
    id: 'team_corner_rejects', sheetLabel: 'CÓRNERS EQUIPO (rechazos)', stoppedOn: '2026-11-02', decisionRow: 88,
    match: (p) => shadowModel(p) && p.reviewClass === 'team_corners' && !p.parsed.passedAll && p.date < '2026-11-03',
    explorer: { sources: ['shadow'], markets: ['corners_team'], dateTo: '2026-11-02' },
  },
  {
    id: 'team_shots', sheetLabel: 'Tiros y tiros al arco de equipo', stoppedOn: '2026-11-02', decisionRow: 88,
    match: (p) => shadowModel(p) && p.reviewClass === 'shots' && isTeamShots(p.marketRaw) && p.tag !== 'model_only_shots',
    explorer: { sources: ['shadow'], markets: ['shots'], q: 'equipo' },
  },
  {
    id: 'corner_card_fillers', sheetLabel: 'Rellenos de córners y tarjetas (rechazos)', stoppedOn: '2026-11-08', decisionRow: 103,
    match: (p) => p.source === 'shadow' && p.tag === 'filter_reject' && (p.reviewClass === 'corners' || p.reviewClass === 'cards') && p.date <= '2026-11-08',
    explorer: { sources: ['shadow'], tags: ['filter_reject'], markets: ['corners_total', 'cards_total'], dateTo: '2026-11-08' },
  },
  {
    id: 'shots_fillers', sheetLabel: 'Rellenos de tiros (rechazos)', stoppedOn: '2026-10-24', decisionRow: 64,
    match: (p) => p.source === 'shadow' && p.tag === 'filter_reject' && p.reviewClass === 'shots' && p.date <= '2026-10-24',
    explorer: { sources: ['shadow'], tags: ['filter_reject'], markets: ['shots'], dateTo: '2026-10-24' },
  },
  {
    id: 'model_only_shots_low', sheetLabel: 'MODELO SOLO bajo 1.70', stoppedOn: '2026-11-03', decisionRow: 91,
    match: (p) => p.source === 'shadow' && p.tag === 'model_only_shots' && p.price != null && p.price < 1.7,
    explorer: { sources: ['shadow'], tags: ['model_only_shots'], price: { min: null, max: 1.69 } },
  },
];

/**
 * Final numbers of a stopped category: record, flat yield, fair-close EV, first and last row date.
 * @param {StoppedCategory} cat @param {Pick[]} picks
 */
export function stoppedSummary(cat, picks) {
  const rows = picks.filter((p) => isCountable(p) && cat.match(p));
  let first = null;
  let last = null;
  for (const p of rows) {
    if (!first || p.date < first) first = p.date;
    if (!last || p.date > last) last = p.date;
  }
  return { category: cat, rows, summary: summarize(rows), first, last };
}
