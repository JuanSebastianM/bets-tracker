// Calibration part: does a pick logged at 60% win 60% of the time? One row per probability series
// (model, blend, consensus fair probability on price-first rows, Sofascore AI) with its Brier score and
// the market's on the same picks, a plain sentence each; the chosen series as a calibration chart.
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Card, SegmentedControl } from '../../lib/ui/index.js';
import { CalibrationChart } from '../../lib/charts/index.js';
import { formatPct, formatScore } from '../../lib/format.js';
import { CAL_SERIES, calibrationReport } from '../../data/analysis.js';
import { calibrationText } from './text.js';

/** @typedef {import('../../data/types').Pick} Pick */
/** @typedef {import('./view.js').View} View */

/** @param {{ picks: Pick[], view: View, setView: (p: Partial<View>) => void }} props */
export function Calibration({ picks, view, setView }) {
  const reports = useMemo(() => CAL_SERIES.map((s) => calibrationReport(picks, s.id)), [picks]);
  const name = (/** @type {string} */ id) => t(`analysis.cal.series.${id}`);
  const chosen = reports.find((r) => r.id === view.series) || reports[0];
  const label = name(chosen.id);
  const buckets = chosen.buckets.filter((b) => b.n);
  const summary = t('analysis.cal.chartSummary', { label, count: chosen.n, n: chosen.n, buckets: buckets.length });

  return html`<div class="stack an-part" data-testid="analysis-calibration">
    <${Card} title=${t('analysis.cal.title')} subtitle=${t('analysis.cal.sub')}>
      <ul class="an-series" data-testid="calibration-compare">
        ${reports.map(
          (r) => html`<li key=${r.id} class=${r.id === chosen.id ? 'an-on' : ''} data-series=${r.id}>
            <div class="an-series-head">
              <span class="an-series-name">${name(r.id)}</span>
              <span class="an-series-figs num">
                <span>n ${r.n}</span>
                <span>${t('analysis.cal.brierShort', { v: formatScore(r.brier.score) })}</span>
                ${r.paired.n ? html`<span>${t('analysis.cal.marketShort', { v: formatScore(r.paired.market), n: r.paired.n })}</span>` : null}
              </span>
            </div>
            <p class="an-text">${calibrationText(name(r.id), r)}</p>
          </li>`,
        )}
      </ul>
      <p class="an-note">${t('analysis.cal.brierNote')}</p>
    </${Card}>

    <${Card} title=${t('analysis.cal.chartTitle', { label })}>
      <${SegmentedControl}
        label=${t('analysis.cal.seriesLabel')}
        value=${chosen.id}
        options=${CAL_SERIES.map((s) => ({ value: s.id, label: t(`analysis.cal.seriesShort.${s.id}`) }))}
        onValue=${(/** @type {string} */ series) => setView({ series })}
      />
      <div class="an-cal">
        <${CalibrationChart}
          testId="calibration-chart"
          showN
          buckets=${chosen.buckets}
          summary=${summary}
          table=${{
            columns: [
              { key: 'range', label: t('analysis.cal.bucket') },
              { key: 'n', label: 'n', num: true },
              { key: 'pred', label: t('analysis.cal.said'), num: true },
              { key: 'hit', label: t('analysis.cal.happened'), num: true },
            ],
            rows: buckets.map((b) => ({
              key: `${b.lo}`,
              range: t('analysis.band', { lo: formatPct(b.lo, { sign: false, digits: 0 }), hi: formatPct(b.hi, { sign: false, digits: 0 }) }),
              n: b.n,
              pred: formatPct(b.meanProb, { sign: false }),
              hit: formatPct(b.hitRate, { sign: false }),
            })),
          }}
        />
        <div class="an-cal-legend">
          <p class="an-note">${t('analysis.cal.howToRead')}</p>
          ${buckets.length ? null : html`<p class="an-muted">${t('analysis.cal.noBuckets')}</p>`}
        </div>
      </div>
    </${Card}>
  </div>`;
}
