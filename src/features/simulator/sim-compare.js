// Scenario B (its own filters and staking, kept in the URL as `b`) compared with A on one date axis,
// and the saved scenarios (the saved-filter storage of Settings: a preset keeps the whole query).
import { html, useMemo, useState } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { toast } from '../../lib/toast.js';
import {
  Disclosure, Button, IconButton, BottomSheet, DataTable, TextField, Icon, FilterPanel, ActiveFilters, FilterButton,
} from '../../lib/ui/index.js';
import { MultiLineChart } from '../../lib/charts/index.js';
import { formatUnits, formatPct, formatPrice, formatDate } from '../../lib/format.js';
import { applyFilters, countActive, activeEntries, defaultFilters } from '../../data/filters.js';
import { useSettings, savePreset, deletePreset } from '../../data/settings.js';
import { simulate, alignDaily, compareTotals, scenarioQueryString, scenariosFromQuery, parseQueryString, hasStaking } from '../../data/simulate.js';
import { entryLabel } from '../../lib/ui/index.js';
import { StakingControls, stakingLabel } from './staking-controls.js';

/** @typedef {import('../../data/simulate.js').Scenario} Scenario */
/** @typedef {import('../../data/simulate.js').Staking} Staking */
/** @typedef {import('../../data/simulate.js').SimResult} SimResult */

const pos = (/** @type {number | null} */ v) => (v == null || Math.abs(v) < 0.005 ? '' : v > 0 ? 'pos' : 'neg');

/** A scenario in a few words: its active filters and its plan. @param {Scenario} sc */
export function scenarioText(sc) {
  const f = activeEntries(sc.filters).map((e) => entryLabel(e, sc.filters)).join(', ');
  return `${f || t('simulator.compare.allPicks')} · ${stakingLabel(sc.staking)}`;
}

/**
 * @param {{ data: import('../../data/types').Dataset, today: string, a: Scenario, b: Scenario | null, simA: SimResult,
 *   onChange: (a: Scenario, b: Scenario | null) => void }} props
 */
export function CompareBlock({ data, today, a, b, simA, onChange }) {
  const [sheet, setSheet] = useState(false);
  const bKey = b ? JSON.stringify(b) : '';
  const listB = useMemo(() => (b ? applyFilters(data.picks, b.filters, { today }) : []), [data, bKey, today]);
  const simB = useMemo(() => (b ? simulate(listB, b.staking) : null), [listB, bKey]);
  const setB = (/** @type {Scenario | null} */ nb) => onChange(a, nb);

  const summary = html`<span class="sim-sum"><span>${t('simulator.compare.title')}</span><span class="sim-sum-fig num">${
    simB ? t('simulator.compare.summary', { a: formatUnits(simA.totals.profit), b: formatUnits(simB.totals.profit) }) : t('simulator.compare.summaryNone')
  }</span></span>`;

  if (!b || !simB) {
    return html`<div class="sim-block" data-testid="sim-compare"><${Disclosure} summary=${summary}>
      <p class="small">${t('simulator.compare.intro')}</p>
      <div class="sim-actions">
        <${Button} onClick=${() => setB({ filters: a.filters, staking: { ...a.staking, mode: 'kelly' } })} data-testid="b-kelly">${t('simulator.compare.withKelly')}</${Button}>
        <${Button} onClick=${() => setB({ filters: { ...a.filters, pricePreset: 'le200', price: defaultFilters().price }, staking: a.staking })} data-testid="b-le200">${t('simulator.compare.withLe200')}</${Button}>
        <${Button} onClick=${() => setB({ filters: a.filters, staking: a.staking })} data-testid="b-copy">${t('simulator.compare.copy')}</${Button}>
      </div>
    </${Disclosure}></div>`;
  }

  const ta = simA.totals;
  const tb = simB.totals;
  const d = compareTotals(ta, tb);
  const aligned = alignDaily(simA, simB);
  /** @type {Array<{ key: string, label: string, a: string, b: string, d: string, dv: number | null }>} */
  const rows = [
    { key: 'profit', label: t('simulator.profitCol'), a: formatUnits(ta.profit), b: formatUnits(tb.profit), d: formatUnits(d.profit), dv: d.profit },
    { key: 'yield', label: t('stats.yield'), a: formatPct(ta.yield), b: formatPct(tb.yield), d: formatPct(d.yield), dv: d.yield },
    { key: 'n', label: t('simulator.picks'), a: String(ta.n), b: String(tb.n), d: d.n > 0 ? `+${d.n}` : String(d.n), dv: null },
    { key: 'staked', label: t('simulator.stakedCol'), a: formatUnits(ta.staked, { sign: false }), b: formatUnits(tb.staked, { sign: false }), d: formatUnits(d.staked), dv: null },
    { key: 'dd', label: t('simulator.risk.maxDd'), a: formatUnits(-ta.maxDrawdownU), b: formatUnits(-tb.maxDrawdownU), d: formatUnits(-d.maxDrawdownU), dv: -d.maxDrawdownU },
    { key: 'loss', label: t('simulator.risk.lossStreak'), a: String(ta.longestLoss), b: String(tb.longestLoss), d: d.longestLoss > 0 ? `+${d.longestLoss}` : String(d.longestLoss), dv: null },
    { key: 'price', label: t('simulator.avgPrice'), a: formatPrice(ta.avgPrice, { average: true }), b: formatPrice(tb.avgPrice, { average: true }), d: d.avgPrice == null ? '–' : `${d.avgPrice >= 0 ? '+' : '−'}${Math.abs(d.avgPrice).toFixed(2)}`, dv: null },
  ];
  const bActive = countActive(b.filters);
  return html`<div class="sim-block" data-testid="sim-compare"><${Disclosure} summary=${summary} open>
    <div class="sim-ab">
      <p class="sim-ab-line small"><span class="sim-ab-key">A</span><span>${scenarioText(a)}</span></p>
      <p class="sim-ab-line small"><span class="sim-ab-key sim-ab-b">B</span><span data-testid="sim-b-text">${scenarioText(b)}</span></p>
    </div>
    <div class="sim-b-setup">
      <div class="sim-picks-head">
        <h3 class="sim-h">${t('simulator.compare.bPicks', { count: listB.length, n: listB.length })}</h3>
        <${FilterButton} count=${bActive} onClick=${() => setSheet(true)} expanded=${sheet} />
      </div>
      <${ActiveFilters} filters=${b.filters} onChange=${(/** @type {any} */ f) => setB({ ...b, filters: f })} testId="b-active-filters" />
      <${StakingControls} staking=${b.staking} onChange=${(/** @type {Staking} */ s) => setB({ ...b, staking: s })} idPrefix="simb" compact />
    </div>
    <dl class="sim-ab-figs">
      <div><dt>A</dt><dd class=${`num ${pos(ta.profit)}`} data-testid="sim-a-profit">${formatUnits(ta.profit)}</dd></div>
      <div><dt>B</dt><dd class=${`num ${pos(tb.profit)}`} data-testid="sim-b-profit">${formatUnits(tb.profit)}</dd></div>
    </dl>
    <${MultiLineChart}
      series=${[
        { values: aligned.a, label: t('simulator.compare.lineA'), tone: 'accent' },
        { values: aligned.b, label: t('simulator.compare.lineB'), tone: 'c2', style: 'dashed' },
      ]}
      labels=${aligned.dates.map((x) => formatDate(x, 'short'))}
      yFormat=${(/** @type {number} */ v) => formatUnits(v, { suffix: '' })}
      summary=${t('simulator.compare.chartSummary', { a: formatUnits(ta.profit), b: formatUnits(tb.profit), days: aligned.dates.length })}
      table=${{
        columns: [
          { key: 'date', label: t('simulator.day'), render: (/** @type {any} */ r) => formatDate(r.date, 'medium') },
          { key: 'a', label: 'A', num: true, render: (/** @type {any} */ r) => formatUnits(r.a) },
          { key: 'b', label: 'B', num: true, render: (/** @type {any} */ r) => formatUnits(r.b) },
        ],
        rows: aligned.dates.map((date, i) => ({ key: date, date, a: aligned.a[i], b: aligned.b[i] })).reverse(),
      }}
      testId="sim-compare-chart"
    />
    <${DataTable}
      caption=${t('simulator.compare.tableCaption')}
      testId="sim-compare-table"
      columns=${[
        { key: 'label', label: '' },
        { key: 'a', label: 'A', num: true },
        { key: 'b', label: 'B', num: true },
        { key: 'd', label: t('simulator.compare.diff'), num: true, render: (/** @type {any} */ r) => html`<span class=${pos(r.dv)}>${r.d}</span>` },
      ]}
      rows=${rows}
    />
    <div class="sim-actions">
      <${Button} onClick=${() => onChange(b, a)} data-testid="b-swap">${t('simulator.compare.swap')}</${Button}>
      <${Button} variant="ghost" icon="close" onClick=${() => setB(null)} data-testid="b-remove">${t('simulator.compare.remove')}</${Button}>
    </div>
    <${BottomSheet} open=${sheet} title=${t('simulator.compare.bFilters')} onClose=${() => setSheet(false)} testId="b-filter-sheet" size="lg"
      footer=${html`<${Button} variant="primary" onClick=${() => setSheet(false)} data-testid="b-filter-show">${t('filters.showN', { count: listB.length, n: listB.length })}</${Button}>`}>
      <${FilterPanel} picks=${data.picks} filters=${b.filters} onChange=${(/** @type {any} */ f) => setB({ ...b, filters: f })} hide=${['q']} today=${today} />
    </${BottomSheet}>
  </${Disclosure}></div>`;
}

/**
 * @param {{ a: Scenario, b: Scenario | null, defaults: Staking, onChange: (a: Scenario, b: Scenario | null) => void }} props
 */
export function ScenariosBlock({ a, b, defaults, onChange }) {
  const s = useSettings();
  const [name, setName] = useState('');
  const current = scenarioQueryString(a, defaults, { explicit: true });
  const load = (/** @type {string} */ qs) => scenariosFromQuery(parseQueryString(qs), defaults).a;
  const save = () => {
    const n = name.trim();
    if (!n) return;
    savePreset(n, current);
    setName('');
    toast(t('simulator.scenarios.savedToast', { name: n }), { tone: 'success' });
  };
  const summary = html`<span class="sim-sum"><span>${t('simulator.scenarios.title')}</span><span class="sim-sum-fig num">${t('simulator.scenarios.summary', { count: s.presets.length, n: s.presets.length })}</span></span>`;
  return html`<div class="sim-block" data-testid="sim-scenarios"><${Disclosure} summary=${summary}>
    <p class="muted xs">${t('simulator.scenarios.hint')}</p>
    ${s.presets.length
      ? html`<ul class="sim-saved">
          ${s.presets.map(
            (p) => html`<li class=${`sim-saved-item${p.query === current ? ' sim-saved-current' : ''}`}>
              <button type="button" class="sim-saved-apply" onClick=${() => onChange(load(p.query), b)} aria-label=${t('simulator.scenarios.apply', { name: p.name })}>
                <${Icon} name=${p.query === current ? 'check' : hasStaking(p.query) ? 'simulator' : 'filter'} size=${16} />
                <span class="sim-saved-name">${p.name}</span>
                <span class="sim-saved-kind xs muted">${hasStaking(p.query) ? stakingLabel(load(p.query).staking) : t('simulator.scenarios.filterOnly')}</span>
              </button>
              <button type="button" class="link-btn sim-saved-b" onClick=${() => onChange(a, load(p.query))} aria-label=${t('simulator.scenarios.asB', { name: p.name })}>${t('simulator.scenarios.asBShort')}</button>
              <${IconButton} icon="trash" label=${t('filters.deleteSaved', { name: p.name })} onClick=${() => {
                deletePreset(p.id);
                toast(t('filters.deleted_toast', { name: p.name }));
              }} />
            </li>`,
          )}
        </ul>`
      : html`<p class="muted small">${t('simulator.scenarios.empty')}</p>`}
    <form class="sim-save" onSubmit=${(/** @type {Event} */ e) => { e.preventDefault(); save(); }}>
      <${TextField} label=${t('simulator.scenarios.name')} value=${name} onValue=${setName} maxLength=${40} />
      <${Button} type="submit" icon="save" disabled=${!name.trim()} data-testid="sim-save">${t('simulator.scenarios.save')}</${Button}>
    </form>
  </${Disclosure}></div>`;
}
