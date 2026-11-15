// Hand-written SVG charts. Each one takes `summary` (the sentence that says what the chart shows,
// read by screen readers and shown as the caption) and, through ChartFrame, a table toggle.
// Colours are tokens (CSS variables) only.
//
//   <LineChart values=${cum} labels=${dates} shadeDrawdown summary="…" yFormat=${formatUnits} />
//   <BarChart bars=${[{ label: 'VALOR', value: 0.08, tone: 'won' }]} yFormat=${formatPct} summary="…" />
//   <CalibrationChart buckets=${calibration(picks)} summary="…" />
//   <Sparkline values=${[...]} summary="…" />
import { html, useState, useId, useRef, useLayoutEffect } from '../../../vendor/preact.js';
import { t } from '../i18n.js';
import { DataTable } from '../ui/data.js';

/**
 * Pixel width of an element (follows resizes), so SVG text keeps its real size.
 * @param {number} fallback
 */
/** @returns {[import('../../../vendor/preact.js').Ref<HTMLDivElement | null>, number]} */
export function useWidth(fallback = 358) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const cw = Math.round(el.getBoundingClientRect().width);
      if (cw > 0) setW(cw);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Linear scale. @param {[number, number]} d @param {[number, number]} r */
export function scale(d, r) {
  const [d0, d1] = d;
  const [r0, r1] = r;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (/** @type {number} */ v) => r0 + (v - d0) * k;
}

/** About `count` round tick values covering [min, max]. @param {number} min @param {number} max */
export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 0.5) || mag * 10;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/**
 * Figure wrapper: caption (the summary), the chart, and a "show as table" toggle.
 * @param {{ summary: string, children: any, table?: { columns: any[], rows: any[] }, title?: string, testId?: string }} props
 */
export function ChartFrame({ summary, children, table, title, testId }) {
  const [showTable, setShowTable] = useState(false);
  return html`<figure class="chart" data-testid=${testId}>
    ${title ? html`<div class="chart-title">${title}</div>` : null}
    ${showTable && table ? html`<${DataTable} columns=${table.columns} rows=${table.rows} caption=${summary} />` : children}
    <figcaption class="chart-caption">
      <span>${summary}</span>
      ${table
        ? html`<button type="button" class="link-btn" aria-pressed=${showTable ? 'true' : 'false'} onClick=${() => setShowTable(!showTable)}>
            ${showTable ? t('chart.showChart') : t('chart.showTable')}
          </button>`
        : null}
    </figcaption>
  </figure>`;
}

/**
 * Cumulative curve with a zero line and, optionally, the drawdown (gap to the running peak) shaded.
 * @param {{ values: number[], labels?: string[], summary: string, yFormat?: (v: number) => string, height?: number,
 *   shadeDrawdown?: boolean, table?: { columns: any[], rows: any[] }, testId?: string }} props
 */
export function LineChart({ values, labels = [], summary, yFormat = (v) => String(v), height = 200, shadeDrawdown = false, table, testId }) {
  const [box, W] = useWidth();
  const H = height;
  const pad = { l: 52, r: 12, t: 12, b: 24 };
  const id = useId();
  const n = values.length;
  if (!n) return html`<${ChartFrame} summary=${summary} table=${table} testId=${testId}><div class="chart-empty">${t('chart.noData')}</div></${ChartFrame}>`;
  const ys = [0, ...values];
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) max = min + 1;
  const padY = (max - min) * 0.08;
  min -= padY;
  max += padY;
  const x = scale([0, Math.max(1, n - 1)], [pad.l, W - pad.r]);
  const y = scale([min, max], [H - pad.b, pad.t]);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join('L')}`;
  const area = `M${x(0).toFixed(1)},${y(0).toFixed(1)}L${pts.join('L')}L${x(n - 1).toFixed(1)},${y(0).toFixed(1)}Z`;
  let dd = '';
  if (shadeDrawdown) {
    let peak = -Infinity;
    const peaks = values.map((v) => (peak = Math.max(peak, v, 0)));
    const top = peaks.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`);
    const bottom = [...pts].reverse();
    dd = `M${top.join('L')}L${bottom.join('L')}Z`;
  }
  const ticks = niceTicks(min, max, 4);
  const xIdx = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  return html`<${ChartFrame} summary=${summary} table=${table} testId=${testId}>
    <div ref=${box} class="chart-box"><svg class="chart-svg" width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} role="img" aria-labelledby=${id}>
      <title id=${id}>${summary}</title>
      ${ticks.map(
        (v) => html`<g>
          <line x1=${pad.l} x2=${W - pad.r} y1=${y(v)} y2=${y(v)} class=${v === 0 ? 'grid-zero' : 'grid'} />
          <text x=${pad.l - 6} y=${y(v) + 4} class="axis" text-anchor="end">${yFormat(v)}</text>
        </g>`,
      )}
      ${dd ? html`<path d=${dd} class="dd" />` : html`<path d=${area} class="area" />`}
      <path d=${line} class="line" vector-effect="non-scaling-stroke" />
      ${xIdx.map(
        (i, k) => html`<text x=${x(i)} y=${H - 6} class="axis" text-anchor=${k === 0 ? 'start' : k === xIdx.length - 1 ? 'end' : 'middle'}>${labels[i] || ''}</text>`,
      )}
    </svg></div>
  </${ChartFrame}>`;
}

/**
 * Horizontal bars (labels on the left, room for long sheet labels on phones). Negative values go left of zero.
 * @param {{ bars: Array<{ label: string, value: number | null, sub?: string, tone?: 'won' | 'lost' | 'accent' }>, summary: string,
 *   yFormat?: (v: number) => string, table?: { columns: any[], rows: any[] }, testId?: string }} props
 */
export function BarChart({ bars, summary, yFormat = (v) => String(v), table, testId }) {
  const vals = bars.map((b) => b.value ?? 0);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const span = max - min || 1;
  const zero = ((0 - min) / span) * 100;
  return html`<${ChartFrame} summary=${summary} table=${table} testId=${testId}>
    <div class="bars" role="img" aria-label=${summary}>
      ${bars.map((b) => {
        const v = b.value ?? 0;
        const w = (Math.abs(v) / span) * 100;
        const left = v >= 0 ? zero : zero - w;
        const tone = b.tone || (v > 0 ? 'won' : v < 0 ? 'lost' : 'accent');
        return html`<div class="bar-row">
          <div class="bar-label"><span class="bar-name">${b.label}</span>${b.sub ? html`<span class="bar-sub">${b.sub}</span>` : null}</div>
          <div class="bar-track">
            <i class="bar-zero" style=${{ left: `${zero}%` }}></i>
            <i class=${`bar-fill bar-${tone}`} style=${{ left: `${left}%`, width: `${Math.max(w, 0.5)}%` }}></i>
          </div>
          <div class="bar-value num">${b.value == null ? '–' : yFormat(b.value)}</div>
        </div>`;
      })}
    </div>
  </${ChartFrame}>`;
}

/**
 * Predicted probability (x) against hit rate (y), one dot per bucket sized by n, with the diagonal.
 * @param {{ buckets: Array<{ meanProb: number | null, hitRate: number | null, n: number, lo: number, hi: number }>, summary: string,
 *   table?: { columns: any[], rows: any[] }, testId?: string }} props
 */
export function CalibrationChart({ buckets, summary, table, testId }) {
  const S = 280;
  const pad = 32;
  const id = useId();
  const p = scale([0, 1], [pad, S - 8]);
  const q = scale([0, 1], [S - pad, 8]);
  const maxN = Math.max(1, ...buckets.map((b) => b.n));
  return html`<${ChartFrame} summary=${summary} table=${table} testId=${testId}>
    <svg class="chart-svg chart-square" viewBox=${`0 0 ${S} ${S}`} role="img" aria-labelledby=${id}>
      <title id=${id}>${summary}</title>
      ${[0, 0.25, 0.5, 0.75, 1].map(
        (v) => html`<g>
          <line x1=${p(0)} x2=${p(1)} y1=${q(v)} y2=${q(v)} class="grid" />
          <text x=${pad - 4} y=${q(v) + 4} class="axis" text-anchor="end">${Math.round(v * 100)}</text>
          <text x=${p(v)} y=${S - pad + 14} class="axis" text-anchor="middle">${Math.round(v * 100)}</text>
        </g>`,
      )}
      <line x1=${p(0)} y1=${q(0)} x2=${p(1)} y2=${q(1)} class="diag" />
      ${buckets
        .filter((b) => b.n && b.meanProb != null && b.hitRate != null)
        .map((b) => html`<circle cx=${p(b.meanProb)} cy=${q(b.hitRate)} r=${4 + 8 * Math.sqrt(b.n / maxN)} class="dot" />`)}
    </svg>
  </${ChartFrame}>`;
}

/**
 * Tiny trend line for cards; decorative unless `summary` is given (then it is an img with that name).
 * @param {{ values: number[], summary?: string, width?: number, height?: number }} props
 */
export function Sparkline({ values, summary, width = 96, height = 28 }) {
  if (values.length < 2) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const x = scale([0, values.length - 1], [1, width - 1]);
  const y = scale([min, max === min ? min + 1 : max], [height - 2, 2]);
  const d = `M${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('L')}`;
  const last = values[values.length - 1];
  return html`<svg
    class=${`spark ${last > 0 ? 'spark-up' : last < 0 ? 'spark-down' : ''}`}
    width=${width}
    height=${height}
    viewBox=${`0 0 ${width} ${height}`}
    role=${summary ? 'img' : undefined}
    aria-label=${summary}
    aria-hidden=${summary ? undefined : 'true'}
  >
    <line x1="0" x2=${width} y1=${y(0)} y2=${y(0)} class="spark-zero" />
    <path d=${d} />
  </svg>`;
}
