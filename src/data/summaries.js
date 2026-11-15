// Human sentences from stats, in the app language. Templates live in src/i18n/*.json under
// "summaries"; this module only picks the template and fills the numbers (formatted by format.js).
// The Overview feature extends it: add a function here, its templates in both languages, and a test.
//
//   describe(t('sources.shadow'), summarize(picks))
//   -> "Sombra: 31-22-3 a cuota media 2.10, +4.30u (+8.1%) en 56 calificadas. 4 pendientes."

import { t } from '../lib/i18n.js';
import { formatPct, formatPrice, formatRecord, formatUnits } from '../lib/format.js';
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
    price: formatPrice(s.avgPrice),
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
