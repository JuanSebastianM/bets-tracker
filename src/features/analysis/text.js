// Plain sentences of the Analysis section, built only from figures computed in src/data/ (analysis.js,
// stats.js, overview.js). They describe what the numbers say, always with n, and never promise a result.
import { t } from '../../lib/i18n.js';
import { formatPct, formatRecord, formatScore, formatUnits } from '../../lib/format.js';
import { verdictLabel } from '../../data/summaries.js';
import { VERDICT_MIN_N } from '../../data/overview.js';

/** @typedef {import('../../data/analysis.js').BreakdownRow} BreakdownRow */
/** @typedef {import('../../data/stats.js').Summary} Summary */
/** @typedef {import('../../data/stats.js').MeanStat} MeanStat */

/** Samples under this many graded picks get the "too early" caution. */
export const SMALL_SAMPLE = 30;

/** The value a row is ranked by for a measure. @param {BreakdownRow} r @param {string} measure */
export const measureOf = (r, measure) => (measure === 'yield' ? r.summary.yield : r.summary.fairCloseEv.mean);
/** n behind a row's measure. @param {BreakdownRow} r @param {string} measure */
export const measureN = (r, measure) => (measure === 'yield' ? r.summary.n : r.summary.fairCloseEv.n);

/**
 * What a breakdown says: how many groups clear the minimum, the best and worst on the measure, and
 * (for fair-close EV) how many clear zero with their whole range.
 * @param {{ dim: string, rows: BreakdownRow[], minN: number, measure: string, labelOf: (k: string) => string }} a
 */
export function breakdownText({ dim, rows, minN, measure, labelOf }) {
  const big = rows.filter((r) => r.summary.n >= minN);
  if (!rows.length) return t('analysis.text.bdEmpty');
  if (!big.length) return t('analysis.text.bdNone', { dim, min: minN });
  const scored = big.filter((r) => measureOf(r, measure) != null).sort((a, b) => /** @type {number} */ (measureOf(b, measure)) - /** @type {number} */ (measureOf(a, measure)));
  const out = [t('analysis.text.bdGroups', { count: big.length, k: big.length, total: rows.length, dim, min: minN })];
  const name = t(`analysis.measure.${measure}`);
  if (!scored.length) out.push(t('analysis.text.bdNoMeasure', { measure: name }));
  else {
    const fmt = (/** @type {BreakdownRow} */ r) => ({ label: labelOf(r.key), v: formatPct(measureOf(r, measure)), n: measureN(r, measure) });
    if (scored.length === 1) out.push(t('analysis.text.bdOnly', { measure: name, ...fmt(scored[0]) }));
    else {
      const b = fmt(scored[0]);
      const w = fmt(scored[scored.length - 1]);
      out.push(t('analysis.text.bdBestWorst', { measure: name, best: b.label, bv: b.v, bn: b.n, worst: w.label, wv: w.v, wn: w.n }));
    }
  }
  if (measure === 'ev') {
    const above = big.filter((r) => r.verdict === 'above');
    const qualified = big.filter((r) => !['none', 'too_early'].includes(r.verdict));
    if (!qualified.length) out.push(t('analysis.text.bdEvEarly', { min: VERDICT_MIN_N }));
    else if (!above.length) out.push(t('analysis.text.bdEvNoneAbove', { count: qualified.length, k: qualified.length }));
    else out.push(t('analysis.text.bdEvAbove', { count: above.length, k: above.length, labels: above.map((r) => labelOf(r.key)).join(', ') }));
  }
  out.push(t('analysis.text.bdCaution'));
  return out.join(' ');
}

/**
 * One sentence per calibration series: mean prediction against the hit rate, the Brier score, and the
 * market's Brier score on the same picks when there are any.
 * @param {string} label @param {ReturnType<typeof import('../../data/analysis.js').calibrationReport>} r
 */
export function calibrationText(label, r) {
  if (!r.n) return t('analysis.text.calNone', { label });
  const out = [
    t('analysis.text.calSaid', {
      label,
      pred: formatPct(r.meanProb, { sign: false }),
      hit: formatPct(r.hitRate, { sign: false }),
      n: r.n,
      brier: formatScore(r.brier.score),
    }),
  ];
  const p = r.paired;
  if (p.n && p.series != null && p.market != null) {
    const d = p.series - p.market;
    const who = Math.abs(d) < 0.005 ? t('analysis.text.calTie') : d < 0 ? t('analysis.text.calSeriesBetter', { label }) : t('analysis.text.calMarketBetter');
    out.push(t('analysis.text.calPaired', { m: p.n, bs: formatScore(p.series), bm: formatScore(p.market), who }));
  } else out.push(t('analysis.text.calNoMarket'));
  if (r.n < SMALL_SAMPLE) out.push(t('analysis.text.small', { n: r.n }));
  return out.join(' ');
}

/** Fair-close EV of the current filter. @param {MeanStat} e @param {import('../../data/overview.js').Verdict} v */
export function closeText(e, v) {
  if (!e.n) return t('analysis.text.closeNone');
  const out = [t('analysis.text.closeShare', { share: formatPct(e.shareAbove, { sign: false }), n: e.n, ev: formatPct(e.mean) })];
  if (e.lo != null && e.hi != null) out.push(t('analysis.text.closeRange', { lo: formatPct(e.lo), hi: formatPct(e.hi), verdict: verdictLabel(v) }));
  if (e.n < SMALL_SAMPLE) out.push(t('analysis.text.small', { n: e.n }));
  return out.join(' ');
}

/** Raw CLV, as context. @param {MeanStat} c */
export function clvText(c) {
  if (!c.n) return t('analysis.text.clvNone');
  return t('analysis.text.clv', { clv: formatPct(c.mean), n: c.n, share: formatPct(c.shareAbove, { sign: false }) });
}

/** The Pinnacle join. @param {ReturnType<typeof import('../../data/analysis.js').pinnacleMoves>} r */
export function pinnacleText(r) {
  if (!r.withId) return t('analysis.text.pinNone');
  const out = [t('analysis.text.pinJoined', { count: r.withId, n: r.withId, joined: r.joined })];
  if (r.joined) out.push(t('analysis.text.pinMoves', { towards: r.counts.towards, away: r.counts.away, flat: r.counts.flat }));
  if (r.joined < VERDICT_MIN_N) out.push(t('analysis.text.pinFew'));
  return out.join(' ');
}

/** A record with its yield, n and fair-close EV, for comparisons. @param {Summary} s */
function brief(s) {
  const ev = s.fairCloseEv.n ? t('analysis.text.briefEv', { ev: formatPct(s.fairCloseEv.mean), n: s.fairCloseEv.n }) : t('analysis.text.briefNoEv');
  return t('analysis.text.brief', { record: formatRecord(s), yield: formatPct(s.yield), units: formatUnits(s.profit), n: s.n, ev });
}

/**
 * The written comparison of Grok and Claude: Grok overall, priced against not priced, team corners
 * against Sombra's CÓRNERS EQUIPO, and a caution about sample sizes.
 * @param {{ all: Summary, split: ReturnType<typeof import('../../data/analysis.js').grokPricedSplit>,
 *   tc: ReturnType<typeof import('../../data/analysis.js').grokTeamCorners> }} a
 */
export function grokText({ all, split, tc }) {
  if (!all.n && !all.pending) return t('analysis.text.grokNone');
  const out = [t('analysis.text.grokAll', { brief: brief(all) })];
  const { priced, notPriced } = split;
  if (priced.n && notPriced.n) {
    out.push(t('analysis.text.grokPriced', { py: formatPct(priced.yield), pn: priced.n, ny: formatPct(notPriced.yield), nn: notPriced.n }));
  }
  if (tc.grok.n || tc.sombra.n) {
    out.push(t('analysis.text.grokTc', { grok: brief(tc.grok), sombra: brief(tc.sombra) }));
    out.push(tc.matches.length ? t('analysis.text.grokShared', { count: tc.matches.length, m: tc.matches.length, same: tc.agreement.same, opposite: tc.agreement.opposite }) : t('analysis.text.grokNoShared'));
  }
  const smallest = Math.min(all.n, tc.sombra.n || Infinity);
  out.push(smallest < 100 ? t('analysis.text.grokCautionSmall') : t('analysis.text.grokCaution'));
  return out.join(' ');
}
