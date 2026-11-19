// Simulator (#/simulator, "Simulador"): "if you had bet X on each of these picks". The picks come
// from the shared filter panel (the same query string as the Explorer), the staking plan sits next
// to the filters in the URL, and an optional scenario B (its own filters and staking, encoded in
// `b`) is compared side by side. Every figure comes from src/data/simulate.js and stats.js.
//
// Query: the filter keys of src/data/filters.js, then mode / stake / pct / bank / kf / kcap, then b.
import { html, useMemo, useState, useEffect } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { SIDE_PANEL_QUERY } from '../../lib/links.js';
import { navigate } from '../../lib/router.js';
import {
  FeedGate, Card, Stat, Scoreboard, Button, BottomSheet, Disclosure, EmptyState,
  FilterPanel, ActiveFilters, FilterButton, SavedFilters, useMediaQuery,
} from '../../lib/ui/index.js';
import { MultiLineChart } from '../../lib/charts/index.js';
import { formatUnits, formatPct, formatPrice, formatDate, formatMoney, todayIn } from '../../lib/format.js';
import { APP_TIMEZONE } from '../../config.js';
import { applyFilters, countActive, defaultFilters, toQueryString } from '../../data/filters.js';
import { memoLast } from '../../data/memo.js';
import { summarize } from '../../data/stats.js';
import { useSettings, bankrollUnits } from '../../data/settings.js';
import { simulate, defaultStaking, scenariosFromQuery, simulatorQueryString } from '../../data/simulate.js';
import { StakingControls } from './staking-controls.js';
import { headlineLead, closeSentenceFor, leftOutLine } from './sentences.js';
import { RiskBlock, PriceBlock, MonthsBlock, PendingBlock, BreakdownBlock } from './sim-blocks.js';
import { CompareBlock, ScenariosBlock } from './sim-compare.js';

/** @typedef {import('../../data/types').Pick} Pick */
/** @typedef {import('../../data/filters.js').FilterState} FilterState */
/** @typedef {import('../../data/simulate.js').Scenario} Scenario */
/** @typedef {import('../../data/simulate.js').Staking} Staking */
/** @typedef {import('../../data/simulate.js').SimResult} SimResult */

/** Wide screens: the filter panel is a side column (same breakpoint as the Explorer). */
const SIDE_QUERY = SIDE_PANEL_QUERY;
/** The expected-by-close line is drawn when at least this share of the picks has a two-sided close. */
const EXPECTED_LINE_MIN_COVERAGE = 0.5;

const tone = (/** @type {number | null} */ v) => (v == null || Math.abs(v) < 0.005 ? 'plain' : v > 0 ? 'won' : 'lost');
const unitsAxis = (/** @type {number} */ v) => formatUnits(v, { suffix: '' });

/**
 * The curve with the drawdown shaded and, when enough picks have a close, the expected-by-close line.
 * @param {{ sim: SimResult, testId?: string }} props
 */
function Curve({ sim, testId = 'sim-chart' }) {
  const tt = sim.totals;
  const showExpected = tt.closeCheck.n > 1 && (tt.closeCheck.coverage ?? 0) >= EXPECTED_LINE_MIN_COVERAGE;
  const series = [{ values: sim.points.map((p) => p.cum), label: t('simulator.lineActual'), tone: /** @type {const} */ ('accent') }];
  if (showExpected) series.push({ values: sim.points.map((p) => p.expectedCum), label: t('simulator.lineExpected', { n: tt.closeCheck.n }), tone: /** @type {any} */ ('c3'), style: /** @type {any} */ ('dashed') });
  const summary = t('simulator.curveSummary', {
    n: tt.n,
    profit: formatUnits(tt.profit),
    dd: formatUnits(tt.maxDrawdownU, { sign: false }),
  }) + (showExpected ? ` ${t('simulator.curveExpected', { expected: formatUnits(tt.closeCheck.expected) })}` : '');
  return html`<${MultiLineChart}
    series=${series}
    labels=${sim.points.map((p) => formatDate(p.date, 'short'))}
    shadeDrawdown
    yFormat=${unitsAxis}
    summary=${summary}
    table=${{
      columns: [
        { key: 'date', label: t('simulator.day'), render: (/** @type {any} */ r) => formatDate(r.date, 'medium') },
        { key: 'n', label: t('simulator.picksCol'), num: true },
        { key: 'staked', label: t('simulator.stakedCol'), num: true, render: (/** @type {any} */ r) => formatUnits(r.staked, { sign: false }) },
        { key: 'profit', label: t('simulator.profitCol'), num: true, render: (/** @type {any} */ r) => formatUnits(r.profit) },
        { key: 'cum', label: t('simulator.cumCol'), num: true, render: (/** @type {any} */ r) => formatUnits(r.cum) },
      ],
      rows: [...sim.days].reverse().map((d) => ({ ...d, key: d.date })),
    }}
    testId=${testId}
  />`;
}

/**
 * The headline: what the plan would have made, then record, yield, picks, average price, the chance
 * range, the sentence against the close and the curve.
 * @param {{ sim: SimResult, staking: Staking, settings: import('../../data/settings.js').Settings }} props
 */
function Headline({ sim, staking, settings }) {
  const tt = sim.totals;
  const money = formatMoney(tt.profit, settings);
  const left = leftOutLine(tt);
  if (!tt.n) {
    return html`<${Card} testId="sim-result">
      <p class="sim-lead">${headlineLead(staking)}</p>
      <p class="sim-big num" data-testid="sim-profit">${formatUnits(0)}</p>
      <${EmptyState} title=${t('simulator.emptyTitle')} body=${tt.pending ? t('simulator.emptyPending', { count: tt.pending, n: tt.pending }) : t('simulator.emptyBody')} testId="sim-empty" />
      ${left ? html`<p class="sim-note small">${left}</p>` : null}
    </${Card}>`;
  }
  const compounding = staking.mode === 'percent' || staking.mode === 'kelly';
  return html`<${Card} class="sim-result" testId="sim-result">
    <div class="sim-head">
      <p class="sim-lead" data-testid="sim-lead">${headlineLead(staking)}:</p>
      <p class=${`sim-big num sim-${tone(tt.profit)}`} data-testid="sim-profit">${formatUnits(tt.profit)}</p>
      ${money ? html`<p class="sim-money num" data-testid="sim-money">${t('simulator.money', { money })}</p>` : null}
      <p class="sim-chance small num" data-testid="sim-chance">
        ${tt.chanceLo != null ? t('simulator.chance', { lo: formatUnits(tt.chanceLo), hi: formatUnits(tt.chanceHi) }) : t('simulator.chanceNone')}
      </p>
    </div>
    <div class="sim-record">
      <${Scoreboard} won=${tt.won} lost=${tt.lost} void=${tt.void} halfWon=${tt.halfWon} halfLost=${tt.halfLost} size="md" />
    </div>
    <div class="stats-row">
      <${Stat} label=${t('stats.yield')} value=${formatPct(tt.yield)} sub=${t('stats.nGraded', { n: tt.n })} tone=${tone(tt.yield)} testId="sim-yield" />
      <${Stat} label=${t('simulator.picks')} value=${String(tt.n)} sub=${t('simulator.stakedSub', { staked: formatUnits(tt.staked, { sign: false }) })} testId="sim-n" />
      <${Stat} label=${t('simulator.avgPrice')} value=${formatPrice(tt.avgPrice, { average: true })} sub=${t('stats.nGraded', { n: tt.n })} />
      ${compounding
        ? html`<${Stat} label=${t('simulator.finalBank')} value=${formatUnits(tt.finalBank, { sign: false })} sub=${t('simulator.fromBank', { bank: formatUnits(tt.startBank, { sign: false }) })} testId="sim-final-bank" />`
        : html`<${Stat} label=${t('stats.maxDrawdown')} value=${formatUnits(-tt.maxDrawdownU)} sub=${t('simulator.ofBank', { pct: formatPct(tt.maxDrawdownPctStart, { sign: false }) })} />`}
    </div>
    ${left ? html`<p class="sim-note small" data-testid="sim-left-out">${left}</p>` : null}
    <p class="sim-sentence small" data-testid="sim-close-sentence">${closeSentenceFor(tt)}</p>
    <${Curve} sim=${sim} />
  </${Card}>`;
}

/** @param {{ data: import('../../data/types').Dataset, query: Record<string, string> }} props */
function Simulator({ data, query }) {
  const settings = useSettings();
  const today = todayIn(APP_TIMEZONE);
  const side = useMediaQuery(SIDE_QUERY);
  const [panelOpen, setPanelOpen] = useState(false);
  const bankU = bankrollUnits(settings);
  const defaults = useMemo(
    () => defaultStaking({ stake: settings.defaultStake, bankroll: bankU ? Math.round(bankU * 100) / 100 : 100 }),
    [settings.defaultStake, bankU],
  );
  const empty = Object.keys(query).length === 0;
  const qkey = JSON.stringify(query);
  const { a: a0, b } = useMemo(() => scenariosFromQuery(query, defaults), [qkey, defaults]);
  // Opened with no query: Sombra, every tag.
  const a = empty ? { ...a0, filters: { ...a0.filters, sources: ['shadow'] } } : a0;
  useEffect(() => {
    if (empty) navigate(`/simulator?${simulatorQueryString(a, null, defaults)}`, { replace: true });
  }, [empty]);

  const go = (/** @type {Scenario} */ na, /** @type {Scenario | null} */ nb) => {
    const qs = simulatorQueryString(na, nb, defaults);
    navigate(qs ? `/simulator?${qs}` : '/simulator', { replace: true });
  };
  const setFilters = (/** @type {FilterState} */ filters) => go({ ...a, filters }, b);
  const setStaking = (/** @type {Staking} */ staking) => go({ ...a, staking }, b);

  // Keyed on the filters only (not the whole query): a stake change does not filter or count again.
  const fqsA = toQueryString(a.filters);
  const listA = useMemo(() => memoLast('simulator.listA', [data, fqsA, today], () => applyFilters(data.picks, a.filters, { today })), [data, fqsA, today]);
  const countA = useMemo(() => memoLast('simulator.countA', [listA], () => summarize(listA)), [listA]);
  const simA = useMemo(() => simulate(listA, a.staking), [listA, JSON.stringify(a.staking)]);
  const active = countActive(a.filters);

  const panel = html`<${FilterPanel} picks=${data.picks} filters=${a.filters} onChange=${setFilters} hide=${['q']} today=${today} />`;
  const saved = html`<${Disclosure} summary=${t('simulator.savedFilters')}><${SavedFilters} filters=${a.filters} onApply=${setFilters} /></${Disclosure}>`;

  return html`<div class=${`simulator${side ? ' sim-has-side' : ''}`}>
    <div class="sim-layout">
      ${side
        ? html`<aside class="sim-side" aria-label=${t('filters.title')}>
            <div class="sim-side-head">
              <h2 class="sim-side-title">${t('filters.title')}</h2>
              ${active ? html`<button type="button" class="link-btn" onClick=${() => setFilters(defaultFilters())}>${t('filters.clearAll')}</button>` : null}
            </div>
            ${saved}
            ${panel}
          </aside>`
        : null}
      <div class="sim-main stack">
        <${Card} class="sim-setup" testId="sim-setup">
          <div class="sim-picks">
            <div class="sim-picks-head">
              <h2 class="sim-h">${t('simulator.picksTitle')}</h2>
              ${side ? null : html`<${FilterButton} count=${active} onClick=${() => setPanelOpen(true)} expanded=${panelOpen} />`}
            </div>
            <p class="sim-count num" data-testid="sim-count" aria-live="polite">
              ${t('simulator.count', { count: countA.n, n: countA.n })}${countA.pending ? `, ${t('simulator.countPending', { count: countA.pending, n: countA.pending })}` : ''}
            </p>
            <${ActiveFilters} filters=${a.filters} onChange=${setFilters} />
          </div>
          <div class="sim-plan">
            <h2 class="sim-h">${t('simulator.stakingTitle')}</h2>
            <${StakingControls} staking=${a.staking} onChange=${setStaking} />
          </div>
        </${Card}>

        <${Headline} sim=${simA} staking=${a.staking} settings=${settings} />

        <div class="sim-blocks stack-sm">
          ${simA.totals.n
            ? html`<${RiskBlock} sim=${simA} staking=${a.staking} />
                <${PriceBlock} sim=${simA} />
                <${MonthsBlock} sim=${simA} />
                <${BreakdownBlock} sim=${simA} filters=${a.filters} picks=${data.picks} today=${today} />`
            : null}
          <${PendingBlock} sim=${simA} filters=${a.filters} />
          <${CompareBlock} data=${data} today=${today} a=${a} b=${b} simA=${simA} onChange=${go} />
          <${ScenariosBlock} a=${a} b=${b} defaults=${defaults} onChange=${go} />
        </div>
      </div>
    </div>

    ${side
      ? null
      : html`<${BottomSheet}
          open=${panelOpen}
          title=${t('filters.title')}
          onClose=${() => setPanelOpen(false)}
          testId="filter-sheet"
          size="lg"
          footer=${html`<div class="sim-sheet-foot">
            <${Button} variant="ghost" onClick=${() => setFilters(defaultFilters())} disabled=${!active}>${t('filters.clearAll')}</${Button}>
            <${Button} variant="primary" onClick=${() => setPanelOpen(false)} data-testid="filter-show">${t('filters.showN', { count: listA.length, n: listA.length })}</${Button}>
          </div>`}
        >
          <${ActiveFilters} filters=${a.filters} onChange=${setFilters} clearAll=${false} testId="sheet-active-filters" />
          ${saved}
          ${panel}
        </${BottomSheet}>`}
  </div>`;
}

/** @param {{ params: Record<string, string>, query: Record<string, string> }} props */
export function SimulatorScreen({ query }) {
  return html`<${FeedGate}>${(data) => html`<${Simulator} data=${data} query=${query} />`}</${FeedGate}>`;
}

