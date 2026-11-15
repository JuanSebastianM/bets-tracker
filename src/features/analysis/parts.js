// Small pieces shared by the four parts of the Analysis section.
import { html, useId } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { href } from '../../lib/router.js';
import { Chip } from '../../lib/ui/index.js';
import { formatPct, formatRecord } from '../../lib/format.js';
import { toQueryString } from '../../data/filters.js';
import { verdictLabel } from '../../data/summaries.js';

/** @typedef {import('../../data/stats.js').Summary} Summary */
/** @typedef {import('../../data/stats.js').MeanStat} MeanStat */

const VERDICT_TONE = { above: 'won', below: 'lost', lean_above: 'neutral', lean_below: 'neutral', too_early: 'pending', none: 'neutral' };

/** The verdict word against the close (the Overview's words). @param {{ v: import('../../data/overview.js').Verdict }} props */
export function VerdictChip({ v }) {
  return html`<${Chip} tone=${VERDICT_TONE[v]} class="an-verdict">${verdictLabel(v)}</${Chip}>`;
}

/** Explorer href for a filter state. @param {import('../../data/filters.js').FilterState} f */
export function explorerHref(f) {
  const qs = toQueryString(f);
  return href(`/explorer${qs ? `?${qs}` : ''}`);
}

/** "−1.2% (n 9)" or "sin cierres". @param {MeanStat} e */
export function evText(e) {
  return e.n ? `${formatPct(e.mean)} (n ${e.n})` : t('analysis.noClose');
}

/** "−4.1% a +1.7%" or ''. @param {MeanStat} e */
export function rangeText(e) {
  return e.lo != null && e.hi != null ? t('analysis.range', { lo: formatPct(e.lo), hi: formatPct(e.hi) }) : '';
}

/** "54.2% / 51.0%" (hit rate / break-even), or '–'. @param {Summary} s */
export function hitText(s) {
  if (s.hitRate == null || s.breakEven == null) return '–';
  return `${formatPct(s.hitRate, { sign: false })} / ${formatPct(s.breakEven, { sign: false })}`;
}

/** Signed class for a figure. @param {number | null} v */
export const signClass = (v) => (v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');

/**
 * One summary as a compact line of figures: n, record, yield, fair-close EV.
 * @param {{ s: Summary, testId?: string }} props
 */
export function SummaryLine({ s, testId }) {
  return html`<span class="an-line num" data-testid=${testId}>
    <span>n ${s.n}</span>
    <span>${formatRecord(s)}</span>
    <span class=${signClass(s.yield)}>${t('analysis.yieldShort', { v: formatPct(s.yield) })}</span>
    <span>${t('analysis.evShort', { v: evText(s.fairCloseEv) })}</span>
  </span>`;
}

/**
 * A labelled slider for the minimum n (native range input, 44 px tall).
 * @param {{ value: number, max: number, onValue: (n: number) => void, testId?: string }} props
 */
export function MinNSlider({ value, max, onValue, testId }) {
  const id = useId();
  return html`<div class="field an-minn">
    <label class="field-label" for=${id}>${t('analysis.minN')} <output class="num an-minn-value" for=${id}>${value}</output></label>
    <input id=${id} type="range" min="0" max=${max} step="1" value=${value} data-testid=${testId}
      aria-valuetext=${t('analysis.minNValue', { n: value })}
      onInput=${(/** @type {any} */ e) => onValue(Number(e.currentTarget.value))} />
  </div>`;
}
