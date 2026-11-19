// Grok vs Claude: Grok's logged picks by our verdict (priced, priced under rule 29, not priced and
// why), his team-corner picks against Sombra's CÓRNERS EQUIPO rows on the same matches, his picks by
// market, and a short written comparison that always says what n is.
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { href } from '../../lib/router.js';
import { Card, Disclosure, Banner, Scoreboard, Icon } from '../../lib/ui/index.js';
import { formatPct, formatDate, formatUnits, formatRecord } from '../../lib/format.js';
import { grokByVerdict, grokByMarket, grokTeamCorners, grokPricedSplit, GROK_TEAM_CORNERS_ONLY_FROM } from '../../data/analysis.js';
import { summarize } from '../../data/stats.js';
import { defaultFilters, exactSlice } from '../../data/filters.js';
import { VerdictChip, explorerHref, evText, signClass, SummaryLine, hitText } from './parts.js';
import { grokText } from './text.js';

/** @typedef {import('../../data/types').Pick} Pick */
/** @typedef {import('../../data/stats.js').Summary} Summary */

/** @param {{ picks: Pick[], all?: Pick[], today?: string, scopeNote: boolean, filters: import('../../data/filters.js').FilterState }} props */
export function GrokVsClaude({ picks, all: allPicks, today, scopeNote, filters }) {
  const grok = useMemo(() => picks.filter((p) => p.source === 'grok'), [picks]);
  const all = useMemo(() => summarize(grok), [grok]);
  const kinds = useMemo(() => grokByVerdict(picks), [picks]);
  const split = useMemo(() => grokPricedSplit(picks), [picks]);
  const markets = useMemo(() => grokByMarket(picks), [picks]);
  const tc = useMemo(() => grokTeamCorners(picks), [picks]);
  const grokLink = (/** @type {Partial<import('../../data/filters.js').FilterState>} */ patch) => explorerHref({ ...filters, ...patch });

  return html`<div class="stack an-part" data-testid="analysis-grok">
    ${scopeNote ? html`<${Banner} tone="info" testId="grok-scope">${t('analysis.gk.scope')}</${Banner}>` : null}
    <${Card} title=${t('analysis.gk.title')} subtitle=${t('analysis.gk.sub')} tone="accent">
      <p class="an-text an-lead" data-testid="grok-text">${grokText({ all, split, tc })}</p>
    </${Card}>

    <${Card} title=${t('analysis.gk.verdictTitle')} subtitle=${t('analysis.gk.verdictSub')}>
      ${kinds.length
        ? html`<ul class="an-glist" data-testid="grok-verdicts">
            ${kinds.map(
              (k) => html`<li key=${k.key} data-key=${k.key}>
                <details class="an-grow">
                  <summary>
                    <span class="an-gname">${t(`analysis.gk.kind.${k.key}`)}</span>
                    <span class="an-gverdict"><${VerdictChip} v=${k.verdict} /></span>
                    <span class="an-gmeta num">
                      <span>${t('analysis.gk.logged', { count: k.count, n: k.count })}</span><span>n ${k.summary.n}</span><span>${formatRecord(k.summary)}</span>
                      <span class=${signClass(k.summary.yield)}>${t('analysis.yieldShort', { v: formatPct(k.summary.yield) })}</span>
                      <span>${t('analysis.evShort', { v: evText(k.summary.fairCloseEv) })}</span>
                    </span>
                    <${Icon} name="chevron-down" size=${16} />
                  </summary>
                  <div class="an-gbody">
                    <p class="an-note">${t(`analysis.gk.kindHelp.${k.key}`)}</p>
                    <ul class="an-rows">
                      ${k.why.map(
                        (w) => html`<li key=${w.key} data-why=${w.key}>
                          <span class="an-row-name">${t(`analysis.gk.why.${w.key}`)}</span>
                          <${SummaryLine} s=${w.summary} />
                        </li>`,
                      )}
                    </ul>
                    ${k.key !== 'none'
                      ? html`<a class="link-btn an-link" href=${grokLink({ sources: ['grok'], tags: [k.key === 'not_priced' ? 'grok_not_priced' : 'grok_priced'] })}>
                          ${t(k.key === 'not_priced' ? 'analysis.gk.seeNotPriced' : 'analysis.gk.seePriced')}
                        </a>`
                      : null}
                  </div>
                </details>
              </li>`,
            )}
          </ul>`
        : html`<p class="an-muted">${t('analysis.text.grokNone')}</p>`}
    </${Card}>

    <${Card} title=${t('analysis.gk.tcTitle')} subtitle=${t('analysis.gk.tcSub', { date: formatDate(GROK_TEAM_CORNERS_ONLY_FROM, 'medium') })} testId="grok-team-corners">
      <div class="an-versus">
        <${Side} title=${t('analysis.gk.grokSide')} s=${tc.grok} testId="tc-grok" note=${t('analysis.gk.since', { n: tc.grokSince.n, date: formatDate(GROK_TEAM_CORNERS_ONLY_FROM, 'short') })} />
        <${Side} title=${t('analysis.gk.sombraSide')} s=${tc.sombra} testId="tc-sombra" />
      </div>
      ${tc.matches.length
        ? html`<div class="stack-sm" data-testid="tc-shared">
            <p class="an-text">${t('analysis.gk.sharedLine', {
              count: tc.matches.length,
              m: tc.matches.length,
              grok: `${formatRecord(tc.sharedGrok)}, ${formatPct(tc.sharedGrok.yield)} (n ${tc.sharedGrok.n})`,
              sombra: `${formatRecord(tc.sharedSombra)}, ${formatPct(tc.sharedSombra.yield)} (n ${tc.sharedSombra.n})`,
            })}</p>
            <p class="an-note num">${t('analysis.gk.agreement', tc.agreement)}</p>
            <${Disclosure} summary=${t('analysis.gk.sharedList', { count: tc.matches.length, n: tc.matches.length })}>
              <ul class="an-rows">
                ${tc.matches.map(
                  (m) => html`<li key=${`${m.date}|${m.match}`}>
                    <span class="an-row-name">${m.match}<span class="an-dim"> · ${formatDate(m.date, 'short')}</span></span>
                    <span class="an-row-figs">
                      ${m.grok.map((p) => html`<a href=${href(`/explorer/${encodeURIComponent(p.uid)}`)}>${t('analysis.gk.grokPick', { sel: p.selection })}</a>`)}
                      ${m.sombra.map((p) => html`<a href=${href(`/explorer/${encodeURIComponent(p.uid)}`)}>${t('analysis.gk.sombraPick', { sel: p.selection })}</a>`)}
                    </span>
                  </li>`,
                )}
              </ul>
            </${Disclosure}>
          </div>`
        : html`<p class="an-muted" data-testid="tc-none">${t('analysis.gk.noShared')}</p>`}
      <div class="row-wrap">
        <a class="link-btn an-link" href=${grokLink({ ...defaultFilters(), sources: ['grok'], markets: ['corners_team'] })}>${t('analysis.gk.seeGrokTc')}</a>
        <a class="link-btn an-link" href=${grokLink({ ...defaultFilters(), sources: ['shadow'], tags: ['team_corners'] })}>${t('analysis.gk.seeSombraTc')}</a>
      </div>
    </${Card}>

    <${Card} title=${t('analysis.gk.marketTitle')}>
      ${markets.length
        ? html`<ul class="an-rows" data-testid="grok-markets">
            ${markets.map(
              (r) => html`<li key=${r.key} data-key=${r.key}>
                <a class="an-row-name" data-count=${r.summary.n} data-testid="grok-market-link"
                  href=${allPicks && today ? explorerHref(exactSlice(allPicks, filters, { sources: ['grok'], markets: [r.key] }, { today })) : grokLink({ sources: ['grok'], markets: [r.key] })}>${t(`markets.${r.key}`)}</a>
                <${SummaryLine} s=${r.summary} />
              </li>`,
            )}
          </ul>`
        : html`<p class="an-muted">${t('analysis.text.grokNone')}</p>`}
    </${Card}>
  </div>`;
}

/** One side of the team-corner comparison. @param {{ title: string, s: Summary, testId: string, note?: string }} props */
function Side({ title, s, testId, note }) {
  return html`<div class="an-vs" data-testid=${testId}>
    <div class="an-vs-title">${title}</div>
    <${Scoreboard} won=${s.won} lost=${s.lost} void=${s.void} halfWon=${s.halfWon} halfLost=${s.halfLost} size="md" />
    <dl class="kv">
      <dt>${t('analysis.col.yield')}</dt><dd class=${`num ${signClass(s.yield)}`}>${formatPct(s.yield)} · n ${s.n}</dd>
      <dt>${t('analysis.col.units')}</dt><dd class=${`num ${signClass(s.profit)}`}>${formatUnits(s.profit)}</dd>
      <dt>${t('analysis.col.hit')}</dt><dd class="num">${hitText(s)}</dd>
      <dt>${t('analysis.col.ev')}</dt><dd class="num">${evText(s.fairCloseEv)}</dd>
    </dl>
    ${note ? html`<p class="an-note">${note}</p>` : null}
  </div>`;
}
