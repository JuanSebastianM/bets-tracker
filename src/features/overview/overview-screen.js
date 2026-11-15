// Overview (#/, "Resumen"): how each source is doing, Sombra by tag and by market with a verdict
// against the close, what is pending, what changed since the last visit, the real-bets extras and the
// written summaries. Every figure comes from src/data/ (overview.js, stats.js, summaries.js).
import { html, useMemo, useEffect, useState } from '../../../vendor/preact.js';
import { t, useLocale } from '../../lib/i18n.js';
import { href, navigate } from '../../lib/router.js';
import { Card, Stat, Scoreboard, FeedGate, SegmentedControl, Chip, Button, Icon, TagGlossaryLinks, VerdictChip } from '../../lib/ui/index.js';
import { MARKET_SLUGS } from '../../lib/glossary-links.js';
import { Sparkline, LineChart } from '../../lib/charts/index.js';
import { formatPct, formatUnits, formatPrice, formatRecord, formatDate, formatAgo, todayIn } from '../../lib/format.js';
import { readJSON, writeJSON } from '../../lib/storage.js';
import { APP_TIMEZONE } from '../../config.js';
import { defaultFilters, toQueryString, resolveDates } from '../../data/filters.js';
import { tagLabel } from '../../data/tags.js';
import { useSettings, updateSettings, settingsStore, bankrollUnits } from '../../data/settings.js';
import {
  SOURCES, PERIODS, VERDICT_MIN_N, periodFromQuery, periodFilter, picksInPeriod, lastGradedSlate, closeVerdict, shadowTagRows,
  shadowMarketRows, bestWorst, rangeAxis, axisPct, sourceSummary, cumulativeUnits, realBetsExtras, slateReport, upcomingPending,
  overduePending, visitSnapshot, sinceLastVisit, shadowTagLineRows,
} from '../../data/overview.js';
import { lineLabel } from '../../data/lines.js';
import {
  describeSource, describeResultsVsClose, describeBestWorst, describeLastSlate, describePending, describeSinceVisit, describeRealBets,
  verdictLabel,
} from '../../data/summaries.js';

/** @typedef {import('../../data/types').Pick} Pick */
/** @typedef {import('../../data/types').Source} Source */
/** @typedef {import('../../data/overview.js').Period} Period */
/** @typedef {import('../../data/overview.js').GroupRow} GroupRow */

/** localStorage key (with the app prefix) of what the last visit saw; stays on this device. */
const VISIT_KEY = 'overview.visit';
/** How long the screen must be on screen before the visit counts as seen. */
const SEEN_AFTER_MS = 1500;

/**
 * The previous visit, read once per app session: browsing away and back keeps the same "since your
 * last visit" until the app is opened again.
 * @type {{ lastVisit: string | null, snapshot: any } | undefined}
 */
let sessionBase;

function useVisitBase() {
  const [base] = useState(() => {
    if (sessionBase === undefined) sessionBase = { lastVisit: settingsStore.get().lastVisit, snapshot: readJSON(VISIT_KEY, null) };
    return sessionBase;
  });
  return base;
}

/**
 * Record the visit once the screen has been visible for a moment (and again when a newer dataset is
 * shown), never on every render.
 * @param {import('../../data/types').Dataset} data
 */
function useMarkSeen(data) {
  useEffect(() => {
    /** @type {any} */
    let timer = null;
    const write = () => {
      const at = new Date().toISOString();
      writeJSON(VISIT_KEY, visitSnapshot(data.picks, at));
      updateSettings({ lastVisit: at });
    };
    const arm = () => {
      if (document.visibilityState !== 'visible' || timer) return;
      timer = setTimeout(write, SEEN_AFTER_MS);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') arm();
      else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    arm();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (timer) clearTimeout(timer);
    };
  }, [data]);
}

/** Explorer-style query string: period + extra filter fields. */
function qs(/** @type {Partial<import('../../data/filters.js').FilterState>} */ extra) {
  return toQueryString({ ...defaultFilters(), ...extra });
}

// ---------------------------------------------------------------- per source

/** @param {{ source: Source, picks: Pick[], period: Period, periodPart: object }} props */
function SourceCard({ source, picks, periodPart }) {
  const mine = useMemo(() => picks.filter((p) => p.source === source), [picks, source]);
  const s = useMemo(() => sourceSummary(mine, source), [mine, source]);
  const curve = useMemo(() => cumulativeUnits(mine).map((p) => p.cum), [mine]);
  const verdict = closeVerdict(s.fairCloseEv);
  const label = t(`sources.${source}`);
  const e = s.fairCloseEv;
  return html`<${Card}
    title=${label}
    subtitle=${t(`overview.sub.${source}`)}
    testId=${`source-${source}`}
    class="ov-source"
    action=${html`<${Sparkline} values=${curve} width=${104} height=${32} summary=${t('overview.sparkline', { source: label, profit: formatUnits(s.profit), n: s.n })} />`}
  >
    <${Scoreboard} won=${s.won} lost=${s.lost} void=${s.void} halfWon=${s.halfWon} halfLost=${s.halfLost} size="md" />
    <div class="stats-row ov-stats">
      <${Stat} label=${t('stats.units')} value=${formatUnits(s.profit)} tone=${s.profit > 0 ? 'won' : s.profit < 0 ? 'lost' : 'plain'} testId=${`units-${source}`} />
      <${Stat} label=${t('stats.yield')} value=${formatPct(s.yield)} sub=${t('stats.nGraded', { n: s.n })} />
      <${Stat}
        label=${t('overview.hit')}
        value=${formatPct(s.hitRate, { sign: false })}
        sub=${s.breakEven != null ? `${t('overview.needs', { be: formatPct(s.breakEven, { sign: false }) })} · n ${s.n}` : `n ${s.n}`}
      />
      <${Stat}
        label=${t('stats.fairCloseEv')}
        value=${formatPct(e.mean)}
        sub=${e.lo != null ? `${t('overview.evRange', { lo: formatPct(e.lo), hi: formatPct(e.hi) })} · n ${e.n}` : t('stats.nClose', { n: e.n })}
      />
      <${Stat} label=${t('stats.pending')} value=${s.pending} tone=${s.pending ? 'pending' : 'plain'} />
      <div class="ov-verdict-stat">
        <div class="stat-label">${t('overview.verdict')}</div>
        <${VerdictChip} v=${verdict} />
      </div>
    </div>
    <p class="ov-text" data-testid=${`summary-${source}`}>${describeSource(label, s, verdict)}</p>
    <a class="link-btn ov-link" href=${href(`/explorer?${qs({ ...periodPart, sources: [source] })}`)}>${t('overview.seePicks')}</a>
  </${Card}>`;
}

// ---------------------------------------------------------------- group table (tags, markets)

/**
 * Under a tag row: its lines (n, record, yield, EV vs close with n, verdict), collapsed by default.
 * @param {{ label: string, rows: GroupRow[], linkOf: (lineKey: string) => string, tag: string }} props
 */
function LineRows({ label, rows, linkOf, tag }) {
  const scoped = new Set(rows.map((r) => r.key.split(':')[0])).size > 1;
  return html`<details class="ov-lines" data-testid=${`tag-lines-${tag}`}>
    <summary class="ov-lines-sum"><${Icon} name="chevron-down" size=${14} /><span>${t('overview.lines.summary', { count: rows.length, n: rows.length })}</span></summary>
    <ul class="ov-llist" aria-label=${t('overview.lines.title', { label })}>
      ${rows.map((r) => {
        const s = r.summary;
        const e = s.fairCloseEv;
        const line = lineLabel(r.key, { scope: scoped });
        const ev = e.n ? t('overview.lines.evN', { ev: formatPct(e.mean), n: e.n }) : t('overview.lines.noClose');
        return html`<li key=${r.key}>
          <a class="ov-lrow" href=${linkOf(r.key)} data-key=${r.key}
            aria-label=${t('overview.lines.rowLabel', { line, n: s.n, record: formatRecord(s), yield: formatPct(s.yield), ev, verdict: verdictLabel(r.verdict) })}>
            <span class="ov-lname">${line}</span>
            <span class="ov-lmeta num">${t('overview.tags.meta', { n: s.n, record: formatRecord(s), yield: formatPct(s.yield) })}</span>
            <span class="ov-lev num">${ev}</span>
            <span class="ov-lverdict"><${VerdictChip} v=${r.verdict} /></span>
          </a>
        </li>`;
      })}
    </ul>
  </details>`;
}

/**
 * @param {{ rows: GroupRow[], labelOf: (k: string) => string, linkOf: (k: string) => string, testId: string, compact?: boolean,
 *   linesOf?: Record<string, GroupRow[]>, lineLinkOf?: (k: string, lineKey: string) => string }} props
 */
function GroupTable({ rows, labelOf, linkOf, testId, compact = false, linesOf, lineLinkOf }) {
  const axis = rangeAxis(rows);
  const zero = axisPct(0, axis);
  if (!rows.length) return html`<p class="ov-muted">${t('overview.tags.empty')}</p>`;
  return html`<div class=${`ov-groups${compact ? ' ov-groups-compact' : ''}`} data-testid=${testId}>
    <p class="sr-only">${t('overview.tags.axis', { min: formatPct(axis.min), max: formatPct(axis.max) })}</p>
    <ol class="ov-glist">
      ${rows.map((r) => {
        const s = r.summary;
        const e = s.fairCloseEv;
        const label = labelOf(r.key);
        const aria = t('overview.tags.rowLabel', {
          label,
          verdict: verdictLabel(r.verdict),
          record: formatRecord(s),
          yield: formatPct(s.yield),
          n: s.n,
          ev: e.n ? formatPct(e.mean) : t('overview.tags.noClose'),
          nClose: e.n,
        });
        const hasRange = e.lo != null && e.hi != null;
        return html`<li key=${r.key}>
          <a class="ov-grow" href=${linkOf(r.key)} aria-label=${aria} data-key=${r.key}>
            <span class="ov-gname">${label}</span>
            <span class="ov-gmeta num">${t('overview.tags.meta', { n: s.n, record: formatRecord(s), yield: formatPct(s.yield) })}</span>
            <span class="ov-gbar" aria-hidden="true">
              <i class="ov-gzero" style=${{ left: `${zero}%` }}></i>
              ${hasRange
                ? html`<i class="ov-grange" style=${{ left: `${axisPct(e.lo, axis)}%`, width: `${Math.max(1, axisPct(e.hi, axis) - axisPct(e.lo, axis))}%` }}></i>`
                : null}
              ${e.mean != null ? html`<i class="ov-gdot" style=${{ left: `${axisPct(e.mean, axis)}%` }}></i>` : null}
            </span>
            <span class="ov-gev num">
              ${e.n ? html`<b>${t('overview.tags.ev', { ev: formatPct(e.mean) })}</b> <span>${t('overview.tags.evN', { n: e.n })}</span>` : html`<span>${t('overview.tags.noClose')}</span>`}
            </span>
            <span class="ov-gverdict"><${VerdictChip} v=${r.verdict} /></span>
            <${Icon} name="chevron-right" size=${16} />
          </a>
          ${linesOf && lineLinkOf && linesOf[r.key]
            ? html`<${LineRows} label=${label} tag=${r.key} rows=${linesOf[r.key]} linkOf=${(/** @type {string} */ lk) => lineLinkOf(r.key, lk)} />`
            : null}
        </li>`;
      })}
    </ol>
  </div>`;
}

// ---------------------------------------------------------------- pending

const MAX_PENDING_SHOWN = 6;

/** @param {{ groups: ReturnType<typeof upcomingPending>, today: string, overdue: number }} props */
function PendingCard({ groups, today, overdue }) {
  return html`<${Card} title=${t('overview.pending.title')} testId="overview-pending">
    ${!groups.length ? html`<p class="ov-muted">${t('overview.pending.empty')}</p>` : null}
    ${groups.map(
      (g) => html`<div class="ov-pgroup" data-date=${g.date}>
        <div class="ov-phead">
          <h3 class="ov-pdate">${g.date === today ? `${t('overview.pending.today')} · ${formatDate(g.date, 'short')}` : formatDate(g.date, 'medium')}</h3>
          <span class="ov-pcounts">
            ${SOURCES.filter((src) => g.bySource[src]).map((src) => html`<${Chip} tone="pending">${t(`sources.${src}`)} ${g.bySource[src]}</${Chip}>`)}
          </span>
        </div>
        <ul class="ov-plist">
          ${g.picks.slice(0, MAX_PENDING_SHOWN).map(
            (p) => html`<li class="ov-pick">
              <span class="ov-psrc">${t(`sources.${p.source}`)}${p.time ? ` · ${p.time}` : ''}</span>
              <span class="ov-pwhat"><span class="ov-pmatch">${p.match}</span><span class="ov-psel">${p.marketRaw} · ${p.selection}</span></span>
              <span class="ov-pprice num">${formatPrice(p.price)}</span>
            </li>`,
          )}
        </ul>
        <a class="link-btn ov-link" href=${href(`/explorer?${qs({ slate: g.date, statuses: ['pending'] })}`)}>
          ${g.picks.length > MAX_PENDING_SHOWN ? `${t('overview.pending.more', { count: g.picks.length - MAX_PENDING_SHOWN, n: g.picks.length - MAX_PENDING_SHOWN })} · ` : ''}${t('overview.pending.seeAll', { count: g.picks.length, n: g.picks.length })}
        </a>
      </div>`,
    )}
    ${overdue ? html`<p class="ov-muted">${t('overview.pending.overdue', { count: overdue, n: overdue })}</p>` : null}
  </${Card}>`;
}

// ---------------------------------------------------------------- real bets

/** @param {{ bets: Pick[], bankrollU: number | null }} props */
function RealBetsCard({ bets, bankrollU }) {
  const x = useMemo(() => realBetsExtras(bets, bankrollU), [bets, bankrollU]);
  const sentence = t('overview.real.chart', { total: formatUnits(x.total), dd: formatUnits(x.maxDrawdownU, { sign: false }) });
  const table = {
    columns: [
      { key: 'date', label: t('overview.real.colDate'), render: (/** @type {any} */ d) => formatDate(d.date, 'medium') },
      { key: 'n', label: t('overview.real.colN'), num: true },
      { key: 'profit', label: t('overview.real.colProfit'), num: true, render: (/** @type {any} */ d) => formatUnits(d.profit) },
      { key: 'cum', label: t('overview.real.colCum'), num: true, render: (/** @type {any} */ d) => formatUnits(d.cum) },
    ],
    rows: x.days.map((d) => ({ ...d, key: d.date })),
  };
  const day = (/** @type {any} */ d) => (d ? `${formatUnits(d.profit)}` : t('overview.real.none'));
  return html`<${Card} title=${t('overview.real.title')} subtitle=${t('overview.real.sub')} testId="overview-real">
    <p class="ov-text" data-testid="real-summary">${describeRealBets(x)}</p>
    ${x.days.length
      ? html`<${LineChart}
          values=${x.days.map((d) => d.cum)}
          labels=${x.days.map((d) => formatDate(d.date, 'short'))}
          shadeDrawdown
          height=${160}
          yFormat=${(/** @type {number} */ v) => formatUnits(v, { suffix: '' })}
          summary=${sentence}
          table=${table}
          testId="real-chart"
        />`
      : null}
    <div class="stats-row ov-stats">
      <${Stat}
        label=${t('overview.real.currentDd')}
        value=${formatUnits(x.currentDrawdownU, { sign: false })}
        sub=${x.currentDrawdownPct != null ? t('overview.real.ofBank', { pct: formatPct(x.currentDrawdownPct, { sign: false }) }) : t('overview.real.noBank')}
        testId="real-current-dd"
      />
      <${Stat}
        label=${t('overview.real.maxDd')}
        value=${formatUnits(x.maxDrawdownU, { sign: false })}
        sub=${x.maxDrawdownPct != null ? t('overview.real.ofBank', { pct: formatPct(x.maxDrawdownPct, { sign: false }) }) : null}
      />
      <${Stat} label=${t('overview.real.avgStake')} value=${x.avgStake == null ? '–' : formatUnits(x.avgStake, { sign: false })} sub=${`n ${x.stakeN}`} />
      <${Stat} label=${t('overview.real.bestDay')} value=${day(x.best)} sub=${x.best ? formatDate(x.best.date, 'short') : null} tone=${x.best ? 'won' : 'plain'} />
      <${Stat} label=${t('overview.real.worstDay')} value=${day(x.worst)} sub=${x.worst ? formatDate(x.worst.date, 'short') : null} tone=${x.worst ? 'lost' : 'plain'} />
    </div>
  </${Card}>`;
}

// ---------------------------------------------------------------- since the last visit

/** @param {{ r: NonNullable<ReturnType<typeof sinceLastVisit>> }} props */
function SinceCard({ r }) {
  return html`<${Card} title=${t('overview.since.title')} subtitle=${t('overview.since.when', { ago: formatAgo(r.since) })} tone="accent" testId="overview-since">
    ${r.sources.length
      ? html`<div class="ov-since">
          ${r.sources.map(
            (x) => html`<div class="ov-since-src" data-source=${x.source}>
              <span class="ov-since-name">${t(`sources.${x.source}`)}</span>
              <span class="num ov-since-rec">${formatRecord(x.summary)}</span>
              <span class=${`num ov-since-pl ${x.summary.profit > 0 ? 'pos' : x.summary.profit < 0 ? 'neg' : ''}`}>${formatUnits(x.summary.profit)}</span>
            </div>`,
          )}
        </div>`
      : null}
    <p class="ov-text" data-testid="since-summary">${describeSinceVisit(r)}</p>
  </${Card}>`;
}

// ---------------------------------------------------------------- screen

/** @param {{ data: import('../../data/types').Dataset, query: Record<string, string> }} props */
function Overview({ data, query }) {
  useLocale();
  const settings = useSettings();
  const base = useVisitBase();
  useMarkSeen(data);
  const today = todayIn(APP_TIMEZONE);
  const period = periodFromQuery(query);
  const all = data.picks;

  const periodPart = useMemo(() => periodFilter(period, all), [period, all]);
  const picks = useMemo(() => picksInPeriod(all, period, { today }), [all, period, today]);
  const tagRows = useMemo(() => shadowTagRows(picks), [picks]);
  const tagLines = useMemo(() => shadowTagLineRows(picks), [picks]);
  const marketRows = useMemo(() => shadowMarketRows(picks), [picks]);
  const summaries = useMemo(() => SOURCES.map((source) => ({ source, summary: sourceSummary(picks, source) })), [picks]);
  const lastSlate = useMemo(() => slateReport(all, lastGradedSlate(all)), [all]);
  const pendingGroups = useMemo(() => upcomingPending(all, today), [all, today]);
  const overdue = useMemo(() => overduePending(all, today), [all, today]);
  const since = useMemo(() => sinceLastVisit(all, base.lastVisit, base.snapshot, { timeZone: APP_TIMEZONE }), [all, base]);
  const bets = useMemo(() => picks.filter((p) => p.source === 'bets'), [picks]);
  const bankrollU = bankrollUnits(settings);

  const periodQs = qs(periodPart);
  const withPeriod = (/** @type {string} */ path) => href(periodQs ? `${path}?${periodQs}` : path);
  const setPeriod = (/** @type {string} */ v) => navigate(v === 'all' ? '/' : `/?date=${v}`, { replace: true });

  const gaps = summaries
    .map((x) => ({ source: x.source, text: describeResultsVsClose(x.summary, closeVerdict(x.summary.fairCloseEv)) }))
    .filter((x) => x.text && x.text !== t('summaries.bothGood'));

  const [from, to] = resolveDates({ ...defaultFilters(), ...periodPart }, { today, lastSlate: null });
  const periodNote =
    period === 'all'
      ? t('overview.period.allTime')
      : periodPart.slate
        ? t('overview.period.slateOf', { date: formatDate(periodPart.slate, 'medium') })
        : t('overview.period.range', { from: formatDate(from, 'short'), to: formatDate(to, 'short') });

  return html`
    <div class="ov-period" data-testid="overview-period">
      <${SegmentedControl}
        label=${t('overview.period.label')}
        hideLabel
        value=${period}
        options=${PERIODS.map((p) => ({ value: p, label: t(`overview.period.${p}`) }))}
        onValue=${setPeriod}
        name="period"
      />
      <p class="ov-period-note" data-testid="period-note">${periodNote}</p>
    </div>

    ${since && (since.graded.length || since.added) ? html`<${SinceCard} r=${since} />` : null}

    <${Card} title=${t('overview.brief.title')} testId="overview-brief" class="ov-brief">
      <ul class="ov-brief-list">
        <li data-testid="brief-last-slate">${describeLastSlate(lastSlate)}</li>
        <li data-testid="brief-pending">${describePending(pendingGroups, today)}</li>
        <li data-testid="brief-tags">${describeBestWorst(bestWorst(tagRows), (k) => tagLabel(/** @type {any} */ (k)), VERDICT_MIN_N)}</li>
        ${gaps.map((g) => html`<li data-testid=${`brief-gap-${g.source}`}>${t('overview.brief.gap', { source: t(`sources.${g.source}`), text: g.text })}</li>`)}
      </ul>
    </${Card}>

    <div class="ov-sources">
      ${SOURCES.map((src) => html`<${SourceCard} key=${src} source=${src} picks=${picks} period=${period} periodPart=${periodPart} />`)}
    </div>

    <${PendingCard} groups=${pendingGroups} today=${today} overdue=${overdue} />

    <${Card} title=${t('overview.tags.title')} subtitle=${t('overview.tags.sub', { min: VERDICT_MIN_N })} testId="overview-tags">
      <${GroupTable}
        rows=${tagRows}
        labelOf=${(/** @type {string} */ k) => tagLabel(/** @type {any} */ (k))}
        linkOf=${(/** @type {string} */ k) => href(`/explorer?${qs({ ...periodPart, sources: ['shadow'], tags: [k] })}`)}
        testId="tag-table"
        linesOf=${tagLines}
        lineLinkOf=${(/** @type {string} */ k, /** @type {string} */ lk) => href(`/explorer?${qs({ ...periodPart, sources: ['shadow'], tags: [k], lines: [lk] })}`)}
      />
      <${TagGlossaryLinks} tags=${tagRows.map((r) => r.key)} testId="overview-tag-glossary" />
    </${Card}>

    <${Card} title=${t('overview.tags.markets')} subtitle=${t('overview.tags.marketsSub')} testId="overview-markets">
      <${GroupTable}
        rows=${marketRows}
        labelOf=${(/** @type {string} */ k) => t(`markets.${k}`)}
        linkOf=${(/** @type {string} */ k) => href(`/explorer?${qs({ ...periodPart, sources: ['shadow'], markets: [k] })}`)}
        testId="market-table"
        compact
      />
      <${TagGlossaryLinks} items=${marketRows.filter((r) => MARKET_SLUGS[r.key]).map((r) => ({ slug: MARKET_SLUGS[r.key], label: t(`markets.${r.key}`) }))}
        label=${t('links.inGlossary')} testId="overview-market-glossary" />
    </${Card}>

    <${RealBetsCard} bets=${bets} bankrollU=${bankrollU} />

    <nav class="ov-links" aria-label=${t('overview.links.title')} data-testid="overview-links">
      <${Button} variant="primary" icon="explorer" href=${withPeriod('/explorer')}>${t('overview.links.picks')}</${Button}>
      <${Button} icon="simulator" href=${withPeriod('/simulator')}>${t('overview.links.simulate')}</${Button}>
      <${Button} icon="tests" href=${withPeriod('/tests')}>${t('overview.links.tests')}</${Button}>
    </nav>
  `;
}

/** @param {{ query: Record<string, string> }} props */
export function OverviewScreen({ query = {} }) {
  return html`<div class="overview stack">
    <${FeedGate}>${(data) => html`<${Overview} data=${data} query=${query} />`}</${FeedGate}>
  </div>`;
}
