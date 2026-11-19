// Pick detail (#/explorer/:uid): everything the sheet and the parsed notes say about one pick, in
// readable form, with previous / next inside the current filtered list. A sheet on phones, a dialog
// on wide screens.
import { html, useEffect } from '../../../vendor/preact.js';
import { t, getLocale } from '../../lib/i18n.js';
import { sheetLang } from '../../lib/spoken.js';
import { BottomSheet, Button, EmptyState, StatusBadge, TagBadge, Icon, RefText, Term, useGlossaryLinks } from '../../lib/ui/index.js';
import { formatDate, formatPct, formatPrice, formatProb, formatUnits } from '../../lib/format.js';
import { formatDateTime } from '../../lib/i18n.js';
import { tagHref, tagSlug, REASON_SLUGS } from '../../lib/glossary-links.js';
import { lineAddsInfo, lineLabel } from '../../data/lines.js';
import { pinnacleFor } from '../../data/explore.js';
import { sheetProfit } from '../../data/stats.js';
import { APP_TIMEZONE } from '../../config.js';

/** @typedef {import('../../data/types').Pick} Pick */

const has = (/** @type {unknown} */ v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);

/** A definition list that skips empty values. @param {{ rows: Array<[string, any, string?]>, testId?: string }} props */
function KV({ rows, testId }) {
  const shown = rows.filter(([, v]) => has(v));
  if (!shown.length) return null;
  return html`<dl class="kv ex-kv" data-testid=${testId}>
    ${shown.map(
      ([k, v, hint]) => html`<dt>${k}</dt><dd>${v}${hint ? html`<span class="ex-hint">${hint}</span>` : null}</dd>`,
    )}
  </dl>`;
}

/** Titled block of the detail. */
function Block({ title, children, testId }) {
  return html`<section class="ex-block" data-testid=${testId}>
    <h3 class="ex-block-title">${title}</h3>
    ${children}
  </section>`;
}

/** '1.83 / 3.50 / 4.20'. @param {Array<number | null | undefined>} xs */
const triple = (xs) => xs.map((x) => formatPrice(/** @type {number} */ (x))).join(' / ');

/** Price of each book noted for the pick, with its close and the other side when logged. @param {{ pick: Pick }} props */
function BooksTable({ pick: p }) {
  const books = new Map();
  for (const b of p.parsed.bookPrices) books.set(b.book, { book: b.book, price: b.price, unavailable: b.unavailable, other: b.other });
  for (const [book, c] of Object.entries(p.parsed.bookCloses)) books.set(book, { ...(books.get(book) || { book }), close: c.close, others: c.triple || c.others });
  if (p.parsed.close) books.set('bet365 (feed)', { book: 'bet365 (feed)', price: p.parsed.feedPrice, close: p.parsed.close.price, others: p.parsed.close.triple || p.parsed.close.others });
  const rows = [...books.values()];
  if (!rows.length) return null;
  return html`<div class="table-wrap">
    <table class="table ex-books" data-testid="pick-books">
      <caption class="sr-only">${t('explorer.d.booksCaption')}</caption>
      <thead>
        <tr><th scope="col">${t('explorer.d.book')}</th><th scope="col" class="ta-r">${t('explorer.d.taken')}</th><th scope="col" class="ta-r">${t('explorer.d.close')}</th><th scope="col" class="ta-r">${t('explorer.d.otherSide')}</th></tr>
      </thead>
      <tbody>
        ${rows.map(
          (r) => html`<tr>
            <td>${r.book}${p.books.includes(r.book) ? html` <span class="chip chip-accent">${t('explorer.d.used')}</span>` : null}</td>
            <td class="ta-r num">${r.unavailable ? html`<span class="muted">${r.unavailable}</span>` : formatPrice(r.price)}${r.other ? html`<span class="ex-td-sub">${r.other}</span>` : null}</td>
            <td class="ta-r num">${formatPrice(r.close)}</td>
            <td class="ta-r num">${r.others && r.others.length ? triple(r.others) : '–'}</td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/** Which footer button should have focus after previous / next re-mounts the sheet. @type {'prev' | 'next' | null} */
let refocus = null;

/**
 * @param {{ pick: Pick | null, pinnacle: import('../../data/types').PinnacleRow[], position: { index: number, total: number },
 *   onPrev: (() => void) | null, onNext: (() => void) | null, onClose: () => void }} props
 */
export function PickDetail({ pick: p, pinnacle, position, onPrev, onNext, onClose }) {
  const gl = useGlossaryLinks();
  // Previous / next open another route, so the sheet mounts again: put focus back on the button the
  // user pressed (or the other one when that end of the list disables it) instead of the close button.
  useEffect(() => {
    const want = refocus;
    refocus = null;
    if (!want) return;
    requestAnimationFrame(() => {
      const el = /** @type {HTMLButtonElement | null} */ (document.querySelector(`[data-testid="pick-${want}"]`));
      const other = /** @type {HTMLButtonElement | null} */ (document.querySelector(`[data-testid="pick-${want === 'next' ? 'prev' : 'next'}"]`));
      (el && !el.disabled ? el : other)?.focus();
    });
  }, [p?.uid]);
  const step = (/** @type {'prev' | 'next'} */ dir, /** @type {(() => void) | null} */ fn) => (fn ? () => { refocus = dir; fn(); } : undefined);
  const footer = html`<div class="ex-detail-nav">
    <${Button} variant="secondary" icon="chevron-left" onClick=${step('prev', onPrev)} disabled=${!onPrev} data-testid="pick-prev">${t('explorer.d.prev')}</${Button}>
    <span class="muted small num" data-testid="pick-position">${position.index >= 0 ? t('explorer.d.position', { i: position.index + 1, n: position.total }) : ''}</span>
    <${Button} variant="secondary" onClick=${step('next', onNext)} disabled=${!onNext} data-testid="pick-next" class="ex-next">${t('explorer.d.next')}<${Icon} name="chevron-right" size=${18} /></${Button}>
  </div>`;
  if (!p) {
    return html`<${BottomSheet} open title=${t('explorer.d.missingTitle')} onClose=${onClose} testId="pick-sheet" size="lg">
      <${EmptyState} title=${t('explorer.d.missingTitle')} body=${t('explorer.d.missingBody')} />
    </${BottomSheet}>`;
  }
  const pp = p.parsed;
  const pin = pinnacleFor(pinnacle, p);
  const profit = p.source === 'bets' ? sheetProfit(p) : null;
  const fair = p.fairOdds ? 1 / p.fairOdds : null;
  const closeSourceLabel = p.closeSource ? t(`explorer.d.closeSource.${p.closeSource}`) : '';
  return html`<${BottomSheet} open title=${p.match || t('explorer.d.untitled')} onClose=${onClose} testId="pick-sheet" size="lg" footer=${footer}>
    <div class="ex-detail" data-uid=${p.uid}>
      <div class="ex-d-head">
        <p class="ex-d-row small" data-testid="pick-row">${t('explorer.row', { source: t(`sources.${p.source}`), row: p.row })}</p>
        <p class="muted small">${formatDate(p.date, 'medium')}${p.time ? ` · ${p.time}` : ''} · ${p.league}</p>
        <div class="ex-d-pick">
          <div class="ex-d-what">
            <span class="ex-d-market">${p.marketRaw}</span>
            <span class="ex-d-sel">${p.selection}</span>
            ${lineAddsInfo(p) ? html`<span class="ex-d-line muted small" data-testid="pick-line">${t('lines.pickLine')}: ${lineLabel(p.lineKey)}</span>` : null}
          </div>
          <span class="ex-d-price num">${formatPrice(p.price)}</span>
        </div>
        <div class="row-wrap">
          <${StatusBadge} status=${p.status} raw=${p.statusRaw} />
          ${p.extra.result ? html`<span class="small">${p.extra.result}</span>` : null}
          ${profit != null && p.status !== 'pending' ? html`<span class=${`num small ${profit > 0 ? 'pos' : profit < 0 ? 'neg' : ''}`}>${formatUnits(profit)}</span>` : null}
        </div>
      </div>

      <${Block} title=${t('explorer.d.tag')} testId="pick-tag">
        <div class="row-wrap"><${TagBadge} tag=${p.tag} href=${tagHref(p.tag)} /></div>
        <p class="small"><${RefText} text=${t(`explorer.tagMeaning.${p.tag}`)} terms=${gl.terms} known=${{ ruleNumbers: gl.ruleNumbers || [] }} exclude=${[tagSlug(p.tag)]} /></p>
        ${p.tagRaw ? html`<p class="small ex-quote">${p.tagRaw}</p>` : null}
        ${pp.filters.length
          ? html`<div class="row-wrap" data-testid="pick-reasons">${pp.filters.map((r) => (REASON_SLUGS[r]
              ? html`<${Term} slug=${REASON_SLUGS[r]} class="chip">${t(`filters.reasons.${r}`)}</${Term}>`
              : html`<span class="chip">${t(`filters.reasons.${r}`)}</span>`))}</div>`
          : null}
      </${Block}>

      <${Block} title=${t('explorer.d.prices')} testId="pick-prices">
        <${KV} rows=${[
          [t('explorer.d.price'), formatPrice(p.price)],
          [t('explorer.d.books'), p.books.join(', ')],
          [t('explorer.d.priceSource'), pp.priceSource],
          [t('explorer.d.feedPrice'), pp.feedPrice != null ? formatPrice(pp.feedPrice) : null],
          [t('explorer.d.feedOpen'), pp.feedOpen != null ? `${formatPrice(pp.feedOpen)}${pp.feedOpenOther != null ? ` (${t('explorer.d.otherSideShort')} ${formatPrice(pp.feedOpenOther)})` : ''}` : null],
          [t('explorer.d.closePrice'), p.closePrice != null ? `${formatPrice(p.closePrice)}${closeSourceLabel ? ` · ${closeSourceLabel}` : ''}` : null],
          [t('explorer.d.closeMissing'), pp.closeMissing],
          [t('explorer.d.clv'), p.clv != null ? formatPct(p.clv) : null, t('explorer.d.clvHint')],
          [t('explorer.d.fairCloseEv'), p.fairCloseEv != null ? formatPct(p.fairCloseEv) : p.closePrice != null ? t('explorer.d.oneSided') : null, t('explorer.d.fairCloseEvHint')],
          [t('explorer.d.minPrice'), p.extra.minPrice != null ? formatPrice(/** @type {number} */ (p.extra.minPrice)) : null],
        ]} />
        <${BooksTable} pick=${p} />
      </${Block}>

      <${Block} title=${t('explorer.d.model')} testId="pick-model">
        <${KV} rows=${[
          [t('explorer.d.probModel'), p.probModel != null ? formatProb(p.probModel) : null],
          [t('explorer.d.probBlend'), p.probBlend != null ? formatProb(p.probBlend) : null, p.tag === 'value' || p.tag === 'near_value' ? t('explorer.d.probBlendValue') : undefined],
          [t('explorer.d.fairOdds'), p.fairOdds != null ? `${formatPrice(p.fairOdds)} (${formatProb(fair)})` : null],
          [t('explorer.d.probAI'), p.probAI != null ? formatProb(p.probAI) : null],
          [t('explorer.d.ev'), p.ev != null ? formatPct(p.ev) : null],
          [t('explorer.d.stake'), p.stakeU != null ? formatUnits(p.stakeU, { sign: false }) : null],
          [t('explorer.d.ref'), pp.ref ? `${t(`filters.refs.${pp.ref}`)}${pp.refBooks.length ? ` (${pp.refBooks.join(', ')})` : ''}` : null],
          [t('explorer.d.sample'), pp.sample],
          [t('explorer.d.fuerza'), pp.fuerza ? `${t(`filters.fuerzaValue.${pp.fuerza}`)}${pp.fuerzaExpected != null ? ` · ${t('explorer.d.expected', { v: pp.fuerzaExpected })}` : ''}${pp.fuerzaProb != null ? ` · ${formatProb(pp.fuerzaProb)}` : ''}` : null],
          [t('explorer.d.modelMean'), pp.modelMean],
          [t('explorer.d.aiMean'), pp.aiMean],
          [t('explorer.d.passedAll'), pp.passedAll ? t('common.yes') : null],
          [t('explorer.d.grokReason'), p.extra.reason],
          [t('explorer.d.confidence'), p.extra.confidence],
          [t('explorer.d.betType'), p.extra.type],
        ]} />
      </${Block}>

      ${pin || pp.pin || pp.pinMissing
        ? html`<${Block} title=${t('explorer.d.pinnacle')} testId="pick-pinnacle">
            ${pin
              ? html`<${KV} rows=${[
                  [t('explorer.d.pinMatch'), `${pin.home} – ${pin.away}`],
                  [t('explorer.d.pinOpen'), triple([pin.open_1, pin.open_x, pin.open_2].map(Number))],
                  [t('explorer.d.pinLast'), triple([pin.last_1, pin.last_x, pin.last_2].map(Number))],
                  [t('explorer.d.pinKickoff'), pin.kickoff_bogota],
                  [t('explorer.d.pinRead'), pin.last_read_utc ? formatDateTime(String(pin.last_read_utc), APP_TIMEZONE) : null],
                  [t('explorer.d.pinMins'), pin.mins_before_kickoff != null ? t('explorer.d.minutes', { n: pin.mins_before_kickoff }) : null],
                ]} />
                <p class="small ex-pin-move num" data-testid="pin-move">${triple([pin.open_1, pin.open_x, pin.open_2].map(Number))} → ${triple([pin.last_1, pin.last_x, pin.last_2].map(Number))}</p>`
              : pp.pin
                ? html`<${KV} rows=${[
                    [t('explorer.d.pinNoted'), triple([pp.pin.home, pp.pin.draw, pp.pin.away])],
                    [t('explorer.d.pinRead'), pp.pin.readUtc ? formatDateTime(pp.pin.readUtc, APP_TIMEZONE) : null],
                  ]} />`
                : html`<p class="small muted">${pp.pinMissing}</p>`}
          </${Block}>`
        : null}

      <${Block} title=${t('explorer.notes')} testId="pick-notes">
        <p class="small explorer-notes" lang=${sheetLang(getLocale())}>${p.notes || '–'}</p>
      </${Block}>
    </div>
  </${BottomSheet}>`;
}
