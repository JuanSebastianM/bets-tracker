// Explorer (#/explorer, #/explorer/:uid): every pick with the shared filter panel, search, sort and
// paging, all kept in the hash query so a view can be bookmarked; a summary of the current filter;
// cards on phones, a table on wide screens; the detail of one pick as a sheet over the list.
//
// Query: the filter keys of src/data/filters.js plus `sort`, `dir` and `page`.
import { html, useMemo, useState, useEffect } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { SIDE_PANEL_QUERY } from '../../lib/links.js';
import { navigate, goBack } from '../../lib/router.js';
import {
  FeedGate, PickCard, Pagination, pageOf, BottomSheet, EmptyState, Button, IconButton, SearchInput, Select, Disclosure,
  FilterPanel, ActiveFilters, FilterButton, SavedFilters, useMediaQuery,
} from '../../lib/ui/index.js';
import { applyFilters, fromQuery, toQueryString, countActive, defaultFilters } from '../../data/filters.js';
import { sortPicks, SORT_KEYS, SORT_DEFAULT_DIR, neighbours } from '../../data/explore.js';
import { summarize } from '../../data/stats.js';
import { simulate } from '../../data/simulate.js';
import { todayIn } from '../../lib/format.js';
import { APP_TIMEZONE, PAGE_SIZE } from '../../config.js';
import { SummaryStrip } from './summary-strip.js';
import { PickTable } from './pick-table.js';
import { PickDetail } from './pick-detail.js';

/** @typedef {import('../../data/types').Pick} Pick */
/** @typedef {import('../../data/filters.js').FilterState} FilterState */

/** Wide screens: the panel is a side column. */
const SIDE_QUERY = SIDE_PANEL_QUERY;
/** From the side rail up: the list is a table. */
const TABLE_QUERY = '(min-width: 960px)';

/**
 * Where the list was when a pick was opened, to put it back when the detail closes (the shell
 * remounts the screen and scrolls to the top on every path change).
 * @type {{ y: number, uid: string } | null}
 */
let restore = null;

/** Sort and page of the query, validated. @param {Record<string, string>} q */
function viewOf(q) {
  const sort = SORT_KEYS.includes(q.sort) ? q.sort : 'date';
  const dir = q.dir === 'asc' || q.dir === 'desc' ? q.dir : SORT_DEFAULT_DIR[sort];
  const page = Math.max(1, Math.floor(Number(q.page)) || 1);
  return { sort, dir: /** @type {'asc' | 'desc'} */ (dir), page };
}

/**
 * Query string of a view: the filters, then sort / dir when not the default, then page when > 1.
 * @param {FilterState} f @param {{ sort: string, dir: string, page?: number }} v
 */
export function explorerQuery(f, v) {
  const parts = [toQueryString(f)];
  if (v.sort !== 'date') parts.push(`sort=${v.sort}`);
  if (v.dir !== SORT_DEFAULT_DIR[v.sort]) parts.push(`dir=${v.dir}`);
  if (v.page && v.page > 1) parts.push(`page=${v.page}`);
  return parts.filter(Boolean).join('&');
}

const withQuery = (/** @type {string} */ path, /** @type {string} */ qs) => (qs ? `${path}?${qs}` : path);

/** @param {{ data: import('../../data/types').Dataset, query: Record<string, string>, uid: string | null }} props */
function Explorer({ data, query, uid }) {
  const filters = useMemo(() => fromQuery(query), [query]);
  const fqs = toQueryString(filters);
  const view = viewOf(query);
  const today = todayIn(APP_TIMEZONE);
  const side = useMediaQuery(SIDE_QUERY);
  const tableMode = useMediaQuery(TABLE_QUERY);
  const [panelOpen, setPanelOpen] = useState(false);

  const list = useMemo(() => sortPicks(applyFilters(data.picks, filters, { today }), view.sort, view.dir), [data, fqs, view.sort, view.dir, today]);
  const summary = useMemo(() => summarize(list), [list]);
  const curve = useMemo(() => simulate(list, { mode: 'flat', stake: 1 }).points.map((p) => p.cum), [list]);
  const paged = pageOf(list, view.page, PAGE_SIZE);
  const active = countActive(filters);

  const qsNow = explorerQuery(filters, view);
  /** Change the filters (page back to 1). @param {FilterState} next */
  const setFilters = (next) => navigate(withQuery('/explorer', explorerQuery(next, { sort: view.sort, dir: view.dir })), { replace: true });
  const setSort = (/** @type {string} */ sort, /** @type {string} */ dir) => navigate(withQuery('/explorer', explorerQuery(filters, { sort, dir })), { replace: true });
  const setPage = (/** @type {number} */ page) => {
    navigate(withQuery('/explorer', explorerQuery(filters, { ...view, page })), { replace: true });
    document.getElementById('explorer-results')?.scrollIntoView({ block: 'start' });
  };
  const detailPath = (/** @type {Pick} */ p) => withQuery(`/explorer/${encodeURIComponent(p.uid)}`, qsNow);
  const open = (/** @type {Pick} */ p) => {
    restore = { y: window.scrollY, uid: p.uid };
    navigate(detailPath(p));
  };

  // Back from a detail: put the list where it was and focus the pick that was open.
  useEffect(() => {
    const r = restore;
    if (!r) return undefined;
    if (!uid) restore = null;
    const id = setTimeout(() => {
      window.scrollTo(0, r.y);
      if (!uid) /** @type {HTMLElement | null} */ (document.querySelector(`.explorer [data-uid="${CSS.escape(r.uid)}"]`))?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const panel = html`<${FilterPanel} picks=${data.picks} filters=${filters} onChange=${setFilters} hide=${['q']} today=${today} />`;
  const saved = html`<${Disclosure} summary=${t('explorer.savedAndStarting')}><${SavedFilters} filters=${filters} onApply=${setFilters} /></${Disclosure}>`;

  const detail = uid ? data.picks.find((p) => p.uid === uid) || null : null;
  const nb = uid ? neighbours(list, uid) : null;

  return html`<div class=${`explorer${side ? ' ex-has-side' : ''}`}>
    <div class="ex-layout">
      ${side
        ? html`<aside class="ex-side" aria-label=${t('filters.title')}>
            <div class="ex-side-head">
              <h2 class="ex-side-title">${t('filters.title')}</h2>
              ${active ? html`<button type="button" class="link-btn" onClick=${() => setFilters(defaultFilters())}>${t('filters.clearAll')}</button>` : null}
            </div>
            ${saved}
            ${panel}
          </aside>`
        : null}
      <div class="ex-main stack">
        <${SummaryStrip} summary=${summary} curve=${curve} simHref=${withQuery('/simulator', fqs)} />

        <div class="ex-toolbar" role="search">
          <div class="ex-search">
            <${SearchInput}
              label=${t('filters.search')}
              value=${filters.q}
              placeholder=${t('filters.searchPlaceholder')}
              clearLabel=${t('filters.clearSearch')}
              onValue=${(/** @type {string} */ q) => setFilters({ ...filters, q })}
            />
          </div>
          ${side ? null : html`<${FilterButton} count=${active} onClick=${() => setPanelOpen(true)} expanded=${panelOpen} />`}
        </div>

        <${ActiveFilters} filters=${filters} onChange=${setFilters} />

        <div class="ex-listhead" id="explorer-results">
          <p class="ex-count num" data-testid="explorer-count" aria-live="polite">${t('explorer.count', { count: list.length, n: list.length })}</p>
          <div class="ex-sort">
            <${Select}
              label=${t('explorer.sortBy')}
              hideLabel
              value=${view.sort}
              options=${SORT_KEYS.map((k) => ({ value: k, label: t(`explorer.sort.${k}`) }))}
              onValue=${(/** @type {string} */ k) => setSort(k, SORT_DEFAULT_DIR[k])}
            />
            <${IconButton}
              icon=${view.dir === 'asc' ? 'arrow-up' : 'arrow-down'}
              label=${view.dir === 'asc' ? t('explorer.dirAsc') : t('explorer.dirDesc')}
              onClick=${() => setSort(view.sort, view.dir === 'asc' ? 'desc' : 'asc')}
              data-testid="sort-dir"
            />
          </div>
        </div>

        ${list.length
          ? tableMode
            ? html`<${PickTable}
                picks=${paged.items}
                sort=${view.sort}
                dir=${view.dir}
                caption=${t('explorer.count', { count: list.length, n: list.length })}
                hrefOf=${(/** @type {Pick} */ p) => `#${detailPath(p)}`}
                onSort=${(/** @type {string} */ k) => setSort(k, k === view.sort ? (view.dir === 'asc' ? 'desc' : 'asc') : SORT_DEFAULT_DIR[k])}
              />`
            : html`<div class="pick-list" data-testid="explorer-cards">${paged.items.map((p) => html`<${PickCard} key=${p.uid} pick=${p} onOpen=${open} />`)}</div>`
          : html`<${EmptyState}
              title=${t('explorer.emptyTitle')}
              body=${t('explorer.emptyBody')}
              action=${active ? html`<${Button} variant="secondary" onClick=${() => setFilters(defaultFilters())}>${t('filters.clearAll')}</${Button}>` : null}
              testId="explorer-empty"
            />`}
        <${Pagination} page=${paged.page} pageCount=${paged.pageCount} onPage=${setPage} total=${list.length} />
      </div>
    </div>

    ${side
      ? null
      : html`<${BottomSheet}
          open=${panelOpen}
          title=${t('filters.title')}
          onClose=${() => setPanelOpen(false)}
          testId="filter-sheet"
          size="lg"
          footer=${html`<div class="ex-sheet-foot">
            <${Button} variant="ghost" onClick=${() => setFilters(defaultFilters())} disabled=${!active}>${t('filters.clearAll')}</${Button}>
            <${Button} variant="primary" onClick=${() => setPanelOpen(false)} data-testid="filter-show">${t('filters.showN', { count: list.length, n: list.length })}</${Button}>
          </div>`}
        >
          <${ActiveFilters} filters=${filters} onChange=${setFilters} clearAll=${false} testId="sheet-active-filters" />
          ${saved}
          ${panel}
        </${BottomSheet}>`}

    ${uid
      ? html`<${PickDetail}
          pick=${detail}
          pinnacle=${data.pinnacle}
          position=${{ index: nb ? nb.index : -1, total: list.length }}
          onPrev=${nb && nb.prev ? () => navigate(detailPath(/** @type {Pick} */ (nb.prev)), { replace: true }) : null}
          onNext=${nb && nb.next ? () => navigate(detailPath(/** @type {Pick} */ (nb.next)), { replace: true }) : null}
          onClose=${() => {
            if (detail) restore = { y: restore ? restore.y : 0, uid: detail.uid };
            goBack(withQuery('/explorer', qsNow));
          }}
        />`
      : null}
  </div>`;
}

/** @param {{ params: Record<string, string>, query: Record<string, string> }} props */
export function ExplorerScreen({ params, query }) {
  return html`<${FeedGate}>${(data) => html`<${Explorer} data=${data} query=${query} uid=${params.uid || null} />`}</${FeedGate}>`;
}
