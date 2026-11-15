// The Tests section (#/tests): the overview strip, how to read it, the next Sombra review, the frozen
// tests (Decisiones row 111), the price-first tests (rows 79, 80, 97, 108) and the stopped categories.
// Every figure comes from src/data/tests-config.js and src/data/stats.js.
import { html, useMemo, useEffect, useRef } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { href, navigate } from '../../lib/router.js';
import { Card, FeedGate, DataTable, Disclosure, TagBadge } from '../../lib/ui/index.js';
import { formatDate, formatPct, formatRecord, todayIn } from '../../lib/format.js';
import { formatNumber } from '../../lib/i18n.js';
import { APP_TIMEZONE } from '../../config.js';
import { defaultFilters, toQueryString } from '../../data/filters.js';
import {
  FROZEN_RULE, FROZEN_TESTS, SHADOW_REVIEW, frozenProgress, nextShadowReview, frozenProjection, waitingFor,
  testsOverview, shadowReviewHistory, shadowReviewParts, PRICE_FIRST_TESTS, priceFirstProgress, VALUE_RULE, PROP_RULE,
  STOPPED_CATEGORIES, stoppedSummary,
} from '../../data/tests-config.js';
import { Meter, StateChip, EvStrip, MiniEv, MiniBar, TermSentence, tagSlug, decisionHref } from './tests-parts.js';
import { Icon } from '../../lib/ui/index.js';

/** @typedef {import('../../data/types').Dataset} Dataset */
/** @typedef {ReturnType<typeof frozenProgress>} FrozenProgress */

/** @param {Partial<import('../../data/filters.js').FilterState>} f */
const explorerHref = (f) => href(`/explorer?${toQueryString({ ...defaultFilters(), ...f })}`);
const z2 = (/** @type {number | null} */ z) => (z == null ? '–' : formatNumber(z, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }, 'en').replace('-', '−'));
/** Link that opens one test in the list (`#/tests?open=<id>`). @param {string} id */
export const testHref = (id) => href(`/tests?open=${encodeURIComponent(id)}`);
const shareText = (/** @type {number} */ s) => formatPct(s, { sign: false, digits: 0 });

// ---------------------------------------------------------------- overview strip

/** @param {{ list: FrozenProgress[] }} props */
function OverviewStrip({ list }) {
  const o = testsOverview(list);
  return html`<section class="tests-overview" aria-label=${t('tests.strip.label')} data-testid="tests-overview">
    <div class="tests-ov-item">
      <span class="tests-ov-num num">${o.collecting}</span>
      <span class="tests-ov-label">${t('tests.strip.collecting', { count: o.collecting })}</span>
    </div>
    <div class="tests-ov-item">
      <span class="tests-ov-num num">${o.ready}</span>
      <span class="tests-ov-label">${t('tests.strip.ready', { count: o.ready })}</span>
    </div>
    <div class="tests-ov-item tests-ov-closest">
      <span class="tests-ov-label">${t('tests.strip.closest')}</span>
      ${o.closest
        ? html`<a class="tests-ov-link" href=${testHref(o.closest.test.id)}>${o.closest.test.sheetLabel}</a>
            <span class="tests-ov-sub num">${t('tests.strip.closestValue', { share: shareText(o.closestShare) })}</span>`
        : html`<span class="tests-ov-sub">${t('tests.strip.none')}</span>`}
    </div>
  </section>`;
}

// ---------------------------------------------------------------- how to read

function HowToRead() {
  return html`<div class="tests-howto" data-testid="tests-howto">
    <${Disclosure} summary=${t('tests.howTo.summary')}>
      <h3>${t('tests.howTo.priceTitle')}</h3>
      <${TermSentence} k="tests.howTo.price" termKey="tests.howTo.termFairClose" slug="fair-close-ev" />
      <h3>${t('tests.howTo.seTitle')}</h3>
      <${TermSentence} k="tests.howTo.se" termKey="tests.howTo.termSe" slug="standard-error" />
      <h3>${t('tests.howTo.onceTitle')}</h3>
      <p>${t('tests.howTo.once')}</p>
      <h3>${t('tests.howTo.barsTitle')}</h3>
      <p>${t('tests.howTo.bars')}</p>
      <h3>${t('tests.frozenTitle')}</h3>
      <p>${t('tests.frozen.intro', { graded: FROZEN_RULE.minGraded, stake: FROZEN_RULE.passStakeU })} <a href=${decisionHref(FROZEN_RULE.decisionRow)}>${t('tests.frozen.decision', { row: FROZEN_RULE.decisionRow })}</a></p>
      <h3>${t('tests.priceFirst.title')}</h3>
      <p>${t('tests.priceFirst.intro')}</p>
      <p class="tests-muted">${t('tests.frozen.explorerHint')}</p>
    </${Disclosure}>
  </div>`;
}

// ---------------------------------------------------------------- next review

/** @param {{ data: Dataset, today: string }} props */
function NextReview({ data, today }) {
  const r = useMemo(() => nextShadowReview(data.decisions, data.picks, today), [data, today]);
  const parts = shadowReviewParts(r);
  const history = useMemo(() => shadowReviewHistory(data.decisions), [data]);
  let left = '';
  if (parts && !r.due) {
    if (r.daysLeft && r.rowsLeft) left = t('tests.review.left', { days: r.daysLeft, rows: r.rowsLeft });
    else if (r.daysLeft) left = t('tests.review.leftDays', { count: r.daysLeft, n: r.daysLeft });
    else left = t('tests.review.leftRows', { count: r.rowsLeft, n: r.rowsLeft });
  }
  return html`<${Card}
    title=${t('tests.reviewTitle')}
    testId="next-review"
    tone=${r.due ? 'accent' : 'plain'}
    action=${parts ? html`<span class=${`chip ${r.due ? 'chip-accent' : 'chip-neutral'}`} data-testid="review-state">${r.due ? t('tests.review.dueNow') : t('tests.review.notDue')}</span>` : null}
  >
    ${parts
      ? html`<div class="tests-meters">
            <${Meter} label=${t('tests.review.days')} value=${parts.days} total=${SHADOW_REVIEW.minDays} met=${parts.daysMet}
              text=${t('tests.review.ofDays', { n: parts.days, total: SHADOW_REVIEW.minDays })} testId="review-days" />
            <${Meter} label=${t('tests.review.rows')} value=${parts.rows} total=${SHADOW_REVIEW.minNewGraded} met=${parts.rowsMet}
              text=${t('tests.review.ofRows', { n: parts.rows, total: SHADOW_REVIEW.minNewGraded })} testId="review-rows" />
          </div>
          <p data-testid="review-when">${r.due ? t('tests.review.dueBody') : html`${t('tests.review.dueWhen', { date: formatDate(r.dueDate), rows: r.dueRows, graded: r.graded })} <strong>${left}</strong>`}</p>`
      : html`<p>${t('tests.reviewUnknown')}</p>`}
    <${Disclosure} summary=${t('tests.review.more')}>
      <p class="tests-rule">${t('tests.review.rule', { days: SHADOW_REVIEW.minDays, rows: SHADOW_REVIEW.minNewGraded })}</p>
      ${parts ? html`<p class="tests-muted">${t('tests.review.last', { topic: (history.find((h) => h.row === r.last.decisionRow) || { topic: '' }).topic, date: formatDate(r.last.date) })}</p>` : null}
      <h3 class="tests-h3">${t('tests.review.history')}</h3>
      ${history.length
        ? html`<ul class="tests-history-list" data-testid="review-history">
            ${history.map(
              (h) => html`<li>
                <a href=${decisionHref(h.row)}><span>${h.topic}</span><span class="tests-muted num">${formatDate(h.date)}</span></a>
              </li>`,
            )}
          </ul>`
        : html`<p class="tests-muted">${t('tests.review.historyEmpty')}</p>`}
    </${Disclosure}>
  </${Card}>`;
}

// ---------------------------------------------------------------- frozen tests

/** The expanded content of a frozen test. @param {{ p: FrozenProgress, today: string }} props */
function FrozenDetail({ p, today }) {
  const proj = useMemo(() => frozenProjection(p, today), [p, today]);
  const { test, ev, summary: s } = p;
  const wait = waitingFor(p);
  const start = test.startDate ? t('tests.frozen.since', { date: formatDate(test.startDate) })
    : p.firstDate ? t('tests.frozen.sinceFirst', { date: formatDate(p.firstDate) }) : t('tests.frozen.sinceNone');
  const z = z2(ev.z);
  let rule;
  if (p.state === 'pass') rule = t('tests.frozen.rulePass', { z, stake: FROZEN_RULE.passStakeU });
  else if (p.state === 'stop') rule = t('tests.frozen.ruleStop', { z });
  else if (wait === 'closes') rule = t('tests.frozen.ruleCollectingCloses', { graded: FROZEN_RULE.minGraded, close: FROZEN_RULE.minWithClose });
  else rule = t('tests.frozen.ruleCollecting', { graded: FROZEN_RULE.minGraded, close: FROZEN_RULE.minWithClose });
  const chartSummary = ev.mean == null ? '' : ev.lo == null ? t('tests.frozen.chartNone')
    : t('tests.frozen.chart', { mean: formatPct(ev.mean), lo: formatPct(ev.lo), hi: formatPct(ev.hi), n: ev.n });
  let projText;
  if (proj.reached) projText = t('tests.frozen.projectionReached');
  else if (proj.date) projText = t('tests.frozen.projection', { date: formatDate(proj.date), days: proj.windowDays });
  else projText = t('tests.frozen.projectionNone', { days: Math.max(1, proj.windowDays) });
  return html`<div class="tests-detail" data-testid=${`detail-${test.id}`}>
    <p class="tests-what">${t(`tests.frozen.what.${test.id}`)}</p>
    <p class="tests-muted tests-since">${start}${p.pending ? html`<span class="tests-pending num">${t('tests.frozen.pending', { count: p.pending, n: p.pending })}</span>` : null}
      ${p.withClose ? html`<span class="num">${t('tests.frozen.closeSources', { own: p.withCloseSameBook, feed: p.withCloseFeed })}</span>` : null}</p>
    <div class="tests-measure">
      <div class="tests-measure-head">
        <span class="tests-measure-label">${t('tests.frozen.measure')}</span>
        ${ev.mean != null
          ? html`<span class="tests-measure-value num" data-testid=${`ev-${test.id}`}>${t('tests.frozen.measureValue', { mean: formatPct(ev.mean), n: ev.n })}</span>`
          : null}
      </div>
      ${ev.mean != null
        ? html`<${EvStrip} mean=${ev.mean} lo=${ev.lo} hi=${ev.hi} summary=${chartSummary} />
            <p class="tests-small num">${ev.lo != null ? t('tests.frozen.interval', { lo: formatPct(ev.lo), hi: formatPct(ev.hi) }) : t('tests.frozen.chartNone')}
              ${ev.z != null ? html` <span class="tests-z">${t('tests.frozen.z', { z })}</span>` : null}</p>`
        : html`<p class="tests-muted">${t('tests.frozen.noMeasure')}</p>`}
    </div>
    <p class="tests-rule" data-testid=${`rule-${test.id}`}>${rule}</p>
    <div class="tests-context">
      <span class="tests-context-label">${t('tests.frozen.context')}</span>
      <span class="num">${t('tests.frozen.contextLine', { record: formatRecord(s), yield: formatPct(s.yield), hit: formatPct(s.hitRate, { sign: false }), n: s.n })}</span>
    </div>
    <p class="tests-projection" data-testid=${`projection-${test.id}`}>${projText}${!proj.reached && proj.date
      ? html` <span class="tests-muted num">(${t('tests.frozen.projectionPace', { graded: formatNumber(proj.graded.perDay, { maximumFractionDigits: 1 }, 'en'), close: formatNumber(proj.withClose.perDay, { maximumFractionDigits: 1 }, 'en') })})</span>`
      : null}</p>
    <div class="tests-links">
      <a class="btn btn-secondary tests-link" href=${explorerHref(test.explorer || {})} data-testid=${`explorer-${test.id}`}>${t('tests.frozen.explorer')}</a>
      ${test.decisionRow ? html`<a class="link-btn tests-link-sm" href=${decisionHref(test.decisionRow)}>${t('tests.frozen.decision', { row: test.decisionRow })}</a>` : null}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- price-first tests

/** One row of the lines table. */
const lineRow = (/** @type {string} */ key, /** @type {string} */ label, /** @type {any} */ l) => ({ key, label, n: l.summary.n, s: l.summary, ev: l.ev });
const lineColumns = (/** @type {string} */ firstLabel) => [
  { key: 'label', label: firstLabel, render: (/** @type {any} */ r) => r.label },
  { key: 'n', label: t('tests.priceFirst.colN'), num: true, render: (/** @type {any} */ r) => r.n, sortValue: (/** @type {any} */ r) => r.n },
  { key: 'rec', label: t('tests.priceFirst.colRecord'), num: true, render: (/** @type {any} */ r) => formatRecord(r.s) },
  { key: 'y', label: t('tests.priceFirst.colYield'), num: true, render: (/** @type {any} */ r) => formatPct(r.s.yield), sortValue: (/** @type {any} */ r) => r.s.yield ?? -Infinity },
  { key: 'ev', label: t('tests.priceFirst.colEv'), num: true, render: (/** @type {any} */ r) => `${formatPct(r.ev.mean)} (${r.ev.n})`, sortValue: (/** @type {any} */ r) => r.ev.mean ?? -Infinity },
];

/** The expanded content of a price-first test. @param {{ p: any }} props ReturnType<typeof priceFirstProgress> (a union of the value and prop shapes) */
function PriceFirstDetail({ p }) {
  const { test } = p;
  const isValue = p.kind === 'value';
  const gate = p.gateLine;
  const ev = gate.ev;
  const lo = isValue ? ev.lo : p.all.lo95;
  const hi = isValue ? ev.hi : p.all.hi95;
  const s = p.all.summary;
  let stateText = '';
  if (isValue) {
    if (p.decisionCase) stateText = t(`tests.priceFirst.case.${p.decisionCase}`);
    else if (test.rule !== 'context') stateText = t('tests.priceFirst.valueCollecting', { total: VALUE_RULE.minWithEv });
  }
  else if (test.rule !== 'context') {
    stateText = t(`tests.priceFirst.propState.${p.state}`, { target: p.target, stake: PROP_RULE.passStakeU, first: PROP_RULE.firstLook, final: PROP_RULE.finalLook });
  }
  const ruleText = t(`tests.priceFirst.rule.${test.id}`, { first: PROP_RULE.firstLook, final: PROP_RULE.finalLook, stake: PROP_RULE.passStakeU });
  const intervalText = lo == null ? t('tests.frozen.chartNone')
    : isValue ? t('tests.frozen.interval', { lo: formatPct(lo), hi: formatPct(hi) }) : t('tests.priceFirst.interval95', { lo: formatPct(lo), hi: formatPct(hi) });
  const chartSummary = ev.mean == null ? '' : lo == null ? t('tests.frozen.chartNone') : t('tests.frozen.chart', { mean: formatPct(ev.mean), lo: formatPct(lo), hi: formatPct(hi), n: ev.n });
  const lines = isValue
    ? [lineRow('le4', t('tests.priceFirst.lineLe4'), p.le4), lineRow('le3', t('tests.priceFirst.lineLe3'), p.le3), lineRow('b34', t('tests.priceFirst.line34'), p.band34),
      lineRow('gt4', t('tests.priceFirst.lineGt4'), p.gt4), lineRow('fresh', t('tests.priceFirst.lineFresh'), p.le3Fresh), lineRow('all', t('tests.priceFirst.lineAll'), p.all)]
    : null;
  const books = [...p.byBook.map((/** @type {any} */ b) => lineRow(b.book, b.book, b)), ...(isValue ? [lineRow('other', t('tests.priceFirst.bookOther'), p.otherSource)] : [])].filter((r) => r.n > 0);
  return html`<div class="tests-detail" data-testid=${`detail-${test.id}`}>
    <p class="tests-what">${t(`tests.priceFirst.what.${test.id}`)}</p>
    ${isValue && test.id === 'value'
      ? html`<div class="tests-meters"><${Meter} label=${t('tests.priceFirst.pinnacle')} value=${p.pinGraded} total=${VALUE_RULE.pinnacleMin}
          text=${t('tests.frozen.of', { n: p.pinGraded, total: VALUE_RULE.pinnacleMin })} testId="gate-pinnacle" /></div>`
      : null}
    <div class="tests-measure">
      <div class="tests-measure-head">
        <span class="tests-measure-label">${isValue ? t('tests.priceFirst.measureValue') : t('tests.priceFirst.measureProp')}${isValue && test.rule !== 'context' ? html` <span class="tests-muted">(${t('tests.priceFirst.gateLineShort')})</span>` : null}</span>
        ${ev.mean != null ? html`<span class="tests-measure-value num" data-testid=${`ev-${test.id}`}>${t('tests.frozen.measureValue', { mean: formatPct(ev.mean), n: ev.n })}</span>` : null}
      </div>
      ${ev.mean != null
        ? html`<${EvStrip} mean=${ev.mean} lo=${lo} hi=${hi} summary=${chartSummary} /><p class="tests-small num">${intervalText}</p>`
        : html`<p class="tests-muted">${t('tests.frozen.noMeasure')}</p>`}
    </div>
    ${stateText ? html`<p class="tests-rule tests-rule-state">${stateText}</p>` : null}
    <p class="tests-rule-text">${ruleText}</p>
    <div class="tests-context">
      <span class="tests-context-label">${t('tests.frozen.context')}</span>
      <span class="num">${t('tests.frozen.contextLine', { record: formatRecord(s), yield: formatPct(s.yield), hit: formatPct(s.hitRate, { sign: false }), n: s.n })}</span>
    </div>
    ${p.kind === 'prop' && p.perSlate != null
      ? html`<p class="tests-small num">${t('tests.priceFirst.perSlate', { n: formatNumber(p.perSlate, { maximumFractionDigits: 1 }, 'en'), slates: p.slates })}
          ${p.perSlate < 1 && test.rule !== 'context' ? html` ${t('tests.priceFirst.perSlateLow')}` : null}</p>`
      : null}
    ${isValue && test.id === 'value' ? html`<p class="tests-small tests-muted">${t('tests.priceFirst.pinnacleNote', { total: VALUE_RULE.pinnacleMin })}</p>` : null}
    ${lines || books.length
      ? html`<${Disclosure} summary=${isValue ? t('tests.priceFirst.linesAndBooks') : t('tests.priceFirst.books')}>
          ${lines ? html`<${DataTable} caption=${t('tests.priceFirst.lines')} columns=${lineColumns(t('tests.priceFirst.line'))} rows=${lines} rowKey=${(/** @type {any} */ r) => r.key} />` : null}
          ${books.length ? html`<${DataTable} caption=${t('tests.priceFirst.books')} columns=${lineColumns(t('tests.priceFirst.book'))} rows=${books} rowKey=${(/** @type {any} */ r) => r.key} />` : null}
        </${Disclosure}>`
      : null}
    <div class="tests-links">
      <a class="btn btn-secondary tests-link" href=${explorerHref(test.explorer)} data-testid=${`explorer-${test.id}`}>${t('tests.frozen.explorer')}</a>
      <a class="link-btn tests-link-sm" href=${href(`/glossary/${tagSlug(test.tag)}`)} data-testid=${`glossary-${test.id}`}>${t('tests.list.glossary', { label: test.sheetLabel })}</a>
      <span class="tests-decision-links"><span class="tests-muted">${t('tests.frozen.decisions')}</span>
        ${test.decisionRows.map((/** @type {number} */ row) => html`<a class="link-btn tests-link-sm" href=${decisionHref(row)} aria-label=${t('tests.frozen.decision', { row })}>${t('tests.frozen.rowShort', { row })}</a>`)}</span>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- stopped categories

/** @param {{ data: Dataset }} props */
function StoppedSection({ data }) {
  const list = useMemo(() => STOPPED_CATEGORIES.map((c) => stoppedSummary(c, data.picks)), [data]);
  return html`<section class="tests-stopped-wrap" data-testid="stopped">
    <${Disclosure} summary=${t('tests.stopped.summary', { n: list.length })}>
      <p class="tests-intro">${t('tests.stopped.intro')}</p>
      <ul class="tests-stopped">
        ${list.map(({ category: c, summary: s, first, last, rows }) => html`<li data-testid=${`stopped-${c.id}`}>
          <details class="tests-stopped-item">
            <summary>
              <span class="tests-stopped-head"><strong>${c.sheetLabel}</strong><span class="tests-muted num">${t('tests.stopped.when', { date: formatDate(c.stoppedOn) })}</span></span>
              <span class="tests-small num tests-stopped-final">${rows.length
                ? t('tests.stopped.final', { record: formatRecord(s), yield: formatPct(s.yield), n: s.n, ev: formatPct(s.fairCloseEv.mean), evn: s.fairCloseEv.n })
                : t('tests.stopped.empty')}</span>
              <${Icon} name="chevron-down" size=${16} />
            </summary>
            <div class="tests-stopped-body">
              <p>${t(`tests.stopped.why.${c.id}`)}</p>
              ${rows.length ? html`<p class="tests-muted tests-small">${t('tests.stopped.span', { first: formatDate(first), last: formatDate(last) })}</p>` : null}
              <div class="tests-links">
                ${rows.length ? html`<a class="link-btn tests-link-sm" href=${explorerHref(c.explorer)}>${t('tests.frozen.explorer')}</a>` : null}
                <a class="link-btn tests-link-sm" href=${decisionHref(c.decisionRow)}>${t('tests.frozen.decision', { row: c.decisionRow })}</a>
              </div>
            </div>
          </details>
        </li>`)}
      </ul>
    </${Disclosure}>
  </section>`;
}

// ---------------------------------------------------------------- the list of tests

/**
 * One row of the list: what it shows, taken as is from the progress objects of src/data/.
 * @typedef {{ id: string, group: 'frozen' | 'price', label: any, state: string,
 *   graded: { n: number, total: number | null }, closes: { n: number, total: number | null },
 *   ev: { mean: number | null, lo: number | null, hi: number | null, n: number }, detail: any }} RowModel
 */

/** @param {{ m: RowModel, open: boolean, onToggle: (id: string) => void }} props */
function TestRow({ m, open, onToggle }) {
  const btnId = `test-btn-${m.id}`;
  const panelId = `test-panel-${m.id}`;
  const frac = (/** @type {{ n: number, total: number | null }} */ c) => (c.total ? `${c.n}/${c.total}` : String(c.n));
  return html`<li class=${`tests-row${open ? ' is-open' : ''}`} id=${`test-${m.id}`} data-testid=${`${m.group === 'frozen' ? 'frozen' : 'price-first'}-${m.id}`} data-state=${m.state}>
    <h3 class="tests-row-h">
      <button type="button" class="tests-row-btn" id=${btnId} aria-expanded=${open ? 'true' : 'false'} aria-controls=${panelId} onClick=${() => onToggle(m.id)}>
        <span class="tests-cell tests-cell-label">${m.label}</span>
        <span class="tests-cell tests-cell-state"><${StateChip} state=${m.state} /></span>
        <span class="tests-cell tests-cell-graded num" data-testid=${`graded-${m.id}`}>
          <span class="tests-cell-k">${t('tests.list.graded')}</span><span>${frac(m.graded)}</span>${m.graded.total ? html`<${MiniBar} value=${m.graded.n} total=${m.graded.total} />` : null}
        </span>
        <span class="tests-cell tests-cell-close num" data-testid=${`close-${m.id}`}>
          <span class="tests-cell-k">${t('tests.list.closes')}</span><span>${frac(m.closes)}</span>${m.closes.total ? html`<${MiniBar} value=${m.closes.n} total=${m.closes.total} />` : null}
        </span>
        <span class="tests-cell tests-cell-ev num" data-testid=${`ev-${m.id}`}>
          <span class="tests-cell-k">${t('tests.list.ev')}</span>
          <span>${m.ev.mean == null ? '–' : t('tests.list.evValue', { mean: formatPct(m.ev.mean), n: m.ev.n })}</span>
          <${MiniEv} mean=${m.ev.mean} lo=${m.ev.lo} hi=${m.ev.hi} />
        </span>
        <span class="tests-cell tests-cell-chev" aria-hidden="true"><${Icon} name="chevron-down" size=${18} /></span>
      </button>
    </h3>
    ${open ? html`<div class="tests-panel" id=${panelId} role="region" aria-labelledby=${btnId}>${m.detail}</div>` : null}
  </li>`;
}

/** @param {{ title: string, rows: RowModel[], openId: string | null, onToggle: (id: string) => void, testId?: string }} props */
function TestGroup({ title, rows, openId, onToggle, testId }) {
  return html`<section class="tests-group" aria-label=${title} data-testid=${testId}>
    <div class="tests-group-head" aria-hidden="true">
      <span class="tests-group-title">${title}</span>
      <span>${t('tests.list.graded')}</span><span>${t('tests.list.closes')}</span><span>${t('tests.list.ev')}</span><span></span>
    </div>
    <h2 class="sr-only">${title}</h2>
    <ul class="tests-list">${rows.map((m) => html`<${TestRow} key=${m.id} m=${m} open=${openId === m.id} onToggle=${onToggle} />`)}</ul>
  </section>`;
}

// ---------------------------------------------------------------- screen

/** @param {{ data: Dataset, query: Record<string, string> }} props */
function Tests({ data, query }) {
  const today = todayIn(APP_TIMEZONE);
  const frozen = useMemo(() => FROZEN_TESTS.map((test) => frozenProgress(test, data.picks)), [data]);
  const priceFirst = useMemo(() => PRICE_FIRST_TESTS.map((test) => priceFirstProgress(test, data.picks)), [data]);
  const frozenRows = useMemo(
    () => frozen.map((p) => /** @type {RowModel} */ ({
      id: p.test.id, group: 'frozen', label: p.test.sheetLabel, state: p.state,
      graded: { n: p.graded, total: FROZEN_RULE.minGraded }, closes: { n: p.withClose, total: FROZEN_RULE.minWithClose },
      ev: { mean: p.ev.mean, lo: p.ev.lo, hi: p.ev.hi, n: p.ev.n },
      detail: html`<${FrozenDetail} p=${p} today=${today} />`,
    })),
    [frozen, today],
  );
  const priceRows = useMemo(
    () => priceFirst.map((/** @type {any} */ p) => {
      const decides = p.test.rule !== 'context';
      const gate = p.gateLine;
      const isProp = p.kind === 'prop';
      return /** @type {RowModel} */ ({
        id: p.test.id, group: 'price', label: html`<${TagBadge} tag=${p.test.tag} />`, state: p.state,
        graded: { n: p.all.graded, total: null },
        closes: { n: gate.ev.n, total: decides ? (isProp ? p.target : VALUE_RULE.minWithEv) : null },
        ev: { mean: gate.ev.mean, lo: isProp ? gate.lo95 : gate.ev.lo, hi: isProp ? gate.hi95 : gate.ev.hi, n: gate.ev.n },
        detail: html`<${PriceFirstDetail} p=${p} />`,
      });
    }),
    [priceFirst],
  );
  const known = useMemo(() => new Set([...FROZEN_TESTS.map((x) => x.id), ...PRICE_FIRST_TESTS.map((x) => x.id)]), []);
  const openId = query.open && known.has(query.open) ? query.open : null;
  const onToggle = (/** @type {string} */ id) => {
    const next = { ...query };
    if (openId === id) delete next.open;
    else next.open = id;
    const qs = new URLSearchParams(next).toString();
    navigate(`/tests${qs ? `?${qs}` : ''}`, { replace: true });
  };
  // A deep link (or the strip's link) brings its row into view.
  const scrolled = useRef(/** @type {string | null} */ (null));
  useEffect(() => {
    if (!openId || scrolled.current === openId) return;
    scrolled.current = openId;
    const el = document.getElementById(`test-${openId}`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [openId]);
  return html`<div class="tests stack">
    <${OverviewStrip} list=${frozen} />
    <${NextReview} data=${data} today=${today} />
    <div class="tests-lists stack" data-testid="frozen-table">
      <${TestGroup} title=${t('tests.frozenTitle')} rows=${frozenRows} openId=${openId} onToggle=${onToggle} testId="frozen-list" />
      <${TestGroup} title=${t('tests.priceFirst.title')} rows=${priceRows} openId=${openId} onToggle=${onToggle} testId="price-first" />
    </div>
    <${HowToRead} />
    <${StoppedSection} data=${data} />
  </div>`;
}

/** @param {{ query?: Record<string, string> }} props */
export function TestsScreen({ query = {} }) {
  return html`<${FeedGate}>${(data) => html`<${Tests} data=${data} query=${query} />`}</${FeedGate}>`;
}
