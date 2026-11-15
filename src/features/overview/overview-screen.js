// STUB (foundation): record, yield, units, fair-close EV and pending per source, with a sparkline and
// the written summary. The Overview feature replaces this screen.
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { href } from '../../lib/router.js';
import { Card, Stat, Scoreboard, FeedGate } from '../../lib/ui/index.js';
import { Sparkline } from '../../lib/charts/index.js';
import { formatPct, formatUnits } from '../../lib/format.js';
import { summarize, sheetProfit, isGraded } from '../../data/stats.js';
import { simulate } from '../../data/simulate.js';
import { describe } from '../../data/summaries.js';

const SOURCES = /** @type {const} */ (['bets', 'shadow', 'grok']);

/** @param {{ source: import('../../data/types').Source, picks: import('../../data/types').Pick[] }} props */
function SourceCard({ source, picks }) {
  const mine = useMemo(() => picks.filter((p) => p.source === source), [picks, source]);
  const s = useMemo(() => summarize(mine, source === 'bets' ? { profit: 'sheet' } : {}), [mine, source]);
  // Real bets follow the sheet's own profit; the others are 1u flat.
  const curve = useMemo(() => {
    if (source !== 'bets') return simulate(mine).points.map((p) => p.cum);
    let cum = 0;
    return mine.filter(isGraded).map((p) => (cum += sheetProfit(p) ?? 0));
  }, [mine, source]);
  const label = t(`sources.${source}`);
  return html`<${Card}
    title=${label}
    subtitle=${t(`overview.sub.${source}`)}
    testId=${`source-${source}`}
    action=${html`<${Sparkline} values=${curve} summary=${t('overview.sparkline', { source: label })} />`}
  >
    <${Scoreboard} won=${s.won} lost=${s.lost} void=${s.void} halfWon=${s.halfWon} halfLost=${s.halfLost} />
    <div class="stats-row">
      <${Stat} label=${t('stats.units')} value=${formatUnits(s.profit)} tone=${s.profit > 0 ? 'won' : s.profit < 0 ? 'lost' : 'plain'} />
      <${Stat} label=${t('stats.yield')} value=${formatPct(s.yield)} sub=${t('stats.nGraded', { n: s.n })} />
      <${Stat} label=${t('stats.fairCloseEv')} value=${formatPct(s.fairCloseEv.mean)} sub=${t('stats.nClose', { n: s.fairCloseEv.n })} />
      <${Stat} label=${t('stats.pending')} value=${s.pending} tone=${s.pending ? 'pending' : 'plain'} />
    </div>
    <p class="overview-summary">${describe(label, s)}</p>
    <a class="link-btn" href=${href(`/explorer?src=${source}`)}>${t('overview.seePicks')}</a>
  </${Card}>`;
}

export function OverviewScreen() {
  return html`<div class="overview stack">
    <${FeedGate}>${(data) => html`${SOURCES.map((src) => html`<${SourceCard} source=${src} picks=${data.picks} />`)}`}</${FeedGate}>
  </div>`;
}
