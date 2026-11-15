// Breakdown part: one dimension (and optionally a second) under the shared filters. Per group: n,
// record, hit rate against break-even, flat yield, units, mean fair-close EV ± 2 SE with n, and the
// verdict word. The chart shows the chosen measure with its interval; groups under the minimum n are
// greyed or hidden; each group links to the Explorer with its slice added to the current filters.
import { html, useMemo, useState } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Card, Select, SegmentedControl, IconButton, Icon, Disclosure, Button, useMediaQuery } from '../../lib/ui/index.js';
import { RangeChart } from '../../lib/charts/index.js';
import { formatPct, formatRecord, formatUnits } from '../../lib/format.js';
import { DIMENSION_IDS, breakdown, sortRows, sortDefaultDir, withSlice, twoWay, SORTS } from '../../data/analysis.js';
import { VerdictChip, explorerHref, evText, rangeText, hitText, signClass, MinNSlider } from './parts.js';
import { groupLabel, dimLabel } from './labels.js';
import { breakdownText, measureOf, measureN } from './text.js';
import { MIN_N_MAX } from './view.js';

/** @typedef {import('../../data/types').Pick} Pick */
/** @typedef {import('../../data/analysis.js').BreakdownRow} BreakdownRow */
/** @typedef {import('./view.js').View} View */

/** Groups in the chart at most (the list shows them all, in pages). */
const CHART_MAX = 12;
/** Rows shown before "show all". */
const LIST_STEP = 20;

/**
 * @param {{ picks: Pick[], filters: import('../../data/filters.js').FilterState, view: View, setView: (patch: Partial<View>) => void }} props
 */
export function Breakdown({ picks, filters, view, setView }) {
  const wide = useMediaQuery('(min-width: 720px)');
  const [showAll, setShowAll] = useState(false);
  const labelOf = (/** @type {string} */ k) => groupLabel(view.dim, k);
  const base = useMemo(() => breakdown(picks, view.dim), [picks, view.dim]);
  const sorted = useMemo(() => sortRows(base.rows, view.sort, view.dir, view.dim, labelOf), [base, view.sort, view.dir, view.dim]);
  const visible = view.small === 'hide' ? sorted.filter((r) => r.summary.n >= view.minn) : sorted;
  const hidden = sorted.length - visible.length;
  const shown = showAll ? visible : visible.slice(0, LIST_STEP);
  const measure = view.measure;
  const small = (/** @type {BreakdownRow} */ r) => r.summary.n < view.minn;
  const dimName = dimLabel(view.dim);

  const chartRows = visible.slice(0, CHART_MAX).map((r) => {
    const e = r.summary.fairCloseEv;
    const isEv = measure === 'ev';
    return {
      key: r.key,
      label: labelOf(r.key),
      sub: `n ${measureN(r, measure)}${small(r) ? ` · ${t('analysis.smallTag')}` : ''}`,
      value: measureOf(r, measure),
      lo: isEv ? e.lo : r.yieldLo,
      hi: isEv ? e.hi : r.yieldHi,
      muted: small(r),
    };
  });
  const measureName = t(`analysis.measure.${measure}`);
  const chartSummary = t('analysis.bd.chartSummary', { measure: measureName, dim: dimName, count: chartRows.length, k: chartRows.length });
  const chartTable = {
    columns: [
      { key: 'label', label: dimName },
      { key: 'n', label: 'n', num: true },
      { key: 'value', label: measureName, num: true },
      { key: 'range', label: t('analysis.rangeCol'), num: true },
    ],
    rows: chartRows.map((r) => ({
      key: r.key,
      label: r.label,
      n: r.sub,
      value: formatPct(r.value),
      range: r.lo != null && r.hi != null ? t('analysis.range', { lo: formatPct(r.lo), hi: formatPct(r.hi) }) : '–',
    })),
  };

  const linkOf = (/** @type {string} */ k) => {
    const f = withSlice(filters, view.dim, k);
    return f ? explorerHref(f) : null;
  };
  const setSort = (/** @type {string} */ sort) => setView({ sort, dir: /** @type {any} */ (sort === view.sort ? (view.dir === 'asc' ? 'desc' : 'asc') : sortDefaultDir(sort)) });

  return html`<div class="stack an-part" data-testid="analysis-breakdown">
    <${Card} title=${t('analysis.bd.title')} subtitle=${t('analysis.bd.sub')} class="an-controls">
      <div class="an-ctl-grid">
        <${Select}
          label=${t('analysis.bd.dimension')}
          value=${view.dim}
          options=${DIMENSION_IDS.map((d) => ({ value: d, label: dimLabel(d) }))}
          onValue=${(/** @type {string} */ dim) => setView({ dim, dim2: view.dim2 === dim ? '' : view.dim2 })}
        />
        <${SegmentedControl}
          label=${t('analysis.bd.measure')}
          value=${measure}
          options=${[{ value: 'ev', label: t('analysis.measure.ev') }, { value: 'yield', label: t('analysis.measure.yield') }]}
          onValue=${(/** @type {string} */ m) => setView({ measure: m })}
        />
        <${MinNSlider} value=${view.minn} max=${MIN_N_MAX} onValue=${(/** @type {number} */ minn) => setView({ minn })} testId="minn-slider" />
        <label class="an-check">
          <input type="checkbox" checked=${view.small === 'hide'} onChange=${(/** @type {any} */ e) => setView({ small: e.currentTarget.checked ? 'hide' : 'grey' })}
            data-testid="hide-small" />
          <span>${t('analysis.bd.hideSmall', { n: view.minn })}</span>
        </label>
      </div>
    </${Card}>

    <${Card} title=${t('analysis.bd.chartTitle', { measure: measureName, dim: dimName })} testId="analysis-chart-card">
      ${chartRows.length
        ? html`<${RangeChart} testId="analysis-bars" rows=${chartRows} format=${formatPct} summary=${chartSummary} table=${chartTable}
            axisLabel=${measure === 'ev' ? t('analysis.bd.axisEv') : t('analysis.bd.axisYield')} />`
        : html`<p class="an-muted" data-testid="analysis-bars">${t('analysis.text.bdEmpty')}</p>`}
      <p class="an-text" data-testid="breakdown-text">${breakdownText({ dim: dimName, rows: sorted, minN: view.minn, measure, labelOf })}</p>
      ${visible.length > CHART_MAX ? html`<p class="an-note">${t('analysis.bd.chartTop', { n: CHART_MAX, total: visible.length })}</p>` : null}
    </${Card}>

    <${Card}
      title=${t('analysis.bd.groupsTitle', { dim: dimName })}
      subtitle=${t('analysis.bd.groupsSub')}
    >
      ${wide ? null : html`<div class="an-sort">
        <${Select} label=${t('analysis.bd.sortBy')} hideLabel value=${view.sort}
          options=${SORTS.map((s) => ({ value: s, label: t(`analysis.sort.${s}`) }))} onValue=${(/** @type {string} */ s) => setView({ sort: s, dir: /** @type {any} */ (sortDefaultDir(s)) })} />
        <${IconButton} icon=${view.dir === 'asc' ? 'arrow-up' : 'arrow-down'} label=${view.dir === 'asc' ? t('analysis.dirAsc') : t('analysis.dirDesc')}
          onClick=${() => setView({ dir: view.dir === 'asc' ? 'desc' : 'asc' })} data-testid="bd-dir" />
      </div>`}
      ${!shown.length
        ? html`<p class="an-muted">${hidden ? t('analysis.bd.allHidden', { count: hidden, k: hidden, n: view.minn }) : t('analysis.text.bdEmpty')}</p>`
        : wide
          ? html`<${GroupTable} rows=${shown} labelOf=${labelOf} linkOf=${linkOf} small=${small} view=${view} onSort=${setSort} dimName=${dimName} />`
          : html`<${GroupList} rows=${shown} labelOf=${labelOf} linkOf=${linkOf} small=${small} />`}
      ${visible.length > shown.length
        ? html`<${Button} variant="secondary" onClick=${() => setShowAll(true)} data-testid="bd-show-all">${t('analysis.bd.showAll', { count: visible.length, n: visible.length })}</${Button}>`
        : null}
      <div class="an-notes">
        ${hidden ? html`<p class="an-note" data-testid="bd-hidden">${t('analysis.bd.hiddenNote', { count: hidden, k: hidden, n: view.minn })}</p>` : null}
        ${base.left ? html`<p class="an-note">${t('analysis.bd.leftNote', { count: base.left, k: base.left, dim: dimName })}</p>` : null}
        ${view.dim === 'book' || view.dim === 'reason' ? html`<p class="an-note">${t('analysis.bd.multiNote')}</p>` : null}
        ${view.dim === 'weekday' ? html`<p class="an-note">${t('analysis.bd.noLinkNote')}</p>` : null}
      </div>
    </${Card}>

    <${TwoWay} picks=${picks} filters=${filters} view=${view} setView=${setView} labelOf=${labelOf} />
  </div>`;
}

/**
 * Phones: one compact row per group that opens to the full figures.
 * @param {{ rows: BreakdownRow[], labelOf: (k: string) => string, linkOf: (k: string) => string | null, small: (r: BreakdownRow) => boolean }} props
 */
function GroupList({ rows, labelOf, linkOf, small }) {
  return html`<ul class="an-glist" data-testid="bd-rows">
    ${rows.map((r) => {
      const s = r.summary;
      const e = s.fairCloseEv;
      const link = linkOf(r.key);
      return html`<li key=${r.key} class=${small(r) ? 'an-small' : ''} data-key=${r.key}>
        <details class="an-grow">
          <summary>
            <span class="an-gname">${labelOf(r.key)}</span>
            <span class="an-gverdict"><${VerdictChip} v=${r.verdict} /></span>
            <span class="an-gmeta num">
              <span>n ${s.n}</span><span>${formatRecord(s)}</span>
              <span class=${signClass(s.yield)}>${t('analysis.yieldShort', { v: formatPct(s.yield) })}</span>
              <span>${t('analysis.evShort', { v: evText(e) })}</span>
            </span>
            <${Icon} name="chevron-down" size=${16} />
          </summary>
          <div class="an-gbody">
            <dl class="kv">
              <dt>${t('analysis.col.record')}</dt><dd class="num">${formatRecord(s)}${s.pending ? ` · ${t('analysis.pendingN', { n: s.pending })}` : ''}</dd>
              <dt>${t('analysis.col.hit')}</dt><dd class="num">${hitText(s)}</dd>
              <dt>${t('analysis.col.yield')}</dt><dd class="num">${formatPct(s.yield)}${r.yieldLo != null ? ` (${t('analysis.range', { lo: formatPct(r.yieldLo), hi: formatPct(r.yieldHi) })})` : ''}</dd>
              <dt>${t('analysis.col.units')}</dt><dd class=${`num ${signClass(s.profit)}`}>${formatUnits(s.profit)}</dd>
              <dt>${t('analysis.col.ev')}</dt><dd class="num">${evText(e)}${rangeText(e) ? html`<br />${rangeText(e)}` : ''}</dd>
            </dl>
            ${small(r) ? html`<p class="an-note">${t('analysis.smallRow')}</p>` : null}
            ${link ? html`<a class="link-btn an-link" href=${link} data-testid="bd-link">${t('analysis.seeInExplorer')}</a>` : null}
          </div>
        </details>
      </li>`;
    })}
  </ul>`;
}

/**
 * Wide screens: a sortable table (the sort lives in the URL).
 * @param {{ rows: BreakdownRow[], labelOf: (k: string) => string, linkOf: (k: string) => string | null, small: (r: BreakdownRow) => boolean,
 *   view: View, onSort: (s: string) => void, dimName: string }} props
 */
function GroupTable({ rows, labelOf, linkOf, small, view, onSort, dimName }) {
  const cols = [
    { key: 'label', label: t('analysis.col.labelVerdict', { dim: dimName }), sort: 'label' },
    { key: 'n', label: t('analysis.col.nRecord'), sort: 'n', num: true },
    { key: 'hit', label: t('analysis.col.hit'), sort: 'edge', num: true },
    { key: 'yield', label: t('analysis.col.yield'), sort: 'yield', num: true },
    { key: 'units', label: t('analysis.col.units'), sort: 'units', num: true },
    { key: 'ev', label: t('analysis.col.ev'), sort: 'ev', num: true },
  ];
  return html`<div class="table-wrap an-table" data-testid="bd-rows">
    <table class="table">
      <caption class="sr-only">${t('analysis.bd.groupsTitle', { dim: dimName })}</caption>
      <thead><tr>
        ${cols.map((c) => {
          const active = c.sort && view.sort === c.sort;
          return html`<th scope="col" class=${c.num ? 'ta-r' : ''} aria-sort=${active ? (view.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            ${c.sort
              ? html`<button type="button" class="th-sort" onClick=${() => onSort(c.sort)} data-testid=${`bd-sort-${c.sort}`}>${c.label}<${Icon} name="sort" size=${12} /></button>`
              : c.label}
          </th>`;
        })}
      </tr></thead>
      <tbody>
        ${rows.map((r) => {
          const s = r.summary;
          const e = s.fairCloseEv;
          const link = linkOf(r.key);
          return html`<tr key=${r.key} class=${small(r) ? 'an-small' : ''} data-key=${r.key}>
            <td class="an-td-label">${link ? html`<a href=${link} data-testid="bd-link">${labelOf(r.key)}</a>` : labelOf(r.key)}<span class="an-sub"><${VerdictChip} v=${r.verdict} /></span>${small(r) ? html`<span class="sr-only"> (${t('analysis.smallTag')})</span>` : null}</td>
            <td class="ta-r num">${s.n}<span class="an-sub">${formatRecord(s)}</span></td>
            <td class="ta-r num">${hitText(s)}</td>
            <td class=${`ta-r num ${signClass(s.yield)}`}>${formatPct(s.yield)}</td>
            <td class=${`ta-r num ${signClass(s.profit)}`}>${formatUnits(s.profit)}</td>
            <td class="ta-r num">${e.n ? html`${formatPct(e.mean)} <span class="an-dim">n ${e.n}</span>${rangeText(e) ? html`<span class="an-sub">${rangeText(e)}</span>` : null}` : t('analysis.noClose')}</td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

/**
 * Optional second dimension: the largest groups of both, crossed. Cells show the chosen measure and n,
 * greyed under the minimum n, and link to the Explorer with both slices.
 * @param {{ picks: Pick[], filters: import('../../data/filters.js').FilterState, view: View, setView: (p: Partial<View>) => void, labelOf: (k: string) => string }} props
 */
function TwoWay({ picks, filters, view, setView, labelOf }) {
  const table = useMemo(() => (view.dim2 ? twoWay(picks, view.dim, view.dim2) : null), [picks, view.dim, view.dim2]);
  const label2 = (/** @type {string} */ k) => groupLabel(view.dim2, k);
  const options = [{ value: '', label: t('analysis.tw.none') }, ...DIMENSION_IDS.filter((d) => d !== view.dim).map((d) => ({ value: d, label: dimLabel(d) }))];
  return html`<${Disclosure} summary=${t('analysis.tw.title')} open=${!!view.dim2}>
    <p class="an-note">${t('analysis.tw.sub', { dim: dimLabel(view.dim) })}</p>
    <${Select} label=${t('analysis.tw.second')} value=${view.dim2} options=${options} onValue=${(/** @type {string} */ dim2) => setView({ dim2 })} />
    ${table
      ? table.rows.length && table.cols.length
        ? html`<div class="table-wrap an-table an-tw" data-testid="two-way">
            <table class="table">
              <caption class="sr-only">${t('analysis.tw.caption', { a: dimLabel(view.dim), b: dimLabel(view.dim2), measure: t(`analysis.measure.${view.measure}`) })}</caption>
              <thead><tr>
                <th scope="col">${dimLabel(view.dim)}</th>
                ${table.cols.map((c) => html`<th scope="col" class="ta-r">${label2(c)}</th>`)}
              </tr></thead>
              <tbody>
                ${table.rows.map(
                  (r) => html`<tr>
                    <th scope="row" class="an-td-label">${labelOf(r)}</th>
                    ${table.cols.map((c) => {
                      const cell = table.cells[r][c];
                      if (!cell) return html`<td class="ta-r num an-dim">–</td>`;
                      const v = measureOf(cell, view.measure);
                      const f1 = withSlice(filters, view.dim, r);
                      const f2 = f1 ? withSlice(f1, view.dim2, c) : null;
                      const body = html`<span class=${signClass(v)}>${formatPct(v)}</span><span class="an-dim"> n ${measureN(cell, view.measure)}</span>`;
                      return html`<td class=${`ta-r num${cell.summary.n < view.minn ? ' an-small' : ''}`}>${f2 ? html`<a href=${explorerHref(f2)}>${body}</a>` : body}</td>`;
                    })}
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>
          <p class="an-note">${t('analysis.tw.note', { measure: t(`analysis.measure.${view.measure}`), n: view.minn })}</p>`
        : html`<p class="an-muted">${t('analysis.text.bdEmpty')}</p>`
      : null}
  </${Disclosure}>`;
}
