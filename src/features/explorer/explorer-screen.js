// STUB (foundation): the shared filter state from the URL (only the source chips are wired here),
// a paged list of PickCards and a detail sheet with the raw notes. The Explorer feature replaces it.
import { html, useMemo, useState } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { navigate } from '../../lib/router.js';
import { FeedGate, FilterChip, PickCard, Pagination, pageOf, BottomSheet, EmptyState } from '../../lib/ui/index.js';
import { applyFilters, filterOptions, fromQuery, toQueryString } from '../../data/filters.js';
import { todayIn } from '../../lib/format.js';
import { APP_TIMEZONE, PAGE_SIZE } from '../../config.js';

/** @param {{ data: import('../../data/types').Dataset, query: Record<string, string> }} props */
function Explorer({ data, query }) {
  const filters = useMemo(() => fromQuery(query), [query]);
  const options = useMemo(() => filterOptions(data.picks), [data]);
  const list = useMemo(() => applyFilters(data.picks, filters, { today: todayIn(APP_TIMEZONE) }).slice().reverse(), [data, filters]);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(/** @type {import('../../data/types').Pick | null} */ (null));
  const view = pageOf(list, page, PAGE_SIZE);

  const toggleSource = (/** @type {string} */ src) => {
    const sources = filters.sources.includes(src) ? filters.sources.filter((s) => s !== src) : [...filters.sources, src];
    const qs = toQueryString({ ...filters, sources });
    setPage(1);
    navigate(`/explorer${qs ? `?${qs}` : ''}`, { replace: true });
  };

  return html`<div class="explorer stack">
    <div class="row-wrap" role="group" aria-label=${t('filters.source')}>
      ${options.sources.map(
        (o) => html`<${FilterChip}
          label=${t(`sources.${o.value}`)}
          count=${o.count}
          selected=${filters.sources.includes(o.value)}
          onToggle=${() => toggleSource(o.value)}
          testId=${`chip-source-${o.value}`}
        />`,
      )}
    </div>
    <p class="muted small" data-testid="explorer-count">${t('explorer.count', { count: list.length, n: list.length })}</p>
    ${list.length
      ? html`<div class="pick-list">${view.items.map((p) => html`<${PickCard} key=${p.uid} pick=${p} onOpen=${setOpen} />`)}</div>`
      : html`<${EmptyState} title=${t('explorer.emptyTitle')} body=${t('explorer.emptyBody')} />`}
    <${Pagination} page=${view.page} pageCount=${view.pageCount} onPage=${(/** @type {number} */ p) => { setPage(p); window.scrollTo(0, 0); }} total=${list.length} />
    <${BottomSheet} open=${!!open} title=${open ? open.match : ''} onClose=${() => setOpen(null)} testId="pick-sheet">
      ${open
        ? html`<${PickCard} pick=${open} />
            <div class="stack-sm">
              <h3>${t('explorer.reason')}</h3>
              <p class="small">${open.tagRaw || '–'}</p>
              <h3>${t('explorer.notes')}</h3>
              <p class="small explorer-notes">${open.notes || '–'}</p>
              <p class="xs muted">${t('explorer.row', { source: t(`sources.${open.source}`), row: open.row })}</p>
            </div>`
        : null}
    </${BottomSheet}>
  </div>`;
}

/** @param {{ query: Record<string, string> }} props */
export function ExplorerScreen({ query }) {
  return html`<${FeedGate}>${(data) => html`<${Explorer} data=${data} query=${query} />`}</${FeedGate}>`;
}
