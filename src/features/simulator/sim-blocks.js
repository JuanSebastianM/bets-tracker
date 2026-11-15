// The Simulator's detail blocks, each a collapsed disclosure whose summary already says the key
// figure: risk (drawdown, streaks, days, time under water), what the price says, month by month,
// the breakdown by tag / market / price band, and the pending picks.
import { html, useState } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Disclosure, DataTable, SegmentedControl, TagGlossaryLinks } from '../../lib/ui/index.js';
import { MARKET_SLUGS } from '../../lib/glossary-links.js';
import { rowPatch } from '../../data/analysis.js';
import { formatUnits, formatPct, formatPrice, formatDate, formatMonth, formatRecord, todayIn, signClass } from '../../lib/format.js';
import { explorerHref } from '../../lib/links.js';
import { exactSlice, priceBandPatch } from '../../data/filters.js';
import { compareLineKeys, lineLabel } from '../../data/lines.js';
import { APP_TIMEZONE } from '../../config.js';
import { priceBand } from '../../data/stats.js';
import { tagLabel } from '../../data/tags.js';
import { breakdown, closeVerdictOf } from '../../data/simulate.js';
import { closeSentenceFor } from './sentences.js';

/** @typedef {import('../../data/simulate.js').SimResult} SimResult */
/** @typedef {import('../../data/simulate.js').Staking} Staking */
/** @typedef {import('../../data/filters.js').FilterState} FilterState */

/** Sign class; figures that round to 0.00 get none. @param {number | null} v */
const pos = (v) => signClass(v, 0.0049);

/** @param {{ testId: string, summary: any, children: any }} props */
function Block({ testId, summary, children }) {
  return html`<div class="sim-block" data-testid=${testId}><${Disclosure} summary=${summary}>${children}</${Disclosure}></div>`;
}

/** @param {{ sim: SimResult, staking: Staking }} props */
export function RiskBlock({ sim, staking }) {
  const tt = sim.totals;
  const u = tt.underwater;
  const day = (/** @type {{ date: string, profit: number, n: number } | null} */ d) =>
    d ? t('simulator.risk.dayValue', { profit: formatUnits(d.profit), date: formatDate(d.date, 'medium'), count: d.n, n: d.n }) : '–';
  return html`<${Block} testId="sim-risk" summary=${html`<span class="sim-sum"><span>${t('simulator.risk.title')}</span><span class="sim-sum-fig num">${t('simulator.risk.summary', { dd: formatUnits(-tt.maxDrawdownU), loss: tt.longestLoss })}</span></span>`}>
    <dl class="kv">
      <dt>${t('simulator.risk.maxDd')}</dt>
      <dd data-testid="sim-max-dd">${formatUnits(-tt.maxDrawdownU)} · ${t('simulator.ofBank', { pct: formatPct(tt.maxDrawdownPctStart, { sign: false }) })}</dd>
      <dt>${t('simulator.risk.lossStreak')}</dt>
      <dd>${t('simulator.risk.picksN', { count: tt.longestLoss, n: tt.longestLoss })}</dd>
      <dt>${t('simulator.risk.winStreak')}</dt>
      <dd>${t('simulator.risk.picksN', { count: tt.longestWin, n: tt.longestWin })}</dd>
      <dt>${t('simulator.risk.bestDay')}</dt>
      <dd class="pos">${day(tt.bestDay)}</dd>
      <dt>${t('simulator.risk.worstDay')}</dt>
      <dd class=${tt.worstDay && tt.worstDay.profit < 0 ? 'neg' : ''}>${day(tt.worstDay)}</dd>
      <dt>${t('simulator.risk.underwater')}</dt>
      <dd data-testid="sim-underwater">
        ${u.longestPicks
          ? t(u.ongoing ? 'simulator.risk.underwaterOngoing' : 'simulator.risk.underwaterValue', { days: u.longestDays, count: u.longestDays, picks: u.longestPicks, from: u.from ? formatDate(u.from, 'medium') : '' })
          : t('simulator.risk.neverUnder')}
      </dd>
      <dt>${t('simulator.risk.underShare')}</dt>
      <dd>${t('simulator.risk.underShareValue', { pct: formatPct(u.share, { sign: false }), n: tt.n })}</dd>
      <dt>${t('simulator.risk.avgStake')}</dt>
      <dd>${formatUnits(tt.avgStake, { sign: false })}</dd>
      ${staking.mode === 'percent' || staking.mode === 'kelly'
        ? html`<dt>${t('simulator.finalBank')}</dt><dd>${formatUnits(tt.startBank, { sign: false })} → ${formatUnits(tt.finalBank, { sign: false })}</dd>`
        : null}
    </dl>
    <p class="muted xs">${t('simulator.risk.note')}</p>
  </${Block}>`;
}

/** @param {{ sim: SimResult }} props */
export function PriceBlock({ sim }) {
  const tt = sim.totals;
  const c = tt.closeCheck;
  const kind = closeVerdictOf(c);
  return html`<${Block} testId="sim-price" summary=${html`<span class="sim-sum"><span>${t('simulator.price.title')}</span><span class="sim-sum-fig num">${c.n ? t('simulator.price.summary', { expected: formatUnits(c.expected), n: c.n }) : t('simulator.price.summaryNone')}</span></span>`}>
    <p class="small">${t('simulator.price.intro')}</p>
    ${c.n
      ? html`<dl class="kv">
          <dt>${t('simulator.price.coverage')}</dt>
          <dd>${t('simulator.price.coverageValue', { n: c.n, total: tt.n, pct: formatPct(c.coverage, { sign: false }) })}</dd>
          <dt>${t('simulator.price.actual')}</dt>
          <dd class=${pos(c.actual)}>${formatUnits(c.actual)}</dd>
          <dt>${t('simulator.price.expected')}</dt>
          <dd data-testid="sim-expected">${formatUnits(c.expected)}${c.lo != null ? ` (${t('simulator.price.range', { lo: formatUnits(c.lo), hi: formatUnits(c.hi) })})` : ''}</dd>
          <dt>${t('simulator.price.meanEv')}</dt>
          <dd>${formatPct(tt.fairCloseEv.mean)} · n ${tt.fairCloseEv.n}</dd>
          <dt>${t('simulator.price.chance')}</dt>
          <dd>${tt.profitSe != null ? `${formatUnits(tt.profit)} ± ${formatUnits(2 * tt.profitSe, { sign: false })}` : '–'}</dd>
        </dl>`
      : null}
    <p class=${`sim-verdict sim-verdict-${kind} small`}>${closeSentenceFor(tt)}</p>
    <p class="muted xs">${t('simulator.price.chanceNote')}</p>
  </${Block}>`;
}

/** @param {{ sim: SimResult }} props */
export function MonthsBlock({ sim }) {
  const rows = [...sim.perMonth].reverse().map((m) => ({ ...m, key: m.month }));
  return html`<${Block} testId="sim-months" summary=${html`<span class="sim-sum"><span>${t('simulator.months.title')}</span><span class="sim-sum-fig num">${t('simulator.months.summary', { count: rows.length, n: rows.length })}</span></span>`}>
    <${DataTable}
      caption=${t('simulator.months.title')}
      columns=${[
        { key: 'month', label: t('simulator.months.month'), render: (/** @type {any} */ r) => formatMonth(r.month) },
        { key: 'record', label: t('simulator.months.record'), render: (/** @type {any} */ r) => formatRecord(r) },
        { key: 'profit', label: t('simulator.profitCol'), num: true, render: (/** @type {any} */ r) => html`<span class=${pos(r.profit)}>${formatUnits(r.profit)}</span>` },
        { key: 'yield', label: t('stats.yield'), num: true, render: (/** @type {any} */ r) => `${formatPct(r.yield)} (n ${r.n})` },
      ]}
      rows=${rows}
    />
  </${Block}>`;
}

const DIMENSIONS = /** @type {const} */ (['tag', 'market', 'price', 'line']);

/** @param {{ sim: SimResult, filters: FilterState, picks?: import('../../data/types').Pick[], today?: string }} props */
export function BreakdownBlock({ sim, filters, picks, today }) {
  const [dim, setDim] = useState(/** @type {'tag' | 'market' | 'price' | 'line'} */ ('tag'));
  const keyOf = {
    tag: (/** @type {any} */ p) => p.tag,
    market: (/** @type {any} */ p) => p.market,
    price: (/** @type {any} */ p) => priceBand(p.price),
    line: (/** @type {any} */ p) => p.lineKey,
  }[dim];
  const raw = breakdown(sim.points, keyOf);
  const rows = dim === 'line' ? [...raw].sort((x, y) => compareLineKeys(String(x.key), String(y.key))) : raw;
  const multiScope = dim === 'line' && new Set(rows.map((r) => String(r.key).split(':')[0])).size > 1;
  const labelOf = (/** @type {string} */ k) =>
    dim === 'tag' ? tagLabel(/** @type {any} */ (k)) : dim === 'market' ? t(`markets.${k}`) : dim === 'line' ? lineLabel(k, { scope: multiScope }) : t(`simulator.bands.${k}`);
  const patchOf = (/** @type {string} */ k) => {
    if (dim === 'tag') return { tags: [k] };
    if (dim === 'market') return { markets: [k] };
    if (dim === 'line') return { lines: [k] };
    // A band inside a price filter that is already on: the overlap of the two (analysis.js rowPatch).
    return rowPatch(filters, 'priceBand', k, { today: today || todayIn(APP_TIMEZONE) }) || priceBandPatch(k);
  };
  // Every row links to exactly its picks (graded, countable, priced; see filters.js exactSlice).
  const slice = (/** @type {string} */ k) => (picks ? exactSlice(picks, filters, patchOf(k), { today: today || todayIn(APP_TIMEZONE) }) : { ...filters, ...patchOf(k) });
  return html`<${Block} testId="sim-breakdown" summary=${html`<span class="sim-sum"><span>${t('simulator.breakdown.title')}</span><span class="sim-sum-fig">${t('simulator.breakdown.summary')}</span></span>`}>
    <${SegmentedControl}
      label=${t('simulator.breakdown.by')}
      value=${dim}
      options=${DIMENSIONS.map((d) => ({ value: d, label: t(`simulator.breakdown.${d}`) }))}
      onValue=${(/** @type {any} */ v) => setDim(v)}
    />
    <ul class="sim-rows" data-testid="sim-breakdown-rows">
      ${dim === 'line' && !rows.length ? html`<p class="muted small">${t('lines.filter.none')}</p>` : null}
    ${rows.map(
        (r) => html`<li>
          <a class="sim-row" href=${explorerHref(slice(r.key))} data-key=${r.key} data-n=${r.n}>
            <span class="sim-row-name">${labelOf(r.key)}</span>
            <span class=${`sim-row-pl num ${pos(r.profit)}`}>${formatUnits(r.profit)}</span>
            <span class="sim-row-rec num">${formatRecord(r)} · ${t('simulator.breakdown.avg', { price: formatPrice(r.avgPrice, { average: true }) })}</span>
            <span class="sim-row-y num">${formatPct(r.yield)} · n ${r.n}</span>
          </a>
        </li>`,
      )}
    </ul>
    ${dim === 'tag' ? html`<${TagGlossaryLinks} tags=${rows.map((r) => String(r.key))} testId="sim-tag-glossary" />` : null}
    ${dim === 'market'
      ? html`<${TagGlossaryLinks} items=${rows.filter((r) => MARKET_SLUGS[r.key]).map((r) => ({ slug: MARKET_SLUGS[r.key], label: t(`markets.${r.key}`) }))} label=${t('links.inGlossary')} testId="sim-market-glossary" />`
      : null}
    <p class="muted xs">${t('simulator.breakdown.note')}</p>
  </${Block}>`;
}

/** @param {{ sim: SimResult, filters: FilterState }} props */
export function PendingBlock({ sim, filters }) {
  const tt = sim.totals;
  if (!tt.pending) return null;
  return html`<${Block} testId="sim-pending" summary=${html`<span class="sim-sum"><span>${t('simulator.pending.title')}</span><span class="sim-sum-fig num">${t('simulator.pending.summary', { count: tt.pending, n: tt.pending, units: formatUnits(tt.pendingStake, { sign: false }) })}</span></span>`}>
    <p class="small" data-testid="sim-pending-text">
      ${t('simulator.pending.body', { count: tt.pending, n: tt.pending, units: formatUnits(tt.pendingStake, { sign: false }) })}
      ${tt.pendingCounted < tt.pending ? ` ${t('simulator.pending.notCounted', { count: tt.pending - tt.pendingCounted, n: tt.pending - tt.pendingCounted })}` : ''}
    </p>
    <a class="link-btn" href=${explorerHref({ ...filters, statuses: ['pending'] })}>${t('simulator.pending.see')}</a>
  </${Block}>`;
}

