// STUB (foundation): 1u on every graded Sombra pick, as a curve with the drawdown shaded. The
// Simulator feature replaces it with filters, stake modes and the per-month table.
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Card, Stat, FeedGate } from '../../lib/ui/index.js';
import { LineChart } from '../../lib/charts/index.js';
import { formatDate, formatPct, formatUnits } from '../../lib/format.js';
import { simulate } from '../../data/simulate.js';

function Simulator({ data }) {
  const sim = useMemo(() => simulate(data.picks.filter((p) => p.source === 'shadow'), { stake: 1, bankroll: 100 }), [data]);
  const tt = sim.totals;
  return html`<div class="simulator stack">
    <${Card} title=${t('simulator.stubTitle')} subtitle=${t('simulator.stubBody')} tone="accent">
      <div class="stats-row">
        <${Stat} label=${t('stats.units')} value=${formatUnits(tt.profit)} tone=${tt.profit > 0 ? 'won' : tt.profit < 0 ? 'lost' : 'plain'} testId="sim-profit" />
        <${Stat} label=${t('stats.yield')} value=${formatPct(tt.yield)} sub=${t('stats.nGraded', { n: tt.n })} />
        <${Stat} label=${t('stats.maxDrawdown')} value=${formatUnits(-tt.maxDrawdownU)} />
      </div>
      <${LineChart}
        values=${sim.points.map((p) => p.cum)}
        labels=${sim.points.map((p) => formatDate(p.date, 'short'))}
        shadeDrawdown
        yFormat=${(/** @type {number} */ v) => formatUnits(v, { suffix: '' })}
        summary=${t('simulator.curveSummary', { n: tt.n, profit: formatUnits(tt.profit), dd: formatUnits(tt.maxDrawdownU, { sign: false }) })}
        table=${{
          columns: [
            { key: 'month', label: t('simulator.month') },
            { key: 'n', label: t('stats.graded'), num: true },
            { key: 'profit', label: t('stats.units'), num: true, render: (/** @type {any} */ r) => formatUnits(r.profit) },
          ],
          rows: sim.perMonth.map((m) => ({ ...m, key: m.month })),
        }}
        testId="sim-chart"
      />
    </${Card}>
  </div>`;
}

export function SimulatorScreen() {
  return html`<${FeedGate}>${(data) => html`<${Simulator} data=${data} />`}</${FeedGate}>`;
}
