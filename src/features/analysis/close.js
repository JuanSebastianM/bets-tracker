// Price against the close: the distribution of fair-close EV (and raw CLV as context), the share that
// beat the fair close, the split by the close's source (own book, bet365 feed), how closes moved per
// market family, and Pinnacle's 1X2 move for result picks with a Pinnacle id.
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { href } from '../../lib/router.js';
import { Card, Stat, Disclosure } from '../../lib/ui/index.js';
import { Histogram } from '../../lib/charts/index.js';
import { formatPct, formatDate, formatPrice } from '../../lib/format.js';
import { measureDistribution, CLOSE_BINS, closeBySource, closeMoves, pinnacleMoves } from '../../data/analysis.js';
import { closeVerdict } from '../../data/overview.js';
import { VerdictChip, evText, rangeText, signClass } from './parts.js';
import { closeText, clvText, pinnacleText } from './text.js';

/** @typedef {import('../../data/types').Pick} Pick */
/** @typedef {import('../../data/types').PinnacleRow} PinnacleRow */

/** Bin label: "−4% a −2%", "< −20%", "≥ +20%". @param {{ lo: number, hi: number, openLo?: boolean, openHi?: boolean }} b */
function binLabel(b) {
  const f = (/** @type {number} */ v) => formatPct(v, { digits: 0 });
  if (b.openLo) return `< ${f(b.hi)}`;
  if (b.openHi) return `≥ ${f(b.lo)}`;
  return t('analysis.band', { lo: f(b.lo), hi: f(b.hi) });
}

/** @param {{ bins: ReturnType<typeof measureDistribution>['bins'], summary: string, testId: string }} props */
function Dist({ bins, summary, testId }) {
  return html`<${Histogram}
    testId=${testId}
    bins=${bins}
    summary=${summary}
    format=${(/** @type {number} */ v) => formatPct(v, { digits: 0 })}
    table=${{ columns: [{ key: 'range', label: t('analysis.cl.bin') }, { key: 'n', label: 'n', num: true }], rows: bins.map((b, i) => ({ key: String(i), range: binLabel(b), n: b.n })) }}
  />`;
}

/** @param {{ picks: Pick[], pinnacle: PinnacleRow[] }} props */
export function CloseQuality({ picks, pinnacle }) {
  const ev = useMemo(() => measureDistribution(picks, (p) => p.fairCloseEv, CLOSE_BINS), [picks]);
  const clv = useMemo(() => measureDistribution(picks, (p) => p.clv, CLOSE_BINS), [picks]);
  const bySource = useMemo(() => closeBySource(picks), [picks]);
  const moves = useMemo(() => closeMoves(picks), [picks]);
  const pin = useMemo(() => pinnacleMoves(picks, pinnacle), [picks, pinnacle]);
  const e = ev.stat;
  const verdict = closeVerdict(e);

  return html`<div class="stack an-part" data-testid="analysis-close">
    <${Card} title=${t('analysis.cl.title')} subtitle=${t('analysis.cl.sub')}>
      <div class="stats-row an-stats">
        <${Stat} label=${t('stats.fairCloseEv')} value=${formatPct(e.mean)} sub=${`n ${e.n}`} testId="close-mean" />
        <${Stat} label=${t('analysis.cl.range')} value=${e.lo != null ? html`<span class="an-range-val">${formatPct(e.lo)} <span class="an-dim">a</span> ${formatPct(e.hi)}</span>` : '–'} sub=${t('analysis.cl.rangeSub')} />
        <${Stat} label=${t('analysis.cl.beat')} value=${formatPct(e.shareAbove, { sign: false })} sub=${`n ${e.n}`} testId="close-share" />
        <div class="stat"><div class="stat-label">${t('analysis.col.verdict')}</div><div><${VerdictChip} v=${verdict} /></div></div>
      </div>
      <p class="an-text" data-testid="close-text">${closeText(e, verdict)}</p>
      <${Dist} testId="close-histogram" bins=${ev.bins} summary=${t('analysis.cl.histSummary', { count: e.n, n: e.n, mean: formatPct(e.mean) })} />
      <${Disclosure} summary=${t('analysis.cl.clvTitle')}>
        <p class="an-text" data-testid="clv-text">${clvText(clv.stat)}</p>
        <${Dist} testId="clv-histogram" bins=${clv.bins} summary=${t('analysis.cl.clvSummary', { count: clv.stat.n, n: clv.stat.n, mean: formatPct(clv.stat.mean) })} />
      </${Disclosure}>
    </${Card}>

    <${Card} title=${t('analysis.cl.sourceTitle')} subtitle=${t('analysis.cl.sourceSub')}>
      <ul class="an-rows" data-testid="close-by-source">
        ${bySource.map(
          (r) => html`<li key=${r.key} data-key=${r.key}>
            <span class="an-row-name">${t(`analysis.cl.source.${r.key}`)}</span>
            <span class="an-row-figs num">
              <b class=${signClass(r.stat.mean)}>${evText(r.stat)}</b>
              ${rangeText(r.stat) ? html`<span class="an-dim">${rangeText(r.stat)}</span>` : null}
              ${r.stat.n ? html`<span class="an-dim">${t('analysis.cl.beatShort', { v: formatPct(r.stat.shareAbove, { sign: false }) })}</span>` : null}
            </span>
            <${VerdictChip} v=${closeVerdict(r.stat)} />
          </li>`,
        )}
      </ul>
    </${Card}>

    <${Card} title=${t('analysis.cl.movesTitle')} subtitle=${t('analysis.cl.movesSub')}>
      ${moves.length
        ? html`<div class="table-wrap an-table" data-testid="close-moves">
            <table class="table">
              <caption class="sr-only">${t('analysis.cl.movesTitle')}</caption>
              <thead><tr>
                <th scope="col">${t('analysis.dim.market')}</th>
                <th scope="col" class="ta-r">n</th>
                <th scope="col" class="ta-r">${t('analysis.cl.shortened')}</th>
                <th scope="col" class="ta-r">${t('analysis.cl.flat')}</th>
                <th scope="col" class="ta-r">${t('analysis.cl.drifted')}</th>
                <th scope="col" class="ta-r">${t('analysis.cl.meanClv')}</th>
                <th scope="col" class="ta-r">${t('stats.fairCloseEv')}</th>
              </tr></thead>
              <tbody>
                ${moves.map(
                  (m) => html`<tr key=${m.key} data-key=${m.key}>
                    <td class="an-td-label">${t(`markets.${m.key}`)}</td>
                    <td class="ta-r num">${m.n}</td>
                    <td class="ta-r num">${m.shortened}</td>
                    <td class="ta-r num">${m.flat}</td>
                    <td class="ta-r num">${m.drifted}</td>
                    <td class=${`ta-r num ${signClass(m.clv.mean)}`}>${formatPct(m.clv.mean)}</td>
                    <td class="ta-r num">${evText(m.fairCloseEv)}</td>
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>`
        : html`<p class="an-muted">${t('analysis.text.clvNone')}</p>`}
      <p class="an-note">${t('analysis.cl.movesNote')}</p>
    </${Card}>

    <${Card} title=${t('analysis.cl.pinTitle')} subtitle=${t('analysis.cl.pinSub')} testId="pinnacle-card">
      <div class="stats-row an-stats">
        <${Stat} label=${t('analysis.cl.towards')} value=${pin.counts.towards} sub=${`n ${pin.joined}`} testId="pin-towards" />
        <${Stat} label=${t('analysis.cl.away')} value=${pin.counts.away} sub=${`n ${pin.joined}`} testId="pin-away" />
        <${Stat} label=${t('analysis.cl.noMove')} value=${pin.counts.flat} sub=${`n ${pin.joined}`} />
        <${Stat} label=${t('analysis.cl.notJoined')} value=${pin.missing + pin.unknown} sub=${t('analysis.cl.ofWithId', { n: pin.withId })} />
      </div>
      <p class="an-text" data-testid="pin-text">${pinnacleText(pin)}</p>
      ${pin.rows.length
        ? html`<${Disclosure} summary=${t('analysis.cl.pinList', { count: pin.rows.length, n: pin.rows.length })}>
            <ul class="an-rows" data-testid="pin-rows">
              ${pin.rows.map(
                (r) => html`<li key=${r.pick.uid}>
                  <a class="an-row-name" href=${href(`/explorer/${encodeURIComponent(r.pick.uid)}`)}>${r.pick.match}<span class="an-dim"> · ${r.pick.selection} · ${formatDate(r.pick.date, 'short')}</span></a>
                  <span class="an-row-figs num">
                    <span>${formatPrice(Number(r.row.open_1))}/${formatPrice(Number(r.row.open_x))}/${formatPrice(Number(r.row.open_2))} → ${formatPrice(Number(r.row.last_1))}/${formatPrice(Number(r.row.last_x))}/${formatPrice(Number(r.row.last_2))}</span>
                    <span class="an-dim">${t('analysis.cl.pinProb', { open: formatPct(r.open, { sign: false }), last: formatPct(r.last, { sign: false }) })}</span>
                  </span>
                  <span class=${`chip chip-${r.direction === 'towards' ? 'won' : r.direction === 'away' ? 'lost' : 'neutral'}`}>${t(`analysis.cl.dir.${r.direction}`)}</span>
                </li>`,
              )}
            </ul>
          </${Disclosure}>`
        : null}
      <p class="an-note">${t('analysis.cl.pinNote')}</p>
    </${Card}>
  </div>`;
}
