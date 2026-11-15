// The shared filter panel (Explorer, Simulator, Analysis). A controlled component over the filter
// state of src/data/filters.js: it never reads or writes the URL itself; the screen owns the state
// (usually the hash query) and passes `filters` + `onChange`.
//
//   const f = fromQuery(query);
//   const set = (next) => navigate(`/simulator?${toQueryString(next)}`, { replace: true });
//   <FilterButton count=${countActive(f)} onClick=${() => setOpen(true)} />
//   <ActiveFilters filters=${f} onChange=${set} />
//   <FilterPanel picks=${data.picks} filters=${f} onChange=${set} hide=${['q']} />
//   <SavedFilters filters=${f} onApply=${set} />
//
// Option counts are "how many picks this option would show with the other filters as they are"
// (facetCounts); options that would show nothing are disabled, or hidden in the long lists.
import { html, useMemo, useState, useEffect, useId } from '../../../vendor/preact.js';
import { t } from '../i18n.js';
import { formatDate, formatPct, todayIn } from '../format.js';
import { toast } from '../toast.js';
import { APP_TIMEZONE } from '../../config.js';
import {
  defaultFilters, facetCounts, filterOptions, activeEntries, removeEntry, countActive, toQueryString, fromQueryString,
  PRICE_PRESETS, DATE_PRESETS, BUILTIN_PRESETS, builtinPreset,
} from '../../data/filters.js';
import { TAG_GROUPS, tagLabel } from '../../data/tags.js';
import { LINE_SCOPES, lineLabel, lineScopeLabel, parseLineKey } from '../../data/lines.js';
import { useSettings, savePreset, deletePreset } from '../../data/settings.js';
import { Icon } from './icons.js';
import { Button, IconButton, FilterChip, SegmentedControl, RangeInput, SearchInput, TextField } from './controls.js';

/** @typedef {import('../../data/filters.js').FilterState} FilterState */
/** @typedef {import('../../data/filters.js').ActiveEntry} ActiveEntry */
/** @typedef {import('../../data/types').Pick} Pick */

/** Section ids in display order (the most used first). Pass some in `hide` to leave them out. */
export const FILTER_SECTIONS = ['q', 'source', 'tag', 'price', 'date', 'market', 'line', 'status', 'league', 'book', 'close', 'ref', 'sample', 'fuerza', 'reason', 'numbers'];
const OPEN_BY_DEFAULT = ['q', 'source', 'tag', 'price', 'date', 'line'];
/** Long lists show this many options until "show all". */
const SHORT_LIST = 12;

/**
 * Follow a CSS media query.
 * @param {string} query e.g. '(min-width: 1200px)'
 */
export function useMediaQuery(query) {
  const get = () => typeof matchMedia !== 'undefined' && matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return undefined;
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

// ---------------------------------------------------------------- labels

const pct = (/** @type {number} */ v) => formatPct(v, { sign: false, digits: 1 });
const pctSigned = (/** @type {number} */ v) => formatPct(v);

/** '≥ 1.80', '≤ 2.00', '1.80–2.00'. @param {{ min: number | null, max: number | null }} r @param {(v: number) => string} fmt */
function rangeText(r, fmt) {
  if (r.min != null && r.max != null) return t('filters.rangeBoth', { min: fmt(r.min), max: fmt(r.max) });
  if (r.min != null) return t('filters.rangeMin', { min: fmt(r.min) });
  return t('filters.rangeMax', { max: fmt(/** @type {number} */ (r.max)) });
}

/** Label of one value of a list field. @param {string} field @param {string} v */
export function optionLabel(field, v) {
  switch (field) {
    case 'sources':
      return t(`sources.${v}`);
    case 'tags':
      return tagLabel(/** @type {any} */ (v));
    case 'markets':
      return t(`markets.${v}`);
    case 'statuses':
      return t(`status.${v}`);
    case 'refs':
      return t(`filters.refs.${v}`);
    case 'fuerza':
      return t(`filters.fuerzaValue.${v}`);
    case 'reasons':
      return t(`filters.reasons.${v}`);
    case 'sides':
      return t(`lines.side.${v}`);
    case 'lines':
      return lineLabel(v);
    default:
      return v;
  }
}

/**
 * The words of an active filter, for its chip.
 * @param {ActiveEntry} e @param {FilterState} f
 */
export function entryLabel(e, f) {
  const v = e.value || '';
  switch (e.field) {
    case 'pricePreset':
      return t('filters.entry.price', { range: PRICE_PRESETS.find((p) => p.id === v)?.label || v });
    case 'price':
      return t('filters.entry.price', { range: rangeText(f.price, (x) => x.toFixed(2)) });
    case 'slate':
      return t('filters.entry.slate', { date: formatDate(v, 'medium') });
    case 'date': {
      if (f.datePreset === 'since') return t('filters.entry.date', { range: `${t('filters.since')} ${formatDate(f.dateFrom || '', 'medium')}` });
      if (f.datePreset) return t('filters.entry.date', { range: t(`filters.datePreset.${f.datePreset}`) });
      const from = f.dateFrom ? formatDate(f.dateFrom, 'medium') : '…';
      const to = f.dateTo ? formatDate(f.dateTo, 'medium') : '…';
      return t('filters.entry.date', { range: `${from} – ${to}` });
    }
    case 'hasClose':
    case 'twoSidedClose':
      return t(`filters.entry.${e.field}`, { v: t(`filters.${v}`) });
    case 'samples':
      return t('filters.entry.sample', { v });
    case 'fuerza':
      return t('filters.entry.fuerza', { v: optionLabel('fuerza', v) });
    case 'ev':
      return t('filters.entry.ev', { range: rangeText(f.ev, pctSigned) });
    case 'prob':
      return t('filters.entry.prob', { range: rangeText(f.prob, pct) });
    case 'q':
      return t('filters.entry.q', { q: v });
    case 'sides':
      return t('lines.filter.entrySide', { v: optionLabel('sides', v) });
    case 'lines': {
      // "Under 4.5" when every chosen line is of one kind of market, "Tarjetas: Under 4.5" otherwise.
      const scopes = new Set(f.lines.map((k) => (parseLineKey(k) || { scope: '' }).scope));
      return lineLabel(v, { scope: scopes.size > 1 });
    }
    case 'passedAll':
      return t('lines.filter.entryPassedAll', { v: t(`filters.${v}`) });
    default:
      return optionLabel(e.field, v);
  }
}

// ---------------------------------------------------------------- small pieces

/** Collapsible section with a heading button (aria-expanded) and an "n active" badge. */
function Section({ id, title, active = 0, open, onToggle, children }) {
  const bodyId = useId();
  return html`<section class=${`fp-section${open ? ' fp-open' : ''}`} data-section=${id}>
    <h3 class="fp-section-head">
      <button type="button" class="fp-toggle" aria-expanded=${open ? 'true' : 'false'} aria-controls=${bodyId} onClick=${onToggle}>
        <span class="fp-section-title">${title}</span>
        ${active ? html`<span class="fp-badge num" aria-label=${t('filters.openCount', { count: active })}>${active}</span>` : null}
        <${Icon} name="chevron-down" size=${16} />
      </button>
    </h3>
    ${open ? html`<div class="fp-section-body" id=${bodyId}>${children}</div>` : null}
  </section>`;
}

/**
 * Multi-select chips over a list field, with live counts. Options at 0 are disabled (short lists) or
 * hidden (long lists), except when selected.
 * @param {{ field: string, options: Array<{ value: string, count: number }>, selected: string[], counts: Record<string, number>,
 *   onToggle: (v: string) => void, long?: boolean, label?: string }} props
 */
function ChipGroup({ field, options, selected, counts, onToggle, long = false, label }) {
  const [all, setAll] = useState(false);
  const shown = long ? options.filter((o) => (counts[o.value] || 0) > 0 || selected.includes(o.value)) : options;
  const cut = long && !all && shown.length > SHORT_LIST + 2 ? shown.slice(0, SHORT_LIST) : shown;
  return html`<div class="fp-chips" role="group" aria-label=${label}>
    ${cut.map((o) => {
      const n = counts[o.value] || 0;
      const on = selected.includes(o.value);
      return html`<${FilterChip}
        label=${optionLabel(field, o.value)}
        count=${n}
        selected=${on}
        disabled=${!on && n === 0}
        onToggle=${() => onToggle(o.value)}
        testId=${`fchip-${field}-${o.value}`}
      />`;
    })}
    ${long && shown.length > cut.length
      ? html`<button type="button" class="link-btn" onClick=${() => setAll(true)}>${t('filters.showAll', { n: shown.length })}</button>`
      : null}
    ${long && all && shown.length > SHORT_LIST + 2 ? html`<button type="button" class="link-btn" onClick=${() => setAll(false)}>${t('filters.showLess')}</button>` : null}
  </div>`;
}

/** Native date input. @param {{ label: string, value: string | null, onValue: (v: string | null) => void, testId?: string }} props */
function DateField({ label, value, onValue, testId }) {
  const id = useId();
  return html`<div class="field">
    <label class="field-label" for=${id}>${label}</label>
    <div class="input-wrap">
      <input id=${id} type="date" value=${value || ''} data-testid=${testId} onChange=${(/** @type {any} */ e) => onValue(e.currentTarget.value || null)} />
    </div>
  </div>`;
}

/** Fraction range edited in percent. */
function PercentRange({ label, value, onValue }) {
  const toPct = (/** @type {number | null} */ v) => (v == null ? null : Math.round(v * 1e6) / 1e4);
  const toFrac = (/** @type {number | null} */ v) => (v == null ? null : Math.round(v * 1e4) / 1e6);
  return html`<${RangeInput}
    label=${label}
    unit="%"
    minLabel=${t('filters.min')}
    maxLabel=${t('filters.max')}
    value=${{ min: toPct(value.min), max: toPct(value.max) }}
    onValue=${(/** @type {{ min: number | null, max: number | null }} */ r) => onValue({ min: toFrac(r.min), max: toFrac(r.max) })}
  />`;
}

/** Yes / no / any for a boolean filter. */
function TriState({ label, value, counts, onValue }) {
  return html`<${SegmentedControl}
    label=${label}
    value=${value == null ? 'any' : value ? 'yes' : 'no'}
    options=${[
      { value: 'any', label: t('filters.any') },
      { value: 'yes', label: html`${t('filters.yes')} <span class="num fp-seg-n">${counts.yes}</span>` },
      { value: 'no', label: html`${t('filters.no')} <span class="num fp-seg-n">${counts.no}</span>` },
    ]}
    onValue=${(/** @type {string} */ v) => onValue(v === 'any' ? null : v === 'yes')}
  />`;
}

// ---------------------------------------------------------------- the panel

/**
 * Every field of the filter state, grouped in collapsible sections, with live counts.
 * @param {{ picks: Pick[], filters: FilterState, onChange: (f: FilterState) => void, hide?: string[], today?: string, testId?: string }} props
 */
export function FilterPanel({ picks, filters: f, onChange, hide = [], today, testId = 'filter-panel' }) {
  const day = today || todayIn(APP_TIMEZONE);
  const options = useMemo(() => filterOptions(picks), [picks]);
  const counts = useMemo(() => facetCounts(picks, f, { today: day }), [picks, toQueryString(f), day]);
  const [open, setOpen] = useState(() => {
    /** @type {Record<string, boolean>} */
    const o = {};
    for (const id of FILTER_SECTIONS) o[id] = OPEN_BY_DEFAULT.includes(id);
    return o;
  });
  const [leagueQ, setLeagueQ] = useState('');
  const set = (/** @type {Partial<FilterState>} */ patch) => onChange({ ...f, ...patch });
  const toggleIn = (/** @type {keyof FilterState} */ field, /** @type {string} */ v) => {
    const cur = /** @type {string[]} */ (f[field]);
    set({ [field]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const shown = (/** @type {string} */ id) => !hide.includes(id);
  const sec = (/** @type {string} */ id, /** @type {string} */ title, /** @type {number} */ active, /** @type {any} */ body) =>
    shown(id)
      ? html`<${Section} id=${id} title=${title} active=${active} open=${open[id] || false} onToggle=${() => setOpen({ ...open, [id]: !open[id] })}>${body}</${Section}>`
      : null;

  const fold = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const leagues = leagueQ ? options.leagues.filter((o) => fold(o.value).includes(fold(leagueQ))) : options.leagues;
  const rawMarkets = options.marketsRaw.filter((o) => !f.markets.length || picks.some((p) => p.marketRaw === o.value && f.markets.includes(p.market)));
  const tagGroups = TAG_GROUPS.map((g) => ({ ...g, options: options.tags.filter((o) => g.tags.includes(/** @type {any} */ (o.value))) })).filter((g) => g.options.length);
  const dateActive = (f.datePreset || f.dateFrom || f.dateTo ? 1 : 0) + (f.slate ? 1 : 0);
  const priceActive = f.pricePreset || f.price.min != null || f.price.max != null ? 1 : 0;
  const rangeOn = (/** @type {{ min: number | null, max: number | null }} */ r) => (r.min != null || r.max != null ? 1 : 0);

  return html`<div class="filter-panel" data-testid=${testId}>
    <p class="fp-live num" aria-live="polite" data-testid="filter-live-count">${t('filters.liveCount', { count: counts.total, n: counts.total })}</p>

    ${sec('q', t('filters.search'), f.q ? 1 : 0, html`<${SearchInput}
      label=${t('filters.search')}
      value=${f.q}
      placeholder=${t('filters.searchPlaceholder')}
      clearLabel=${t('filters.clearSearch')}
      onValue=${(/** @type {string} */ q) => set({ q })}
    />`)}

    ${sec('source', t('filters.source'), f.sources.length, html`<${ChipGroup}
      field="sources" label=${t('filters.source')} options=${options.sources} selected=${f.sources} counts=${counts.sources}
      onToggle=${(/** @type {string} */ v) => toggleIn('sources', v)}
    />`)}

    ${sec('tag', t('filters.tag'), f.tags.length, html`<div class="fp-groups">
      ${tagGroups.map(
        (g) => html`<div class="fp-group">
          <h4 class="fp-group-title">${t(`filters.tagGroup.${g.id}`)}</h4>
          <${ChipGroup} field="tags" label=${t(`filters.tagGroup.${g.id}`)} options=${g.options} selected=${f.tags} counts=${counts.tags}
            onToggle=${(/** @type {string} */ v) => toggleIn('tags', v)} />
        </div>`,
      )}
    </div>`)}

    ${sec('price', t('filters.price'), priceActive, html`
      <div class="fp-chips" role="group" aria-label=${t('filters.price')}>
        ${PRICE_PRESETS.filter((p) => !p.hidden || f.pricePreset === p.id).map((p) => {
          const on = f.pricePreset === p.id;
          const n = counts.pricePresets[p.id] || 0;
          return html`<${FilterChip} label=${p.label} count=${n} selected=${on} disabled=${!on && n === 0} testId=${`fchip-price-${p.id}`}
            onToggle=${() => set({ pricePreset: on ? null : p.id, price: { min: null, max: null } })} />`;
        })}
      </div>
      <${RangeInput}
        label=${t('filters.priceCustom')}
        minLabel=${t('filters.min')}
        maxLabel=${t('filters.max')}
        value=${f.price}
        onValue=${(/** @type {{ min: number | null, max: number | null }} */ price) => set({ price, pricePreset: null })}
      />`)}

    ${sec('date', t('filters.date'), dateActive, html`
      <div class="fp-chips" role="group" aria-label=${t('filters.datePresets')}>
        ${DATE_PRESETS.map((id) => {
          const on = f.datePreset === id;
          const n = counts.datePresets[id] || 0;
          return html`<${FilterChip} label=${t(`filters.datePreset.${id}`)} count=${id === 'since' ? undefined : n} selected=${on}
            disabled=${!on && id !== 'since' && n === 0} testId=${`fchip-date-${id}`}
            onToggle=${() => set({ datePreset: on ? null : id, slate: null, dateTo: null, dateFrom: id === 'since' ? f.dateFrom || null : null })} />`;
        })}
      </div>
      ${f.datePreset === 'since'
        ? html`<${DateField} label=${t('filters.since')} value=${f.dateFrom} testId="fp-since" onValue=${(/** @type {string | null} */ dateFrom) => set({ dateFrom })} />`
        : html`<fieldset class="field fp-range">
            <legend class="field-label">${t('filters.dateRange')}</legend>
            <div class="grid-2">
              <${DateField} label=${t('filters.from')} value=${f.dateFrom} testId="fp-from" onValue=${(/** @type {string | null} */ dateFrom) => set({ dateFrom, datePreset: null, slate: null })} />
              <${DateField} label=${t('filters.to')} value=${f.dateTo} testId="fp-to" onValue=${(/** @type {string | null} */ dateTo) => set({ dateTo, datePreset: null, slate: null })} />
            </div>
          </fieldset>`}
      <${SlateSelect} slates=${options.slates} counts=${counts.slates} value=${f.slate}
        onValue=${(/** @type {string | null} */ slate) => set({ slate, datePreset: null, dateFrom: null, dateTo: null })} />`)}

    ${sec('market', t('filters.marketFamily'), f.markets.length + f.marketsRaw.length, html`
      <${ChipGroup} field="markets" label=${t('filters.marketFamily')} options=${options.markets} selected=${f.markets} counts=${counts.markets}
        onToggle=${(/** @type {string} */ v) => toggleIn('markets', v)} />
      <h4 class="fp-group-title">${t('filters.marketRaw')}</h4>
      <${ChipGroup} field="marketsRaw" long label=${t('filters.marketRaw')} options=${rawMarkets} selected=${f.marketsRaw} counts=${counts.marketsRaw}
        onToggle=${(/** @type {string} */ v) => toggleIn('marketsRaw', v)} />`)}

    ${options.lines.length
      ? sec('line', t('lines.filter.title'), f.sides.length + f.lines.length, html`<${LineSection} options=${options} counts=${counts} filters=${f}
          onToggle=${toggleIn} />`)
      : null}

    ${sec('status', t('filters.status'), f.statuses.length, html`<${ChipGroup}
      field="statuses" label=${t('filters.status')} options=${options.statuses} selected=${f.statuses} counts=${counts.statuses}
      onToggle=${(/** @type {string} */ v) => toggleIn('statuses', v)} />`)}

    ${sec('league', t('filters.league'), f.leagues.length, html`
      <${SearchInput} label=${t('filters.leagueSearch')} value=${leagueQ} placeholder=${t('filters.leagueSearch')} clearLabel=${t('filters.clearSearch')}
        onValue=${setLeagueQ} />
      ${leagues.length
        ? html`<${ChipGroup} field="leagues" long label=${t('filters.league')} options=${leagues} selected=${f.leagues} counts=${counts.leagues}
            onToggle=${(/** @type {string} */ v) => toggleIn('leagues', v)} />`
        : html`<p class="muted small">${t('filters.leagueNone')}</p>`}`)}

    ${sec('book', t('filters.book'), f.books.length, html`<${ChipGroup}
      field="books" label=${t('filters.book')} options=${options.books} selected=${f.books} counts=${counts.books}
      onToggle=${(/** @type {string} */ v) => toggleIn('books', v)} />`)}

    ${sec('close', t('filters.close'), (f.hasClose != null ? 1 : 0) + (f.twoSidedClose != null ? 1 : 0), html`
      <${TriState} label=${t('filters.hasClose')} value=${f.hasClose} counts=${counts.hasClose} onValue=${(/** @type {boolean | null} */ hasClose) => set({ hasClose })} />
      <${TriState} label=${t('filters.twoSidedClose')} value=${f.twoSidedClose} counts=${counts.twoSidedClose}
        onValue=${(/** @type {boolean | null} */ twoSidedClose) => set({ twoSidedClose })} />`)}

    ${sec('ref', t('filters.ref'), f.refs.length, html`<${ChipGroup}
      field="refs" label=${t('filters.ref')} options=${options.refs} selected=${f.refs} counts=${counts.refs}
      onToggle=${(/** @type {string} */ v) => toggleIn('refs', v)} />`)}

    ${sec('sample', t('filters.sample'), f.samples.length, html`<${ChipGroup}
      field="samples" label=${t('filters.sample')} options=${options.samples} selected=${f.samples} counts=${counts.samples}
      onToggle=${(/** @type {string} */ v) => toggleIn('samples', v)} />`)}

    ${sec('fuerza', t('filters.fuerza'), f.fuerza.length, html`<${ChipGroup}
      field="fuerza" label=${t('filters.fuerza')} options=${options.fuerza} selected=${f.fuerza} counts=${counts.fuerza}
      onToggle=${(/** @type {string} */ v) => toggleIn('fuerza', v)} />`)}

    ${sec('reason', t('filters.reason'), f.reasons.length + (f.passedAll != null ? 1 : 0), html`<${ChipGroup}
      field="reasons" label=${t('filters.reason')} options=${options.reasons} selected=${f.reasons} counts=${counts.reasons}
      onToggle=${(/** @type {string} */ v) => toggleIn('reasons', v)} />
      <${TriState} label=${t('lines.filter.passedAll')} value=${f.passedAll} counts=${counts.passedAll}
        onValue=${(/** @type {boolean | null} */ passedAll) => set({ passedAll })} />`)}

    ${sec('numbers', t('filters.numbers'), rangeOn(f.ev) + rangeOn(f.prob), html`
      <${PercentRange} label=${t('filters.ev')} value=${f.ev} onValue=${(/** @type {any} */ ev) => set({ ev })} />
      <${PercentRange} label=${t('filters.prob')} value=${f.prob} onValue=${(/** @type {any} */ prob) => set({ prob })} />`)}
  </div>`;
}

/**
 * The "Línea" section: side chips (Over, Under) and the lines that exist under the other filters,
 * grouped by kind of market (cards, corners…) when they span several, each group sorted by line.
 * @param {{ options: Record<string, Array<{ value: string, count: number }>>, counts: Record<string, any>, filters: FilterState,
 *   onToggle: (field: keyof FilterState, v: string) => void }} props
 */
function LineSection({ options, counts, filters: f, onToggle }) {
  const visible = options.lines.filter((o) => (counts.lines[o.value] || 0) > 0 || f.lines.includes(o.value));
  /** @type {Map<string, Array<{ value: string, count: number }>>} */
  const byScope = new Map();
  for (const o of visible) {
    const scope = (parseLineKey(o.value) || { scope: 'other' }).scope;
    if (!byScope.has(scope)) byScope.set(scope, []);
    /** @type {any[]} */ (byScope.get(scope)).push(o);
  }
  const groups = [...byScope.entries()].sort((a, b) => LINE_SCOPES.indexOf(a[0]) - LINE_SCOPES.indexOf(b[0]));
  const toggle = (/** @type {string} */ v) => onToggle('lines', v);
  return html`<div class="fp-lines" data-testid="fp-lines">
    ${options.sides.length
      ? html`<h4 class="fp-group-title">${t('lines.filter.side')}</h4>
          <${ChipGroup} field="sides" label=${t('lines.filter.side')} options=${options.sides} selected=${f.sides} counts=${counts.sides}
            onToggle=${(/** @type {string} */ v) => onToggle('sides', v)} />`
      : null}
    ${!groups.length ? html`<p class="muted small">${t('lines.filter.none')}</p>` : null}
    ${groups.length === 1
      ? html`<h4 class="fp-group-title">${t('lines.filter.lines')} · ${lineScopeLabel(groups[0][0])}</h4>
          <${ChipGroup} field="lines" long label=${t('lines.filter.lines')} options=${groups[0][1]} selected=${f.lines} counts=${counts.lines} onToggle=${toggle} />`
      : html`<div class="fp-groups">
          ${groups.map(
            ([scope, opts]) => html`<div class="fp-group" data-scope=${scope}>
              <h4 class="fp-group-title">${lineScopeLabel(scope)}</h4>
              <${ChipGroup} field="lines" long label=${lineScopeLabel(scope)} options=${opts} selected=${f.lines} counts=${counts.lines} onToggle=${toggle} />
            </div>`,
          )}
        </div>`}
    <p class="muted xs">${t('lines.filter.hint')}</p>
  </div>`;
}

/** One slate (match date) out of the dates in the data, with counts. */
function SlateSelect({ slates, counts, value, onValue }) {
  const id = useId();
  return html`<div class="field">
    <label class="field-label" for=${id}>${t('filters.slate')}</label>
    <div class="select-wrap">
      <select id=${id} data-testid="fp-slate" onChange=${(/** @type {any} */ e) => onValue(e.currentTarget.value || null)}>
        <option value="" selected=${!value}>${t('filters.anySlate')}</option>
        ${slates.map(
          (/** @type {{ value: string }} */ o) => html`<option value=${o.value} selected=${o.value === value} disabled=${!(counts[o.value] > 0) && o.value !== value}>
            ${formatDate(o.value, 'medium')} (${counts[o.value] || 0})
          </option>`,
        )}
      </select>
      <${Icon} name="chevron-down" size=${16} />
    </div>
  </div>`;
}

// ---------------------------------------------------------------- active chips and the button

/**
 * What is active, as removable chips, plus "clear all". Renders nothing when no filter is on.
 * @param {{ filters: FilterState, onChange: (f: FilterState) => void, clearAll?: boolean, testId?: string }} props
 *   clearAll: false leaves out the "clear all" link (when the container has its own)
 */
export function ActiveFilters({ filters: f, onChange, clearAll = true, testId = 'active-filters' }) {
  const entries = activeEntries(f);
  if (!entries.length) return null;
  return html`<div class="active-filters" role="group" aria-label=${t('filters.active')} data-testid=${testId}>
    ${entries.map((e) => {
      const label = entryLabel(e, f);
      return html`<button type="button" class="af-chip" onClick=${() => onChange(removeEntry(f, e))} aria-label=${t('filters.remove', { label })}
        data-field=${e.field}>
        <span>${label}</span><${Icon} name="close" size=${14} />
      </button>`;
    })}
    ${clearAll && entries.length > 1 ? html`<button type="button" class="link-btn af-clear" onClick=${() => onChange(defaultFilters())}>${t('filters.clearAll')}</button>` : null}
  </div>`;
}

/**
 * "Filtros" button with the number of active filters.
 * @param {{ count: number, onClick: () => void, expanded?: boolean, testId?: string }} props
 */
export function FilterButton({ count, onClick, expanded, testId = 'filter-button' }) {
  return html`<button type="button" class=${`btn btn-secondary filter-btn${count ? ' filter-btn-on' : ''}`} onClick=${onClick}
    aria-label=${count ? t('filters.openCount', { count }) : t('filters.open')} aria-expanded=${expanded == null ? undefined : expanded ? 'true' : 'false'}
    data-testid=${testId}>
    <${Icon} name="filter" size=${18} />
    <span>${t('filters.open')}</span>
    ${count ? html`<span class="filter-btn-n num" aria-hidden="true">${count}</span>` : null}
  </button>`;
}

// ---------------------------------------------------------------- saved filters

/**
 * Built-in starting points, the user's saved filters (Settings → presets) and "save this filter".
 * Applying one only fills the panel (calls onApply with the full state).
 * @param {{ filters: FilterState, onApply: (f: FilterState) => void, testId?: string }} props
 */
export function SavedFilters({ filters: f, onApply, testId = 'saved-filters' }) {
  const s = useSettings();
  const [name, setName] = useState('');
  const active = countActive(f) > 0;
  const current = toQueryString(f);
  const save = () => {
    const n = name.trim();
    if (!n || !active) return;
    savePreset(n, current);
    setName('');
    toast(t('filters.saved_toast', { name: n }), { tone: 'success' });
  };
  return html`<div class="saved-filters" data-testid=${testId}>
    <div class="stack-sm">
      <h4 class="fp-group-title">${t('filters.saved')}</h4>
      ${s.presets.length
        ? html`<ul class="sf-list">
            ${s.presets.map(
              (p) => html`<li class=${`sf-item${p.query === current ? ' sf-current' : ''}`}>
                <button type="button" class="sf-apply" onClick=${() => onApply(fromQueryString(p.query))} aria-label=${t('filters.apply', { name: p.name })}>
                  <${Icon} name=${p.query === current ? 'check' : 'filter'} size=${16} /><span>${p.name}</span>
                </button>
                <${IconButton} icon="trash" label=${t('filters.deleteSaved', { name: p.name })} onClick=${() => {
                  deletePreset(p.id);
                  toast(t('filters.deleted_toast', { name: p.name }));
                }} />
              </li>`,
            )}
          </ul>`
        : html`<p class="muted small">${t('filters.savedEmpty')}</p>`}
      <form class="sf-save" onSubmit=${(/** @type {Event} */ e) => { e.preventDefault(); save(); }}>
        <${TextField} label=${t('filters.saveName')} value=${name} onValue=${setName} maxLength=${40} hint=${active ? undefined : t('filters.saveDisabled')} />
        <${Button} type="submit" icon="save" disabled=${!active || !name.trim()}>${t('filters.save')}</${Button}>
      </form>
    </div>
    <div class="stack-sm">
      <h4 class="fp-group-title">${t('filters.starting')}</h4>
      <p class="muted xs">${t('filters.startingHint')}</p>
      <div class="fp-chips">
        ${BUILTIN_PRESETS.map((b) => {
          const state = /** @type {FilterState} */ (builtinPreset(b.id));
          const on = toQueryString(state) === current;
          return html`<${FilterChip} label=${t(b.labelKey || `filters.builtin.${b.id}`)} selected=${on} testId=${`builtin-${b.id}`}
            onToggle=${() => onApply(on ? defaultFilters() : state)} />`;
        })}
      </div>
    </div>
  </div>`;
}
