// Human sentences from stats, in the app language. Templates live in src/i18n/*.json under
// "summaries"; this module only picks the template and fills the numbers (formatted by format.js).
// The Overview feature extends it: add a function here, its templates in both languages, and a test.
//
//   describe(t('sources.shadow'), summarize(picks))
//   -> "Sombra: 31-22-3 a cuota media 2.10, +4.30u (+8.1%) en 56 calificadas. 4 pendientes."

import { t } from '../lib/i18n.js';
import { formatDate, formatPct, formatPrice, formatRecord, formatUnits } from '../lib/format.js';
import { MIN_N_FOR_RATE } from './stats.js';

/** @typedef {import('./stats.js').Summary} Summary */

/**
 * The record sentence of a group.
 * @param {string} label already translated or a sheet label ("VALOR CASI")
 * @param {Summary} s
 */
export function describeRecord(label, s) {
  if (!s.n) return t('summaries.noGraded', { label, count: s.pending, pending: s.pending });
  let out = t('summaries.record', {
    label,
    record: formatRecord(s),
    price: formatPrice(s.avgPrice, { average: true }),
    profit: formatUnits(s.profit),
    yield: formatPct(s.yield),
    n: s.n,
    count: s.n,
  });
  if (s.pending) out += ' ' + t('summaries.pending', { count: s.pending, pending: s.pending });
  return out;
}

/**
 * Hit rate against break-even, only when the sample allows a rate.
 * @param {Summary} s
 */
export function describeHitRate(s) {
  if (s.n < MIN_N_FOR_RATE || s.hitRate == null || s.breakEven == null) return '';
  return t(s.hitRate >= s.breakEven ? 'summaries.hitAbove' : 'summaries.hitBelow', {
    hit: formatPct(s.hitRate, { sign: false }),
    be: formatPct(s.breakEven, { sign: false }),
  });
}

/**
 * Fair-close EV with n and the ±2 SE range.
 * @param {Summary} s
 */
export function describeCloseEv(s) {
  const e = s.fairCloseEv;
  if (!e || !e.n) return t('summaries.closeEvNone');
  const base = t('summaries.closeEv', { ev: formatPct(e.mean), n: e.n });
  if (e.lo == null || e.hi == null) return base;
  return `${base} ${t('summaries.closeEvRange', { lo: formatPct(e.lo), hi: formatPct(e.hi) })}`;
}

/**
 * A warning for small samples ('' when n is large enough).
 * @param {Summary} s @param {number} [min]
 */
export function describeSampleWarning(s, min = 30) {
  return s.n > 0 && s.n < min ? t('summaries.smallSample', { n: s.n }) : '';
}

/**
 * Full paragraph: record, hit rate, close EV and the small-sample warning, joined.
 * @param {string} label @param {Summary} s
 */
export function describe(label, s) {
  return [describeRecord(label, s), describeHitRate(s), s.n ? describeCloseEv(s) : '', describeSampleWarning(s)].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- Overview sentences
// Built only from figures computed in src/data/ (stats.js, overview.js). They describe; they never
// promise a result.

/** Graded-sample sizes the sentences use to say how much a record means. */
export const SAMPLE_SMALL = 30;
export const SAMPLE_MEDIUM = 100;

/**
 * How much a sample of `n` graded picks can say.
 * @param {number} n
 */
export function describeSampleSize(n) {
  if (!n) return '';
  if (n < SAMPLE_SMALL) return t('summaries.sampleSmall', { n });
  if (n < SAMPLE_MEDIUM) return t('summaries.sampleMedium', { n });
  return t('summaries.sampleLarge', { n });
}

/**
 * The gap between results and price quality, when they point in opposite directions and the close
 * has enough rows to have a verdict ('' otherwise).
 * @param {Summary} s
 * @param {import('./overview.js').Verdict} verdict closeVerdict(s.fairCloseEv)
 */
export function describeResultsVsClose(s, verdict) {
  if (!s.n || s.profit == null || ['none', 'too_early'].includes(verdict)) return '';
  const closeGood = verdict === 'above' || verdict === 'lean_above';
  if (s.profit > 0 && !closeGood) return t('summaries.luckyWin');
  if (s.profit < 0 && closeGood) return t('summaries.unluckyLoss');
  if (s.profit > 0 && verdict === 'above') return t('summaries.bothGood');
  return '';
}

/**
 * One paragraph per source for the Overview: record, hit rate, close EV, what the sample can say and
 * the results-vs-close gap.
 * @param {string} label @param {Summary} s @param {import('./overview.js').Verdict} verdict
 */
export function describeSource(label, s, verdict) {
  if (!s.n) return describeRecord(label, s);
  return [describeRecord(label, s), describeHitRate(s), describeCloseEv(s), describeSampleSize(s.n), describeResultsVsClose(s, verdict)]
    .filter(Boolean)
    .join(' ');
}

/** Verdict word of a group ("muy pronto", "por encima del cierre"…). @param {import('./overview.js').Verdict} v */
export function verdictLabel(v) {
  return t(`summaries.verdict.${v}`);
}

/**
 * Best and worst tag (or market) against the close, with n.
 * @param {{ best: any, worst: any, qualified: number }} bw bestWorst(rows)
 * @param {(key: string) => string} labelOf
 * @param {number} minN VERDICT_MIN_N
 */
export function describeBestWorst(bw, labelOf, minN) {
  if (!bw.best) return t('summaries.bestWorstNone', { min: minN });
  const fmt = (/** @type {any} */ r) => ({ label: labelOf(r.key), ev: formatPct(r.summary.fairCloseEv.mean), n: r.summary.fairCloseEv.n });
  const best = t('summaries.bestTag', fmt(bw.best));
  if (!bw.worst) return `${best} ${t('summaries.onlyOneQualified', { min: minN })}`;
  return `${best} ${t('summaries.worstTag', fmt(bw.worst))}`;
}

/**
 * The last graded slate: per source record and units.
 * @param {{ date: string | null, sources: Array<{ source: string, summary: Summary }> }} r slateReport()
 */
export function describeLastSlate(r) {
  if (!r.date || !r.sources.length) return t('summaries.lastSlateNone');
  const parts = r.sources
    .filter((x) => x.summary.n)
    .map((x) => t('summaries.sourceRecord', { source: t(`sources.${x.source}`), record: formatRecord(x.summary), profit: formatUnits(x.summary.profit) }));
  const pending = r.sources.reduce((a, x) => a + x.summary.pending, 0);
  let out = t('summaries.lastSlate', { date: formatDate(r.date, 'short'), parts: parts.join('; ') });
  if (pending) out += ' ' + t('summaries.lastSlatePending', { count: pending, n: pending });
  return out;
}

/**
 * What is pending from today on.
 * @param {Array<{ date: string, picks: any[], bySource: Record<string, number> }>} groups upcomingPending()
 * @param {string} today
 */
export function describePending(groups, today) {
  if (!groups.length) return t('summaries.pendingNone');
  const total = groups.reduce((a, g) => a + g.picks.length, 0);
  const first = groups[0];
  const split = Object.entries(first.bySource)
    .filter(([, n]) => n)
    .map(([src, n]) => `${t(`sources.${src}`)} ${n}`)
    .join(', ');
  const when = first.date === today ? t('summaries.today') : formatDate(first.date, 'short');
  let out = t('summaries.pendingFirst', { count: first.picks.length, n: first.picks.length, when, split });
  if (groups.length > 1) out += ' ' + t('summaries.pendingMore', { count: total - first.picks.length, n: total - first.picks.length, slates: groups.length - 1 });
  return out;
}

/**
 * Since the last visit: picks graded and their result per source.
 * @param {ReturnType<typeof import('./overview.js').sinceLastVisit>} r
 */
export function describeSinceVisit(r) {
  if (!r) return '';
  if (!r.graded.length) return t('summaries.sinceNothing');
  const parts = r.sources.map((x) => t('summaries.sourceRecord', { source: t(`sources.${x.source}`), record: formatRecord(x.summary), profit: formatUnits(x.summary.profit) }));
  let out = t('summaries.sinceGraded', { count: r.graded.length, n: r.graded.length, parts: parts.join('; ') });
  if (r.added) out += ' ' + t('summaries.sinceAdded', { count: r.added, n: r.added });
  if (!r.exact) out += ' ' + t('summaries.sinceApprox');
  return out;
}

/**
 * Real bets: where the curve stands against its peak.
 * @param {ReturnType<typeof import('./overview.js').realBetsExtras>} x
 */
export function describeRealBets(x) {
  if (!x.days.length) return t('summaries.realNone');
  if (x.currentDrawdownU <= 1e-9) return t('summaries.realAtPeak', { total: formatUnits(x.total) });
  return t('summaries.realBelowPeak', { total: formatUnits(x.total), dd: formatUnits(x.currentDrawdownU, { sign: false }), peak: formatUnits(x.peak) });
}
