// Decisions (#/decisions): the Decisiones tab as a searchable timeline (newest first, by month), the
// "in force now" view grouped by theme, one page per decision (#/decisions/<sheet row>) with the
// decisions it cites and the ones that cite it, and the staking rules of the Reglas tab.
// Sheet text is shown as written; references inside it become links (src/lib/ui/ref-text.js).
import { html, useMemo, useState, useId } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { href, navigate } from '../../lib/router.js';
import { Card, FilterChip, SegmentedControl, SearchInput, EmptyState, Button, Icon, Pagination, pageOf, FeedGate, RefText, Highlight } from '../../lib/ui/index.js';
import { glossaryHref, decisionHref, ruleSlug, sheetRuleSlug } from '../../lib/glossary-links.js';
import { formatDate, formatMonth, formatCount } from '../../lib/format.js';
import {
  DECISION_STATUSES, THEME_IDS, decisionStatusKind, decisionTheme, decisionFiltersFromQuery, decisionFiltersToQuery,
  filterDecisions, newestFirst, groupByMonth, groupByTheme, decisionCounts, decisionGraph, decisionMatches, parseSheetRule,
} from '../../data/decisions.js';

/** @typedef {import('../../data/types').Decision} Decision */
/** @typedef {import('../../data/decisions.js').DecisionFilters} DecisionFilters */

/** Rule numbers of the betting-analyst skill (src/content/rules.*.json). Links to rule N are only made for these. */
const RULE_NUMBERS = new Set(Array.from({ length: 36 }, (_, i) => i + 1));
const PAGE = 25;
const STATUS_ICON = { in_force: 'check', provisional: 'half', open: 'info', replaced: 'void', other: 'info' };
const STATUS_SLUG = { in_force: 'decision-in-force', provisional: 'decision-provisional', open: 'decision-open', replaced: 'decision-replaced' };

/** @param {{ params: Record<string, string>, query: Record<string, string> }} props */
export function DecisionsScreen({ params, query }) {
  return html`<${FeedGate}>${(/** @type {import('../../data/types').Dataset} */ data) => html`<div class="decisions stack">
    ${params.row ? html`<${DecisionPage} data=${data} row=${Number(params.row)} />` : html`<${DecisionsHome} data=${data} query=${query} />`}
  </div>`}</${FeedGate}>`;
}

/** The known references (decision rows of this feed, rule numbers) and the citation graph, memoised per dataset. */
function useRefs(/** @type {import('../../data/types').Dataset} */ data) {
  return useMemo(() => {
    const known = { decisionRows: new Set(data.decisions.map((d) => d.row)), ruleNumbers: RULE_NUMBERS };
    return { known, graph: decisionGraph(data.decisions, RULE_NUMBERS) };
  }, [data]);
}

/** Status chip: the sheet's word as written, an icon and a border style per kind (never colour alone). */
function StatusChip({ status, link = false }) {
  const kind = decisionStatusKind(status);
  const inner = html`<${Icon} name=${STATUS_ICON[kind]} size=${14} /><span>${status || '—'}</span>`;
  const cls = `dchip dchip-${kind}`;
  return link && STATUS_SLUG[kind] ? html`<a class=${cls} href=${glossaryHref(STATUS_SLUG[kind])}>${inner}</a>` : html`<span class=${cls}>${inner}</span>`;
}

/** @param {{ data: import('../../data/types').Dataset, query: Record<string, string> }} props */
function DecisionsHome({ data, query }) {
  const f = decisionFiltersFromQuery(query);
  const { known } = useRefs(data);
  const counts = useMemo(() => decisionCounts(data.decisions), [data]);
  const filtered = useMemo(() => filterDecisions(data.decisions, f), [data, decisionFiltersToQuery({ ...f, page: 1 })]);
  const [showFilters, setShowFilters] = useState(Boolean(f.statuses.length || f.themes.length || f.from || f.to));
  const set = (/** @type {Partial<DecisionFilters>} */ patch) => {
    const qs = decisionFiltersToQuery({ ...f, page: 1, ...patch });
    navigate(`/decisions${qs ? `?${qs}` : ''}`, { replace: true });
  };
  const active = f.statuses.length + f.themes.length + (f.from ? 1 : 0) + (f.to ? 1 : 0);
  const toggle = (/** @type {string[]} */ list, /** @type {string} */ v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const themeCounts = useMemo(() => {
    /** @type {Record<string, number>} */
    const by = {};
    for (const d of filterDecisions(data.decisions, { ...f, themes: [] })) by[decisionTheme(d)] = (by[decisionTheme(d)] || 0) + 1;
    return by;
  }, [data, decisionFiltersToQuery({ ...f, themes: [], page: 1 })]);

  return html`
    <${Card} title=${t('decisions.countTitle', { count: counts.total, n: formatCount(counts.total) })} testId="decisions-count">
      <p class="small">${t('decisions.countBody', { count: counts.inForceNow, n: formatCount(counts.inForceNow) })}</p>
      <ul class="dcounts" aria-label=${t('decisions.byStatus')}>
        ${DECISION_STATUSES.map(
          (s) => html`<li><${StatusChip} status=${s.label} /> <span class="num">${formatCount(counts.byStatus[s.id])}</span></li>`,
        )}
        ${counts.byStatus.other ? html`<li><span class="dchip dchip-other">${t('decisions.otherStatus')}</span> <span class="num">${counts.byStatus.other}</span></li>` : null}
      </ul>
    </${Card}>

    <div class="stack-sm">
      <${SegmentedControl}
        label=${t('decisions.view')}
        hideLabel
        value=${f.view}
        onValue=${(v) => set({ view: v === 'now' ? 'now' : 'timeline' })}
        options=${[
          { value: 'timeline', label: t('decisions.viewTimeline') },
          { value: 'now', label: t('decisions.viewNow', { n: formatCount(counts.inForceNow) }) },
        ]}
      />
      <${SearchInput} label=${t('decisions.searchLabel')} placeholder=${t('decisions.searchPlaceholder')} value=${f.q} onValue=${(v) => set({ q: v })} clearLabel=${t('decisions.clearSearch')} />
      <div class="spread">
        <button type="button" class="link-btn dfilter-toggle" aria-expanded=${showFilters ? 'true' : 'false'} aria-controls="decision-filters" onClick=${() => setShowFilters(!showFilters)}>
          <${Icon} name="filter" size=${16} /> ${active ? t('decisions.filtersActive', { n: active }) : t('decisions.filters')}
        </button>
        ${active ? html`<button type="button" class="link-btn" onClick=${() => set({ statuses: [], themes: [], from: '', to: '' })}>${t('decisions.clearFilters')}</button>` : null}
      </div>
      ${showFilters
        ? html`<div class="card dfilters" id="decision-filters">
            ${f.view === 'timeline'
              ? html`<fieldset class="field">
                  <legend class="field-label">${t('decisions.status')}</legend>
                  <div class="row-wrap">
                    ${DECISION_STATUSES.map(
                      (s) => html`<${FilterChip} label=${s.label} selected=${f.statuses.includes(s.id)} count=${counts.byStatus[s.id]}
                        onToggle=${() => set({ statuses: /** @type {any} */ (toggle(f.statuses, s.id)) })} testId=${`decisions-status-${s.id}`} />`,
                    )}
                  </div>
                </fieldset>`
              : null}
            <fieldset class="field">
              <legend class="field-label">${t('decisions.theme')}</legend>
              <div class="row-wrap">
                ${THEME_IDS.map(
                  (id) => html`<${FilterChip} label=${t(`decisions.themes.${id}`)} selected=${f.themes.includes(id)} count=${themeCounts[id] || 0}
                    onToggle=${() => set({ themes: toggle(f.themes, id) })} testId=${`decisions-theme-${id}`} />`,
                )}
              </div>
              <p class="field-hint">${t('decisions.themeHint')}</p>
            </fieldset>
            <div class="grid-2">
              <${DateField} label=${t('decisions.from')} value=${f.from} onValue=${(v) => set({ from: v })} testId="decisions-from" />
              <${DateField} label=${t('decisions.to')} value=${f.to} onValue=${(v) => set({ to: v })} testId="decisions-to" />
            </div>
          </div>`
        : null}
    </div>

    <p class="muted small" aria-live="polite" data-testid="decisions-results">
      ${t(f.view === 'now' ? 'decisions.resultsNow' : 'decisions.results', { count: filtered.length, n: formatCount(filtered.length) })}
    </p>
    ${filtered.length === 0
      ? html`<${EmptyState} icon="search" title=${t('decisions.emptyTitle')} body=${t('decisions.emptyBody')} testId="decisions-empty" />`
      : f.view === 'now'
        ? html`<${InForceView} decisions=${filtered} q=${f.q} known=${known} />`
        : html`<${Timeline} decisions=${filtered} f=${f} known=${known} onPage=${(page) => set({ page })} />`}
    <${StakingRules} rules=${data.rules} />
  `;
}

/** Native date input with the kit's field styles. */
function DateField({ label, value, onValue, testId }) {
  const id = useId();
  return html`<div class="field">
    <label class="field-label" for=${id}>${label}</label>
    <div class="input-wrap"><input id=${id} type="date" value=${value} data-testid=${testId} onChange=${(/** @type {any} */ e) => onValue(e.currentTarget.value)} /></div>
  </div>`;
}

/** @param {{ decisions: Decision[], f: DecisionFilters, known: any, onPage: (p: number) => void }} props */
function Timeline({ decisions, f, known, onPage }) {
  const ordered = useMemo(() => newestFirst(decisions), [decisions]);
  const { items, page, pageCount } = pageOf(ordered, f.page, PAGE);
  const months = groupByMonth(items);
  return html`
    <div class="dtimeline" data-testid="decisions-timeline">
      ${months.map(
        (m) => html`<section class="dmonth" aria-labelledby=${`dm-${m.month}`}>
          <h2 class="dmonth-h" id=${`dm-${m.month}`}>${m.month.length === 7 ? formatMonth(m.month) : m.month} <span class="muted small num">· ${m.items.length}</span></h2>
          <ol class="ditems">${m.items.map((d) => html`<li><${DecisionCard} d=${d} q=${f.q} known=${known} /></li>`)}</ol>
        </section>`,
      )}
    </div>
    <${Pagination} page=${page} pageCount=${pageCount} onPage=${onPage} />
  `;
}

/** @param {{ decisions: Decision[], q: string, known: any }} props */
function InForceView({ decisions, q, known }) {
  const groups = useMemo(() => groupByTheme(decisions), [decisions]);
  return html`<div class="dthemes" data-testid="decisions-now">
    ${groups.map(
      (g) => html`<section class="card dtheme" aria-labelledby=${`dt-${g.theme}`}>
        <h2 class="card-title" id=${`dt-${g.theme}`}>${t(`decisions.themes.${g.theme}`)} <span class="muted small num">· ${g.items.length}</span></h2>
        <ul class="dnow">
          ${g.items.map(
            (d) => html`<li class="dnow-item">
              <div class="dmeta"><a class="drow" href=${decisionHref(d.row)}>${t('decisions.rowShort', { row: d.row })}</a><span class="num">${formatDate(d.date)}</span><${StatusChip} status=${d.status} /></div>
              <a class="dtopic-link" href=${decisionHref(d.row)}><${Highlight} text=${d.topic} q=${q} /></a>
              <p class="small dtext"><${RefText} text=${d.decision} q=${q} known=${known} /></p>
            </li>`,
          )}
        </ul>
      </section>`,
    )}
  </div>`;
}

/** A disclosure whose body is only rendered while open (evidence texts can be thousands of characters).
 * Keyed by the caller on whether the search matches inside, so a new match opens it. */
function LazyDisclosure({ summary, open: initial = false, children, testId }) {
  const [open, setOpen] = useState(initial);
  return html`<details class="disclosure ddisc" open=${open} data-testid=${testId} onToggle=${(/** @type {any} */ e) => setOpen(e.currentTarget.open)}>
    <summary><span>${summary}</span><${Icon} name="chevron-down" size=${16} /></summary>
    ${open ? html`<div class="disclosure-body">${children()}</div>` : null}
  </details>`;
}

/** Long sheet text: paragraphs on line breaks, references linked, query highlighted. */
function LongText({ text, q, known }) {
  return html`${String(text || '')
    .split(/\n+/)
    .filter(Boolean)
    .map((p) => html`<p class="dlong"><${RefText} text=${p} q=${q} known=${known} /></p>`)}`;
}

/** @param {{ d: Decision, q: string, known: any }} props */
function DecisionCard({ d, q, known }) {
  const inEvidence = Boolean(q) && decisionMatches({ ...d, topic: '', decision: '', review: '', status: '', date: '' }, q);
  const inReview = Boolean(q) && decisionMatches({ ...d, topic: '', decision: '', evidence: '', status: '', date: '' }, q);
  const theme = decisionTheme(d);
  return html`<article class="card dcard" data-row=${d.row} aria-labelledby=${`d-${d.row}`}>
    <div class="dmeta">
      <a class="drow" href=${decisionHref(d.row)}>${t('decisions.rowShort', { row: d.row })}</a>
      <span class="num">${formatDate(d.date)}</span>
      <${StatusChip} status=${d.status} />
      <span class="dtheme-label">${t(`decisions.themes.${theme}`)}</span>
    </div>
    <h3 class="dtopic" id=${`d-${d.row}`}><a href=${decisionHref(d.row)}><${Highlight} text=${d.topic} q=${q} /></a></h3>
    <p class="dtext"><${RefText} text=${d.decision} q=${q} known=${known} /></p>
    ${d.evidence
      ? html`<${LazyDisclosure} key=${`e${inEvidence}`} summary=${inEvidence ? t('decisions.evidenceMatch') : t('decisions.evidence')} open=${inEvidence} testId=${`decision-evidence-${d.row}`}>
          ${() => html`<${LongText} text=${d.evidence} q=${q} known=${known} />`}
        </${LazyDisclosure}>`
      : null}
    ${d.review
      ? html`<${LazyDisclosure} key=${`r${inReview}`} summary=${inReview ? t('decisions.reviewMatch') : t('decisions.review')} open=${inReview}>
          ${() => html`<${LongText} text=${d.review} q=${q} known=${known} />`}
        </${LazyDisclosure}>`
      : null}
  </article>`;
}

/** @param {{ data: import('../../data/types').Dataset, row: number }} props */
function DecisionPage({ data, row }) {
  const { known, graph } = useRefs(data);
  const byRow = useMemo(() => new Map(data.decisions.map((x) => [x.row, x])), [data]);
  const sorted = useMemo(() => [...data.decisions].sort((a, b) => a.row - b.row), [data]);
  const d = byRow.get(row);
  const back = html`<${Button} variant="ghost" icon="chevron-left" href=${href('/decisions')} class="dback">${t('decisions.back')}</${Button}>`;
  if (!d) {
    return html`${back}<${Card} testId="decision-detail">
      <${EmptyState} icon="search" title=${t('decisions.notFound', { row })} body=${t('decisions.notFoundBody')} />
    </${Card}>`;
  }
  const node = graph.get(row) || { cites: [], citedBy: [], rules: [] };
  const i = sorted.indexOf(d);
  const prev = sorted[i - 1];
  const next = sorted[i + 1];
  return html`
    ${back}
    <article class="card ddetail" data-testid="decision-detail" data-row=${d.row} aria-labelledby="d-title">
      <div class="dmeta">
        <span class="drow">${t('decisions.rowLong', { row: d.row })}</span>
        <span class="num">${formatDate(d.date)}</span>
        <${StatusChip} status=${d.status} link />
        <a class="dtheme-label" href=${href(`/decisions?th=${decisionTheme(d)}`)}>${t(`decisions.themes.${decisionTheme(d)}`)}</a>
      </div>
      <h2 class="ddetail-title" id="d-title"><${RefText} text=${d.topic} known=${known} /></h2>
      <section class="dsec"><h3>${t('decisions.decision')}</h3><${LongText} text=${d.decision} known=${known} /></section>
      ${d.evidence ? html`<section class="dsec"><h3>${t('decisions.evidence')}</h3><${LongText} text=${d.evidence} known=${known} /></section>` : null}
      ${d.review ? html`<section class="dsec"><h3>${t('decisions.review')}</h3><${LongText} text=${d.review} known=${known} /></section>` : null}
    </article>
    <${Card} title=${t('decisions.related')} testId="decision-related">
      <${RelatedList} title=${t('decisions.cites', { count: node.cites.length, n: node.cites.length })} rows=${node.cites} byRow=${byRow} testId="decision-cites" />
      <${RelatedList} title=${t('decisions.citedBy', { count: node.citedBy.length, n: node.citedBy.length })} rows=${node.citedBy} byRow=${byRow} testId="decision-cited-by" />
      ${node.rules.length
        ? html`<div class="stack-sm">
            <h3 class="drel-h">${t('decisions.rulesMentioned')}</h3>
            <ul class="drules">${node.rules.map((n) => html`<li><a class="drule-link" href=${glossaryHref(ruleSlug(n))}>${t('decisions.ruleN', { n })}</a></li>`)}</ul>
          </div>`
        : null}
    </${Card}>
    <nav class="dpager" aria-label=${t('decisions.pager')}>
      ${prev ? html`<${Button} href=${decisionHref(prev.row)} icon="chevron-left">${t('decisions.rowShort', { row: prev.row })}</${Button}>` : html`<span></span>`}
      ${next ? html`<a class="btn btn-secondary" href=${decisionHref(next.row)}><span>${t('decisions.rowShort', { row: next.row })}</span><${Icon} name="chevron-right" size=${18} /></a>` : html`<span></span>`}
    </nav>
  `;
}

/** @param {{ title: string, rows: number[], byRow: Map<number, Decision>, testId: string }} props */
function RelatedList({ title, rows, byRow, testId }) {
  return html`<div class="stack-sm" data-testid=${testId}>
    <h3 class="drel-h">${title}</h3>
    ${rows.length
      ? html`<ul class="drel">
          ${rows.map((r) => {
            const x = byRow.get(r);
            return html`<li>
              <a class="drel-link" href=${decisionHref(r)}>
                <span class="dmeta"><span class="drow">${t('decisions.rowShort', { row: r })}</span><span class="num">${x ? formatDate(x.date) : ''}</span>${x ? html`<${StatusChip} status=${x.status} />` : null}</span>
                <span class="drel-topic">${x?.topic || ''}</span>
              </a>
            </li>`;
          })}
        </ul>`
      : html`<p class="muted small">${t('decisions.none')}</p>`}
  </div>`;
}

/** The staking rules of the Reglas tab, each linked to the glossary entry that explains it. */
function StakingRules({ rules }) {
  if (!rules.length) return null;
  return html`<${Card} title=${t('decisions.stakingTitle')} subtitle=${t('decisions.stakingSub')} testId="decisions-staking">
    <ol class="dstaking">
      ${rules.map((line) => {
        const { n, text } = parseSheetRule(line);
        const slug = sheetRuleSlug(text, n);
        return html`<li>
          <span class="dstaking-n num" aria-hidden="true">${n ?? '·'}</span>
          <span class="dstaking-body">
            <span><span class="sr-only">${n != null ? t('decisions.sheetRuleN', { n }) + ': ' : ''}</span>${text}</span>
            <a class="link-btn" href=${glossaryHref(slug)}>${t('decisions.whatItMeans')}</a>
          </span>
        </li>`;
      })}
    </ol>
  </${Card}>`;
}
