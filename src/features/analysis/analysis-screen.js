// STUB (foundation): flat yield by market family as bars. The Analysis feature replaces it.
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Card, FeedGate } from '../../lib/ui/index.js';
import { BarChart } from '../../lib/charts/index.js';
import { formatPct, formatUnits } from '../../lib/format.js';
import { groupBy } from '../../data/stats.js';

function Analysis({ data }) {
  const groups = useMemo(() => groupBy(data.picks.filter((p) => p.source === 'shadow'), (p) => p.market).filter((g) => g.summary.n), [data]);
  return html`<div class="analysis stack">
    <${Card} title=${t('analysis.stubTitle')} subtitle=${t('analysis.stubBody')}>
      <${BarChart}
        testId="analysis-bars"
        bars=${groups.map((g) => ({ label: t(`markets.${g.key}`), sub: `n ${g.summary.n}`, value: g.summary.yield }))}
        yFormat=${formatPct}
        summary=${t('analysis.barsSummary', { groups: groups.length })}
        table=${{
          columns: [
            { key: 'label', label: t('filters.market') },
            { key: 'n', label: t('stats.graded'), num: true },
            { key: 'profit', label: t('stats.units'), num: true },
            { key: 'yield', label: t('stats.yield'), num: true },
          ],
          rows: groups.map((g) => ({ key: g.key, label: t(`markets.${g.key}`), n: g.summary.n, profit: formatUnits(g.summary.profit), yield: formatPct(g.summary.yield) })),
        }}
      />
    </${Card}>
  </div>`;
}

export function AnalysisScreen() {
  return html`<${FeedGate}>${(data) => html`<${Analysis} data=${data} />`}</${FeedGate}>`;
}
