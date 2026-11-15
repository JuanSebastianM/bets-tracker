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
 *   table?: { columns: any[], rows: any[] }, testId?: string, showN?: boolean }} props
 *   showN: write "n 12" beside each dot (added by Analysis; off by default)
 */
export function CalibrationChart({ buckets, summary, table, testId, showN = false }) {
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
      ${showN ? nLabels(buckets, p, q, maxN, S) : null}
    </svg>
  </${ChartFrame}>`;
}

/**
 * "n 12" labels beside calibration dots, skipping a label that would overlap a dot or a label already
 * placed (the table toggle always has every n).
 * @param {Array<{ meanProb: number | null, hitRate: number | null, n: number }>} buckets
 * @param {(v: number) => number} p @param {(v: number) => number} q @param {number} maxN @param {number} S
 */
function nLabels(buckets, p, q, maxN, S) {
  const dots = buckets
    .filter((b) => b.n && b.meanProb != null && b.hitRate != null)
    .map((b) => ({ b, x: p(/** @type {number} */ (b.meanProb)), y: q(/** @type {number} */ (b.hitRate)), r: 4 + 8 * Math.sqrt(b.n / maxN) }));
  /** @type {Array<{ x0: number, x1: number, y0: number, y1: number }>} */
  const boxes = dots.map((d) => ({ x0: d.x - d.r, x1: d.x + d.r, y0: d.y - d.r, y1: d.y + d.r }));
  const out = [];
  for (const d of [...dots].sort((a, b) => b.b.n - a.b.n)) {
    const text = `n ${d.b.n}`;
    const w = text.length * 6.2;
    const right = d.x + d.r + 3 + w < S - 2;
    const x0 = right ? d.x + d.r + 3 : d.x - d.r - 3 - w;
    const box = { x0, x1: x0 + w, y0: d.y - 7, y1: d.y + 6 };
    const hits = boxes.some((o) => o !== boxes[dots.indexOf(d)] && box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0);
    if (hits) continue;
    boxes.push(box);
    out.push(html`<text x=${right ? x0 : x0 + w} y=${d.y + 4} class="axis dot-n" text-anchor=${right ? 'start' : 'end'}>${text}</text>`);
  }
  return out;
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

/**
 * Means with their ±2 SE range on one shared horizontal axis, one row per group (labels on the left,
 * the value on the right). The axis holds every mean and, clipped to `clip`, every range; it always
 * includes zero. `muted` rows (small samples) are drawn faint and say so in their `sub`.
 * Added for the Analysis section (breakdowns); usable anywhere a mean comes with an interval.
 * @param {{ rows: Array<{ key?: string, label: string, sub?: string, value: number | null, lo?: number | null, hi?: number | null,
 *   muted?: boolean }>, summary: string, format?: (v: number) => string, clip?: number, table?: { columns: any[], rows: any[] },
 *   testId?: string, axisLabel?: string }} props
 */
export function RangeChart({ rows, summary, format = (v) => String(v), clip = 0.6, table, testId, axisLabel }) {
  let min = 0;
  let max = 0;
  for (const r of rows) {
    for (const v of [r.value, r.lo, r.hi]) {
      if (v == null || !Number.isFinite(v)) continue;
      const c = Math.max(-clip, Math.min(clip, v));
      min = Math.min(min, c);
      max = Math.max(max, c);
    }
  }
  if (max - min < 1e-9) {
    min -= 0.05;
    max += 0.05;
  }
  const pad = (max - min) * 0.04;
  min -= pad;
  max += pad;
  const pos = (/** @type {number} */ v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const zero = pos(0);
  return html`<${ChartFrame} summary=${summary} table=${table} testId=${testId}>
    <div class="ranges" role="img" aria-label=${summary}>
      ${axisLabel ? html`<div class="range-axis" aria-hidden="true"><span>${format(min + pad)}</span><span>${axisLabel}</span><span>${format(max - pad)}</span></div>` : null}
      ${rows.map((r) => {
        const has = r.value != null && Number.isFinite(r.value);
        const band = r.lo != null && r.hi != null && Number.isFinite(r.lo) && Number.isFinite(r.hi);
        const tone = !has ? '' : r.lo != null && r.lo > 0 ? ' range-up' : r.hi != null && r.hi < 0 ? ' range-down' : '';
        return html`<div class=${`range-row${r.muted ? ' range-muted' : ''}${tone}`} key=${r.key || r.label} data-key=${r.key}>
          <div class="bar-label"><span class="bar-name">${r.label}</span>${r.sub ? html`<span class="bar-sub">${r.sub}</span>` : null}</div>
          <div class="range-track" aria-hidden="true">
            <i class="bar-zero" style=${{ left: `${zero}%` }}></i>
            ${band ? html`<i class="range-band" style=${{ left: `${pos(/** @type {number} */ (r.lo))}%`, width: `${Math.max(0.8, pos(/** @type {number} */ (r.hi)) - pos(/** @type {number} */ (r.lo)))}%` }}></i>` : null}
            ${has ? html`<i class="range-dot" style=${{ left: `${pos(/** @type {number} */ (r.value))}%` }}></i>` : null}
          </div>
          <div class="bar-value num">${has ? format(/** @type {number} */ (r.value)) : '–'}</div>
        </div>`;
      })}
    </div>
  </${ChartFrame}>`;
}

/**
 * Vertical histogram of binned counts (from src/data/analysis.js `histogram`). Bins whose upper edge
 * is at or below zero are drawn in the muted tone and the others in the accent, and the zero edge is
 * marked, so the side of zero reads from position and the axis as well as colour.
 * Added for the Analysis section (price against the close).
 * @param {{ bins: Array<{ lo: number, hi: number, n: number, openLo?: boolean, openHi?: boolean }>, summary: string,
 *   format?: (v: number) => string, height?: number, table?: { columns: any[], rows: any[] }, testId?: string }} props
 */
export function Histogram({ bins, summary, format = (v) => String(v), height = 168, table, testId }) {
  const [box, W] = useWidth();
  const id = useId();
  const total = bins.reduce((a, b) => a + b.n, 0);
  if (!total) return html`<${ChartFrame} summary=${summary} table=${table} testId=${testId}><div class="chart-empty">${t('chart.noData')}</div></${ChartFrame}>`;
  const H = height;
  const pad = { l: 28, r: 8, t: 10, b: 22 };
  const n = bins.length;
  const maxN = Math.max(1, ...bins.map((b) => b.n));
  const bw = (W - pad.l - pad.r) / n;
  const y = scale([0, maxN], [H - pad.b, pad.t]);
  const ticks = niceTicks(0, maxN, 3).filter((v) => Number.isInteger(v));
  const zeroIdx = bins.findIndex((b) => b.lo === 0 || (b.lo < 0 && b.hi > 0));
  const zeroX = zeroIdx < 0 ? null : pad.l + zeroIdx * bw + (bins[zeroIdx].lo === 0 ? 0 : bw / 2);
  // Edge labels: the first inner edge, zero and the last inner edge.
  const inner = bins.filter((b) => !b.openLo && !b.openHi);
  const labels = inner.length
    ? [
        { x: pad.l + bw, v: inner[0].lo },
        ...(zeroX != null ? [{ x: zeroX, v: 0 }] : []),
        { x: pad.l + (n - 1) * bw, v: inner[inner.length - 1].hi },
      ]
    : [];
  return html`<${ChartFrame} summary=${summary} table=${table} testId=${testId}>
    <div ref=${box} class="chart-box"><svg class="chart-svg" width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} role="img" aria-labelledby=${id}>
      <title id=${id}>${summary}</title>
      ${ticks.map(
        (v) => html`<g>
          <line x1=${pad.l} x2=${W - pad.r} y1=${y(v)} y2=${y(v)} class=${v === 0 ? 'grid-zero' : 'grid'} />
          <text x=${pad.l - 6} y=${y(v) + 4} class="axis" text-anchor="end">${v}</text>
        </g>`,
      )}
      ${bins.map((b, i) =>
        b.n
          ? html`<rect x=${pad.l + i * bw + 1} y=${y(b.n)} width=${Math.max(1, bw - 2)} height=${Math.max(1, H - pad.b - y(b.n))} rx="2"
              class=${b.hi <= 0 ? 'hist-bar hist-below' : 'hist-bar'} />`
          : null,
      )}
      ${zeroX != null ? html`<line x1=${zeroX} x2=${zeroX} y1=${pad.t - 4} y2=${H - pad.b + 4} class="hist-zero" />` : null}
      ${labels.map(
        (l, k) => html`<text x=${l.x} y=${H - 6} class="axis" text-anchor=${k === 0 ? 'start' : k === labels.length - 1 ? 'end' : 'middle'}>${format(l.v)}</text>`,
      )}
    </svg></div>
  </${ChartFrame}>`;
}

/**
 * Y range of several series together with the zero line (shared by MultiLineChart). null when there is no value.
 * @param {Array<{ values: number[] }>} series
 * @returns {[number, number] | null}
 */
export function seriesExtent(series) {
  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (!all.length) return null;
  let min = Math.min(0, ...all);
  let max = Math.max(0, ...all);
  if (min === max) max = min + 1;
  return [min, max];
}

/**
 * Several cumulative lines on one x axis (same length), with a legend that also differs by line
 * style (solid, dashed, dotted), so colour is never the only signal. The first series can have its
 * drawdown shaded.
 * @param {{ series: Array<{ values: number[], label: string, style?: 'solid' | 'dashed' | 'dotted', tone?: 'accent' | 'c2' | 'c3' | 'muted' }>,
 *   labels?: string[], summary: string, yFormat?: (v: number) => string, height?: number, shadeDrawdown?: boolean,
 *   table?: { columns: any[], rows: any[] }, testId?: string }} props
 */
export function MultiLineChart({ series, labels = [], summary, yFormat = (v) => String(v), height = 200, shadeDrawdown = false, table, testId }) {
  const [box, W] = useWidth();
  const H = height;
  const pad = { l: 52, r: 12, t: 12, b: 24 };
  const id = useId();
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const ext = seriesExtent(series);
  if (!n || !ext) return html`<${ChartFrame} summary=${summary} table=${table} testId=${testId}><div class="chart-empty">${t('chart.noData')}</div></${ChartFrame}>`;
  let [min, max] = ext;
  const padY = (max - min) * 0.08;
  min -= padY;
  max += padY;
  const x = scale([0, Math.max(1, n - 1)], [pad.l, W - pad.r]);
  const y = scale([min, max], [H - pad.b, pad.t]);
  const ptsOf = (/** @type {number[]} */ vs) => vs.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  let dd = '';
  if (shadeDrawdown && series[0] && series[0].values.length) {
    const vs = series[0].values;
    let peak = -Infinity;
    const top = vs.map((v, i) => `${x(i).toFixed(1)},${y((peak = Math.max(peak, v, 0))).toFixed(1)}`);
    dd = `M${top.join('L')}L${ptsOf(vs).reverse().join('L')}Z`;
  }
  const ticks = niceTicks(min, max, 4);
  const xIdx = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  return html`<${ChartFrame} summary=${summary} table=${table} testId=${testId}>
    <ul class="mlc-legend" aria-hidden="true">
      ${series.map((s) => html`<li><svg width="22" height="8"><line x1="1" x2="21" y1="4" y2="4" class=${`mlc-line mlc-${s.tone || 'accent'} mlc-${s.style || 'solid'}`} /></svg>${s.label}</li>`)}
    </ul>
    <div ref=${box} class="chart-box"><svg class="chart-svg" width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} role="img" aria-labelledby=${id}>
      <title id=${id}>${summary}</title>
      ${ticks.map(
        (v) => html`<g>
          <line x1=${pad.l} x2=${W - pad.r} y1=${y(v)} y2=${y(v)} class=${v === 0 ? 'grid-zero' : 'grid'} />
          <text x=${pad.l - 6} y=${y(v) + 4} class="axis" text-anchor="end">${yFormat(v)}</text>
        </g>`,
      )}
      ${dd ? html`<path d=${dd} class="dd" />` : null}
      ${series.map((s) => (s.values.length ? html`<path d=${`M${ptsOf(s.values).join('L')}`} class=${`mlc-line mlc-${s.tone || 'accent'} mlc-${s.style || 'solid'}`} vector-effect="non-scaling-stroke" />` : null))}
      ${xIdx.map(
        (i, k) => html`<text x=${x(i)} y=${H - 6} class="axis" text-anchor=${k === 0 ? 'start' : k === xIdx.length - 1 ? 'end' : 'middle'}>${labels[i] || ''}</text>`,
      )}
    </svg></div>
  </${ChartFrame}>`;
}
