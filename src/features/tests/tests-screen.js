// The Tests section (#/tests): the overview strip, how to read it, the next Sombra review, the frozen
// tests (Decisiones row 111), the price-first tests (rows 79, 80, 97, 108) and the stopped categories.
// Every figure comes from src/data/tests-config.js and src/data/stats.js.
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { href } from '../../lib/router.js';
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
import { Meter, StateChip, EvStrip, TermSentence, tagSlug, decisionHref } from './tests-parts.js';

/** @typedef {import('../../data/types').Dataset} Dataset */
/** @typedef {ReturnType<typeof frozenProgress>} FrozenProgress */

/** @param {Partial<import('../../data/filters.js').FilterState>} f */
const explorerHref = (f) => href(`/explorer?${toQueryString({ ...defaultFilters(), ...f })}`);
const z2 = (/** @type {number | null} */ z) => (z == null ? '–' : formatNumber(z, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }, 'en').replace('-', '−'));
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
        ? html`<a class="tests-ov-link" href=${`#test-${o.closest.test.id}`}>${o.closest.test.sheetLabel}</a>
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
    <p class="tests-rule">${t('tests.review.rule', { days: SHADOW_REVIEW.minDays, rows: SHADOW_REVIEW.minNewGraded })}</p>
    ${parts
      ? html`<p class="tests-muted">${t('tests.review.last', { topic: (history.find((h) => h.row === r.last.decisionRow) || { topic: '' }).topic, date: formatDate(r.last.date) })}</p>
          <div class="tests-meters">
            <${Meter} label=${t('tests.review.days')} value=${parts.days} total=${SHADOW_REVIEW.minDays} met=${parts.daysMet}
              text=${t('tests.review.ofDays', { n: parts.days, total: SHADOW_REVIEW.minDays })} testId="review-days" />
            <${Meter} label=${t('tests.review.rows')} value=${parts.rows} total=${SHADOW_REVIEW.minNewGraded} met=${parts.rowsMet}
              text=${t('tests.review.ofRows', { n: parts.rows, total: SHADOW_REVIEW.minNewGraded })} testId="review-rows" />
          </div>
          <p data-testid="review-when">${r.due ? t('tests.review.dueBody') : html`${t('tests.review.dueWhen', { date: formatDate(r.dueDate), rows: r.dueRows, graded: r.graded })} <strong>${left}</strong>`}</p>`
      : html`<p>${t('tests.reviewUnknown')}</p>`}
    <div class="tests-history">
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
    </div>
  </${Card}>`;
}

// ---------------------------------------------------------------- frozen tests

/** @param {{ p: FrozenProgress, today: string }} props */
function FrozenCard({ p, today }) {
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
  return html`<article class="card tests-card" id=${`test-${test.id}`} data-testid=${`frozen-${test.id}`} data-state=${p.state}>
    <header class="tests-card-head">
      <div class="tests-card-titles">
        <h3 class="card-title">${test.sheetLabel}</h3>
      </div>
      <${StateChip} state=${p.state} />
    </header>
    <p class="tests-what">${t(`tests.frozen.what.${test.id}`)}</p>
    <p class="tests-muted tests-since">${start}${p.pending ? html`<span class="tests-pending num">${t('tests.frozen.pending', { count: p.pending, n: p.pending })}</span>` : null}</p>
    <div class="tests-meters">
      <${Meter} label=${t('tests.graded')} value=${p.graded} total=${FROZEN_RULE.minGraded} met=${p.graded >= FROZEN_RULE.minGraded}
        text=${t('tests.frozen.of', { n: p.graded, total: FROZEN_RULE.minGraded })} testId=${`graded-${test.id}`} />
      <${Meter} label=${t('tests.withCloseTwo')} value=${p.withClose} total=${FROZEN_RULE.minWithClose} met=${p.withClose >= FROZEN_RULE.minWithClose}
        text=${t('tests.frozen.of', { n: p.withClose, total: FROZEN_RULE.minWithClose })} testId=${`close-${test.id}`} />
      ${p.withClose ? html`<p class="tests-muted tests-small num">${t('tests.frozen.closeSources', { own: p.withCloseSameBook, feed: p.withCloseFeed })}</p>` : null}
    </div>
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
  </article>`;
}

/** @param {{ list: FrozenProgress[], today: string }} props */
function FrozenSection({ list, today }) {
  return html`<section class="tests-section" aria-labelledby="tests-frozen-h">
    <div class="tests-section-head">
      <h2 class="tests-h2" id="tests-frozen-h">${t('tests.frozenTitle')}</h2>
      <p class="tests-intro">${t('tests.frozen.intro', { graded: FROZEN_RULE.minGraded, stake: FROZEN_RULE.passStakeU })} <a href=${decisionHref(FROZEN_RULE.decisionRow)}>${t('tests.frozen.decision', { row: FROZEN_RULE.decisionRow })}</a></p>
      <p class="tests-muted tests-small">${t('tests.frozen.explorerHint')}</p>
    </div>
    <div class="tests-grid" data-testid="frozen-table">
      ${list.map((p) => html`<${FrozenCard} key=${p.test.id} p=${p} today=${today} />`)}
    </div>
  </section>`;
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

/** @param {{ p: any }} props ReturnType<typeof priceFirstProgress> (a union of the value and prop shapes) */
function PriceFirstCard({ p }) {
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
  const total = isValue ? VALUE_RULE.minWithEv : p.target;
  const intervalText = lo == null ? t('tests.frozen.chartNone')
    : isValue ? t('tests.frozen.interval', { lo: formatPct(lo), hi: formatPct(hi) }) : t('tests.priceFirst.interval95', { lo: formatPct(lo), hi: formatPct(hi) });
  const chartSummary = ev.mean == null ? '' : lo == null ? t('tests.frozen.chartNone') : t('tests.frozen.chart', { mean: formatPct(ev.mean), lo: formatPct(lo), hi: formatPct(hi), n: ev.n });
  const lines = isValue
    ? [lineRow('le4', t('tests.priceFirst.lineLe4'), p.le4), lineRow('le3', t('tests.priceFirst.lineLe3'), p.le3), lineRow('b34', t('tests.priceFirst.line34'), p.band34),
      lineRow('gt4', t('tests.priceFirst.lineGt4'), p.gt4), lineRow('fresh', t('tests.priceFirst.lineFresh'), p.le3Fresh), lineRow('all', t('tests.priceFirst.lineAll'), p.all)]
    : null;
  const books = [...p.byBook.map((/** @type {any} */ b) => lineRow(b.book, b.book, b)), ...(isValue ? [lineRow('other', t('tests.priceFirst.bookOther'), p.otherSource)] : [])].filter((r) => r.n > 0);
  return html`<article class="card tests-card" id=${`test-${test.id}`} data-testid=${`price-first-${test.id}`} data-state=${p.state}>
    <header class="tests-card-head">
      <div class="tests-card-titles">
        <h3 class="card-title"><${TagBadge} tag=${test.tag} href=${href(`/glossary/${tagSlug(test.tag)}`)} /></h3>
      </div>
      <${StateChip} state=${p.state} />
    </header>
    <p class="tests-what">${t(`tests.priceFirst.what.${test.id}`)}</p>
    ${test.rule !== 'context'
      ? html`<div class="tests-meters">
          <${Meter} label=${isValue ? t('tests.priceFirst.gateLabel') : t('tests.priceFirst.propLabel')} value=${ev.n} total=${total} met=${ev.n >= total}
            text=${t('tests.frozen.of', { n: ev.n, total })} testId=${`gate-${test.id}`} />
          ${isValue && test.id === 'value'
            ? html`<${Meter} label=${t('tests.priceFirst.pinnacle')} value=${p.pinGraded} total=${VALUE_RULE.pinnacleMin}
                text=${t('tests.frozen.of', { n: p.pinGraded, total: VALUE_RULE.pinnacleMin })} testId="gate-pinnacle" />`
            : null}
        </div>`
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
      <span class="tests-decision-links"><span class="tests-muted">${t('tests.frozen.decisions')}</span>
        ${test.decisionRows.map((/** @type {number} */ row) => html`<a class="link-btn tests-link-sm" href=${decisionHref(row)} aria-label=${t('tests.frozen.decision', { row })}>${t('tests.frozen.rowShort', { row })}</a>`)}</span>
    </div>
  </article>`;
}

/** @param {{ data: Dataset }} props */
function PriceFirstSection({ data }) {
  const list = useMemo(() => PRICE_FIRST_TESTS.map((test) => priceFirstProgress(test, data.picks)), [data]);
  return html`<section class="tests-section" aria-labelledby="tests-pf-h" data-testid="price-first">
    <div class="tests-section-head">
      <h2 class="tests-h2" id="tests-pf-h">${t('tests.priceFirst.title')}</h2>
      <p class="tests-intro">${t('tests.priceFirst.intro')}</p>
    </div>
    <div class="tests-grid">${list.map((p) => html`<${PriceFirstCard} key=${p.test.id} p=${p} />`)}</div>
  </section>`;
}

// ---------------------------------------------------------------- stopped categories

/** @param {{ data: Dataset }} props */
function StoppedSection({ data }) {
  const list = useMemo(() => STOPPED_CATEGORIES.map((c) => stoppedSummary(c, data.picks)), [data]);
  return html`<section class="tests-section" aria-labelledby="tests-stop-h" data-testid="stopped">
    <div class="tests-section-head">
      <h2 class="tests-h2" id="tests-stop-h">${t('tests.stopped.title')}</h2>
      <p class="tests-intro">${t('tests.stopped.intro')}</p>
    </div>
    <ul class="card tests-stopped">
      ${list.map(({ category: c, summary: s, first, last, rows }) => html`<li class="tests-stopped-item" data-testid=${`stopped-${c.id}`}>
        <div class="tests-stopped-head">
          <strong>${c.sheetLabel}</strong>
          <span class="tests-muted num">${t('tests.stopped.when', { date: formatDate(c.stoppedOn) })}</span>
        </div>
        <p>${t(`tests.stopped.why.${c.id}`)}</p>
        ${rows.length
          ? html`<p class="num tests-small">${t('tests.stopped.final', { record: formatRecord(s), yield: formatPct(s.yield), n: s.n, ev: formatPct(s.fairCloseEv.mean), evn: s.fairCloseEv.n })}</p>
              <p class="tests-muted tests-small">${t('tests.stopped.span', { first: formatDate(first), last: formatDate(last) })}</p>`
          : html`<p class="tests-muted tests-small">${t('tests.stopped.empty')}</p>`}
        <div class="tests-links">
          ${rows.length ? html`<a class="link-btn tests-link-sm" href=${explorerHref(c.explorer)}>${t('tests.frozen.explorer')}</a>` : null}
          <a class="link-btn tests-link-sm" href=${decisionHref(c.decisionRow)}>${t('tests.frozen.decision', { row: c.decisionRow })}</a>
        </div>
      </li>`)}
    </ul>
  </section>`;
}

// ---------------------------------------------------------------- screen

/** @param {{ data: Dataset }} props */
function Tests({ data }) {
  const today = todayIn(APP_TIMEZONE);
  const frozen = useMemo(() => FROZEN_TESTS.map((test) => frozenProgress(test, data.picks)), [data]);
  return html`<div class="tests stack">
    <${OverviewStrip} list=${frozen} />
    <${HowToRead} />
    <${NextReview} data=${data} today=${today} />
    <${FrozenSection} list=${frozen} today=${today} />
    <${PriceFirstSection} data=${data} />
    <${StoppedSection} data=${data} />
  </div>`;
}

export function TestsScreen() {
  return html`<${FeedGate}>${(data) => html`<${Tests} data=${data} />`}</${FeedGate}>`;
}

