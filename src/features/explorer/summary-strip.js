// The summary of the current filter, above the list: record, hit rate vs break-even, flat yield at
// 1u, units, fair-close EV ± 2 SE with n, pending, one sentence and the cumulative sparkline.
// Every figure comes from src/data (summarize, simulate, describe).
import { html } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Card, Stat, Scoreboard, Button } from '../../lib/ui/index.js';
import { Sparkline } from '../../lib/charts/index.js';
import { formatPct, formatUnits, formatPrice } from '../../lib/format.js';
import { describe } from '../../data/summaries.js';
import { href } from '../../lib/router.js';

/**
 * @param {{ summary: import('../../data/stats.js').Summary, curve: number[], simHref: string }} props
 */
export function SummaryStrip({ summary: s, curve, simHref }) {
  const e = s.fairCloseEv;
  const sentence = describe(t('explorer.theseLabel'), s);
  const last = curve.length ? curve[curve.length - 1] : 0;
  return html`<${Card} class="ex-summary" testId="explorer-summary">
    <div class="ex-summary-top">
      <div class="ex-record">
        <span class="stat-label">${t('explorer.record')}</span>
        <${Scoreboard} won=${s.won} lost=${s.lost} void=${s.void} halfWon=${s.halfWon} halfLost=${s.halfLost} size="md" />
        <span class="stat-sub num">${t('stats.nGraded', { n: s.n })}${s.avgPrice != null ? ` · ${t('explorer.avgPrice', { price: formatPrice(s.avgPrice, { average: true }) })}` : ''}</span>
      </div>
      ${curve.length > 1
        ? html`<div class="ex-spark">
            <${Sparkline} values=${curve} width=${112} height=${40} summary=${t('explorer.sparkSummary', { n: curve.length, profit: formatUnits(last) })} />
            <span class="stat-sub">${t('explorer.sparkLabel')}</span>
          </div>`
        : null}
    </div>
    <div class="stats-row ex-stats">
      <${Stat} label=${t('explorer.yield')} value=${formatPct(s.yield)} sub=${t('stats.nGraded', { n: s.n })}
        tone=${s.yield == null ? 'plain' : s.yield > 0 ? 'won' : s.yield < 0 ? 'lost' : 'plain'} testId="ex-yield" />
      <${Stat} label=${t('stats.units')} value=${formatUnits(s.profit)} sub=${t('explorer.flat1u')} testId="ex-units" />
      <${Stat} label=${t('explorer.hitRate')} value=${formatPct(s.hitRate, { sign: false })}
        sub=${s.breakEven != null ? t('explorer.breakEven', { be: formatPct(s.breakEven, { sign: false }), n: s.n }) : t('stats.nGraded', { n: s.n })} testId="ex-hit" />
      <${Stat} label=${t('stats.fairCloseEv')} value=${formatPct(e.mean)}
        sub=${e.n && e.lo != null && e.hi != null ? t('explorer.evRange', { lo: formatPct(e.lo), hi: formatPct(e.hi), n: e.n }) : t('stats.nClose', { n: e.n })}
        testId="ex-close-ev" />
    </div>
    <p class="ex-sentence small" data-testid="explorer-sentence">${sentence}</p>
    <div class="ex-summary-foot">
      ${s.pending ? html`<span class="chip chip-pending num" data-testid="ex-pending">${t('explorer.pending', { count: s.pending, n: s.pending })}</span>` : html`<span></span>`}
      <${Button} variant="secondary" icon="simulator" href=${href(simHref)} data-testid="simulate-these">${t('explorer.simulate')}</${Button}>
    </div>
  </${Card}>`;
}
