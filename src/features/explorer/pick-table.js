// Wide screens: the filtered page as a real table. Sorting is the screen's (URL) sort, applied to the
// whole filtered list before paging, so the headers only report it and change it.
import { html } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Icon, StatusBadge, TagBadge } from '../../lib/ui/index.js';
import { formatDate, formatPct, formatPrice } from '../../lib/format.js';
import { tagHref } from '../../lib/glossary-links.js';

/** @typedef {import('../../data/types').Pick} Pick */

/** @type {Array<{ key: string, num: boolean, also?: string }>} The selection column also sorts by market. */
const COLUMNS = [
  { key: 'date', num: false },
  { key: 'match', num: false },
  { key: 'tag', num: false },
  { key: 'selection', num: false, also: 'market' },
  { key: 'price', num: true },
  { key: 'close', num: true },
  { key: 'ev', num: true },
  { key: 'fairCloseEv', num: true },
  { key: 'status', num: false },
];

/**
 * @param {{ picks: Pick[], sort: string, dir: 'asc' | 'desc', onSort: (key: string) => void, hrefOf: (p: Pick) => string, caption: string }} props
 */
export function PickTable({ picks, sort, dir, onSort, hrefOf, caption }) {
  /** @type {Record<string, (p: Pick) => any>} */
  const cell = {
    date: (p) => html`<span class="num" title=${formatDate(p.date, 'medium')}>${formatDate(p.date, 'short')}</span><span class="ex-td-sub">${t(`sources.${p.source}`)}</span>`,
    match: (p) => html`<a class="ex-match-link" href=${hrefOf(p)} data-uid=${p.uid}>${p.match || '–'}</a><span class="ex-td-sub">${p.league}</span>`,
    tag: (p) => html`<${TagBadge} tag=${p.tag} href=${tagHref(p.tag)} />`,
    selection: (p) => html`<span class="ex-td-sub ex-td-market">${p.marketRaw || '–'}</span>${p.selection || '–'}`,
    price: (p) => formatPrice(p.price),
    close: (p) => formatPrice(p.closePrice),
    ev: (p) => formatPct(p.ev),
    fairCloseEv: (p) => formatPct(p.fairCloseEv),
    status: (p) => html`<${StatusBadge} status=${p.status} raw=${p.statusRaw} />`,
  };
  return html`<div class="table-wrap ex-table-wrap" data-testid="explorer-table">
    <table class="table ex-table">
      <caption class="sr-only">${caption}</caption>
      <thead>
        <tr>
          ${COLUMNS.map((c) => {
            const keys = c.also ? [c.also, c.key] : [c.key];
            const activeKey = keys.find((k) => k === sort);
            return html`<th scope="col" class=${`ex-th-${c.key}${c.num ? ' ta-r' : ''}`} aria-sort=${activeKey ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
              ${keys.map(
                (k) => html`<button type="button" class=${`th-sort${k === sort ? ' th-sort-on' : ''}`} onClick=${() => onSort(k)} data-sort=${k}>
                  ${t(`explorer.col.${k}`)}
                  <${Icon} name=${k === sort ? (dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'sort'} size=${12} />
                </button>`,
              )}
            </th>`;
          })}
        </tr>
      </thead>
      <tbody>
        ${picks.map(
          (p) => html`<tr key=${p.uid} class="tr-click" onClick=${(/** @type {MouseEvent} */ e) => {
            if (/** @type {HTMLElement} */ (e.target).closest('a')) return;
            location.hash = hrefOf(p).slice(1);
          }}>
            ${COLUMNS.map((c) => html`<td class=${`ex-td-${c.key}${c.num ? ' ta-r num' : ''}`}>${cell[c.key](p)}</td>`)}
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}
