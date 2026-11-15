// Analysis (#/analysis/:part, "Análisis"): where the edge is and whether the numbers are honest.
// Four parts, one visible at a time (the part is in the path): breakdown, calibration, price against
// the close, Grok vs Claude. The shared filter panel applies to all of them; filters and the section's
// own view keys live in the hash query (see view.js), so every view is a bookmark and other sections
// can link here with a filter (`#/analysis?tag=near_value&date=30d`).
import { html, useMemo, useState } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { SIDE_PANEL_QUERY } from '../../lib/links.js';
import { navigate, href } from '../../lib/router.js';
import {
  FeedGate, BottomSheet, Button, Disclosure, FilterPanel, ActiveFilters, FilterButton, SavedFilters, useMediaQuery,
} from '../../lib/ui/index.js';
import { applyFilters, fromQuery, toQueryString, countActive, defaultFilters } from '../../data/filters.js';
import { grokScope } from '../../data/analysis.js';
import { todayIn } from '../../lib/format.js';
import { APP_TIMEZONE } from '../../config.js';
import { PARTS, partOf, viewOf, analysisPath } from './view.js';
import { Breakdown } from './breakdown.js';
import { Calibration } from './calibration.js';
import { CloseQuality } from './close.js';
import { GrokVsClaude } from './grok.js';

/** @typedef {import('../../data/filters.js').FilterState} FilterState */
/** @typedef {import('./view.js').View} View */

const SIDE_QUERY = SIDE_PANEL_QUERY;

/** @param {{ data: import('../../data/types').Dataset, query: Record<string, string>, part: string, bare: boolean }} props */
function Analysis({ data, query, part, bare }) {
  const filters = useMemo(() => fromQuery(query), [query]);
  const fqs = toQueryString(filters);
  const view = viewOf(query);
  const today = todayIn(APP_TIMEZONE);
  const side = useMediaQuery(SIDE_QUERY);
  const [panelOpen, setPanelOpen] = useState(false);
  const active = countActive(filters);

  const list = useMemo(() => applyFilters(data.picks, filters, { today }), [data, fqs, today]);
  // The Grok part chooses its own sources (Grok, and Sombra's team corners for the comparison).
  const grokFilters = useMemo(() => grokScope(filters), [fqs]);
  const grokList = useMemo(() => (part === 'grok' ? applyFilters(data.picks, grokFilters, { today }) : []), [data, fqs, today, part]);

  /** @param {FilterState} next */
  const setFilters = (next) => navigate(analysisPath(part, next, view, bare), { replace: true });
  /** @param {Partial<View>} patch */
  const setView = (patch) => navigate(analysisPath(part, filters, { ...view, ...patch }, bare), { replace: true });

  const panel = html`<${FilterPanel} picks=${data.picks} filters=${filters} onChange=${setFilters} today=${today} />`;
  const saved = html`<${Disclosure} summary=${t('analysis.savedAndStarting')}><${SavedFilters} filters=${filters} onApply=${setFilters} /></${Disclosure}>`;

  return html`<div class=${`analysis${side ? ' an-has-side' : ''}`}>
    <div class="an-layout">
      ${side
        ? html`<aside class="an-side-panel" aria-label=${t('filters.title')}>
            <div class="an-side-head">
              <h2 class="an-side-title">${t('filters.title')}</h2>
              ${active ? html`<button type="button" class="link-btn" onClick=${() => setFilters(defaultFilters())}>${t('filters.clearAll')}</button>` : null}
            </div>
            ${saved}
            ${panel}
          </aside>`
        : null}
      <div class="an-main stack">
        <nav class="an-tabs" aria-label=${t('analysis.partsLabel')} data-testid="analysis-tabs">
          ${PARTS.map(
            (p) => html`<a
              href=${href(analysisPath(p, filters, view))}
              class=${p === part ? 'an-tab an-tab-on' : 'an-tab'}
              aria-current=${p === part ? 'page' : undefined}
              data-testid=${`analysis-tab-${p}`}
            >${t(`analysis.part.${p}`)}</a>`,
          )}
        </nav>

        <div class="an-toolbar">
          <p class="an-count num" data-testid="analysis-count" aria-live="polite">
            ${part === 'grok'
              ? t('analysis.countGrok', { count: grokList.filter((p) => p.source === 'grok').length, n: grokList.filter((p) => p.source === 'grok').length })
              : t('analysis.count', { count: list.length, n: list.length })}
          </p>
          ${side ? null : html`<${FilterButton} count=${active} onClick=${() => setPanelOpen(true)} expanded=${panelOpen} />`}
        </div>
        <${ActiveFilters} filters=${filters} onChange=${setFilters} />

        ${part === 'breakdown' ? html`<${Breakdown} picks=${list} all=${data.picks} today=${today} filters=${filters} view=${view} setView=${setView} />` : null}
        ${part === 'calibration' ? html`<${Calibration} picks=${list} view=${view} setView=${setView} />` : null}
        ${part === 'close' ? html`<${CloseQuality} picks=${list} pinnacle=${data.pinnacle} />` : null}
        ${part === 'grok'
          ? html`<${GrokVsClaude} picks=${grokList} filters=${grokFilters} scopeNote=${filters.sources.length > 0 || filters.tags.length > 0} />`
          : null}
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
          footer=${html`<div class="an-sheet-foot">
            <${Button} variant="ghost" onClick=${() => setFilters(defaultFilters())} disabled=${!active}>${t('filters.clearAll')}</${Button}>
            <${Button} variant="primary" onClick=${() => setPanelOpen(false)} data-testid="filter-show">${t('filters.showN', { count: list.length, n: list.length })}</${Button}>
          </div>`}
        >
          <${ActiveFilters} filters=${filters} onChange=${setFilters} clearAll=${false} testId="sheet-active-filters" />
          ${saved}
          ${panel}
        </${BottomSheet}>`}
  </div>`;
}

/** @param {{ params: Record<string, string>, query: Record<string, string> }} props */
export function AnalysisScreen({ params, query }) {
  const part = partOf(params.part);
  return html`<${FeedGate}>${(data) => html`<${Analysis} data=${data} query=${query} part=${part} bare=${!params.part} />`}</${FeedGate}>`;
}
