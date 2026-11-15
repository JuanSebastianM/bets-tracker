// Data components: DataTable (sortable, scrolls sideways inside its own box), Pagination, PickCard.
import { html, useState, useMemo } from '../../../vendor/preact.js';
import { Icon } from './icons.js';
import { StatusBadge, TagBadge } from './display.js';
import { t } from '../i18n.js';
import { formatDate, formatPct, formatPrice, formatUnits } from '../format.js';
import { flatProfit, sheetProfit } from '../../data/stats.js';
import { lineAddsInfo, lineLabel } from '../../data/lines.js';

/**
 * @typedef {object} Column
 * @property {string} key
 * @property {string} label
 * @property {(row: any) => any} [render]   cell content (defaults to row[key])
 * @property {(row: any) => number | string | null} [sortValue]  enables sorting on this column
 * @property {'left' | 'right'} [align]
 * @property {boolean} [num]                tabular figures, right aligned
 */

/**
 * A plain accessible table. Sorting is opt-in per column (sortValue).
 * @param {{ columns: Column[], rows: any[], caption?: string, rowKey?: (row: any) => string, initialSort?: { key: string, dir: 'asc' | 'desc' },
 *   onRowClick?: (row: any) => void, testId?: string, empty?: any }} props
 */
export function DataTable({ columns, rows, caption, rowKey = (r) => r.uid || r.key || JSON.stringify(r), initialSort, onRowClick, testId, empty }) {
  const [sort, setSort] = useState(initialSort || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || !col.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [rows, sort, columns]);

  if (!rows.length && empty) return empty;
  return html`<div class="table-wrap" data-testid=${testId}>
    <table class="table">
      ${caption ? html`<caption class="sr-only">${caption}</caption>` : null}
      <thead>
        <tr>
          ${columns.map((c) => {
            const active = sort && sort.key === c.key;
            const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;
            return html`<th scope="col" class=${c.num || c.align === 'right' ? 'ta-r' : ''} aria-sort=${ariaSort}>
              ${c.sortValue
                ? html`<button
                    type="button"
                    class="th-sort"
                    onClick=${() => setSort({ key: c.key, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}
                  >
                    ${c.label}<${Icon} name="sort" size=${12} />
                  </button>`
                : c.label}
            </th>`;
          })}
        </tr>
      </thead>
      <tbody>
        ${sorted.map(
          (r) => html`<tr key=${rowKey(r)} class=${onRowClick ? 'tr-click' : ''} onClick=${onRowClick ? () => onRowClick(r) : undefined}>
            ${columns.map((c) => html`<td class=${c.num || c.align === 'right' ? 'ta-r num' : ''}>${c.render ? c.render(r) : r[c.key] ?? '–'}</td>`)}
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/**
 * Page n of m with previous / next.
 * @param {{ page: number, pageCount: number, onPage: (p: number) => void, total?: number }} props page is 1-based
 */
export function Pagination({ page, pageCount, onPage, total }) {
  if (pageCount <= 1) return null;
  return html`<nav class="pager" aria-label=${t('pager.label')}>
    <button type="button" class="btn btn-secondary" disabled=${page <= 1} onClick=${() => onPage(page - 1)} aria-label=${t('pager.prev')}>
      <${Icon} name="chevron-left" size=${18} />
    </button>
    <span class="pager-info num">${t('pager.info', { page, pages: pageCount })}${total != null ? html` · ${t('common.picks', { count: total, n: total })}` : null}</span>
    <button type="button" class="btn btn-secondary" disabled=${page >= pageCount} onClick=${() => onPage(page + 1)} aria-label=${t('pager.next')}>
      <${Icon} name="chevron-right" size=${18} />
    </button>
  </nav>`;
}

/** Slice a list for a 1-based page. @template T @param {T[]} list @param {number} page @param {number} size */
export function pageOf(list, page, size) {
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(1, page), pageCount);
  return { items: list.slice((p - 1) * size, p * size), page: p, pageCount };
}

/**
 * One pick as a card: match and selection, price (and close), result, tag and source.
 * @param {{ pick: import('../../data/types').Pick, onOpen?: (p: any) => void, tagHref?: string }} props
 */
export function PickCard({ pick: p, onOpen, tagHref }) {
  const profit = p.source === 'bets' ? sheetProfit(p) : flatProfit(p, 1);
  const body = html`
    <div class="pc-top">
      <span class="pc-source">${t(`sources.${p.source}`)}</span>
      <span class="pc-date num">${formatDate(p.date, 'medium')}${p.time ? ` · ${p.time}` : ''}</span>
    </div>
    <div class="pc-main">
      <div class="pc-what">
        <div class="pc-match">${p.match}</div>
        <div class="pc-sel"><span class="pc-market">${p.marketRaw}</span> ${p.selection}${lineAddsInfo(p) ? html` <span class="pc-line" data-testid="pick-line">· ${lineLabel(p.lineKey)}</span>` : null}</div>
        <div class="pc-league">${p.league}</div>
      </div>
      <div class="pc-price">
        <span class="pc-odds num">${formatPrice(p.price)}</span>
        ${p.closePrice != null ? html`<span class="pc-close num" title=${t('pick.close')}>${t('pick.closeShort')} ${formatPrice(p.closePrice)}</span>` : null}
      </div>
    </div>
    <div class="pc-foot">
      <${StatusBadge} status=${p.status} raw=${p.statusRaw} />
      <${TagBadge} tag=${p.tag} href=${tagHref} />
      ${p.fairCloseEv != null ? html`<span class="pc-ev num" title=${t('pick.fairCloseEv')}>${t('pick.evShort')} ${formatPct(p.fairCloseEv)}</span>` : null}
      ${profit != null && p.status !== 'pending' ? html`<span class=${`pc-pl num ${profit > 0 ? 'pos' : profit < 0 ? 'neg' : ''}`}>${formatUnits(profit)}</span>` : null}
    </div>`;
  if (onOpen) {
    return html`<button type="button" class="pick-card" onClick=${() => onOpen(p)} data-uid=${p.uid}>${body}</button>`;
  }
  return html`<article class="pick-card" data-uid=${p.uid}>${body}</article>`;
}
