// Glossary (#/glossary): betting terms, the sheet's tags, note abbreviations, filter reasons, statuses,
// review measures and sources, plus every betting-analyst rule in plain words (#/glossary/rule-29).
// Content comes from src/content/*.json (offline, no feed needed); the feed only adds row counts and
// the topics of the decisions a rule cites.
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { href, navigate } from '../../lib/router.js';
import { Card, FilterChip, SegmentedControl, SearchInput, EmptyState, Skeleton, Banner, Button, Icon, RefText, Highlight, termIndexOf } from '../../lib/ui/index.js';
import { glossaryHref, decisionHref, ruleSlug, resolveGlossarySlug } from '../../lib/glossary-links.js';
import { formatDate, formatCount } from '../../lib/format.js';
import { useDataset } from '../../data/store.js';
import { searchGlossary, groupByLetter, filterRules, ruleStateCounts, RULE_STATES } from '../../data/content.js';
import { filterOptions } from '../../data/filters.js';
import { tagLabel } from '../../data/tags.js';
import { decisionStatusKind } from '../../data/decisions.js';
import { useContent } from './use-content.js';

/** @typedef {import('../../data/content.js').Content} Content */
/** @typedef {import('../../data/content.js').GlossaryEntry} GlossaryEntry */
/** @typedef {import('../../data/content.js').RuleEntry} RuleEntry */

const STATE_ICON = { in_force: 'check', provisional: 'half', paused: 'pending', stopped: 'void', replaced: 'void' };

/** Known references for RefText: rule numbers from the content, decision rows from the feed when loaded. */
function useKnown(/** @type {Content} */ content) {
  const data = useDataset();
  return useMemo(
    () => ({ ruleNumbers: new Set(content.rules.map((r) => r.n)), decisionRows: new Set((data?.decisions || []).map((d) => d.row)) }),
    [content, data],
  );
}

/** @param {{ params: Record<string, string>, query: Record<string, string> }} props */
export function GlossaryScreen({ params, query }) {
  const { status, content, error, retry } = useContent();
  if (status === 'loading') return html`<div class="glossary stack"><${Card}><${Skeleton} lines=${6} /></${Card}></div>`;
  if (status === 'error' || !content) {
    return html`<div class="glossary stack">
      <${Banner} tone="error" title=${t('glossary.loadError')} action=${html`<${Button} onClick=${retry}>${t('glossary.retry')}</${Button}>`}>${error}</${Banner}>
    </div>`;
  }
  const slug = params.term ? resolveGlossarySlug(params.term) : params.term;
  if (slug) {
    const m = /^rule-(\d+)$/.exec(slug);
    const rule = m ? content.ruleByN.get(Number(m[1])) : null;
    const entry = content.bySlug.get(slug);
    return html`<div class="glossary stack">
      ${rule ? html`<${RuleDetail} rule=${rule} content=${content} />` : entry ? html`<${EntryDetail} entry=${entry} content=${content} />` : html`<${NotFound} slug=${slug} />`}
    </div>`;
  }
  return html`<div class="glossary stack"><${GlossaryHome} content=${content} query=${query} /></div>`;
}

function NotFound({ slug }) {
  return html`<${Card} testId="glossary-term">
    <${EmptyState} icon="search" title=${t('glossary.notFound')} body=${t('glossary.notFoundBody', { slug })}
      action=${html`<${Button} href=${href('/glossary')} icon="chevron-left">${t('glossary.back')}</${Button}>`} />
  </${Card}>`;
}

/** Query helpers: the screen state lives in the hash query (tab, q, cat, state). */
function setQuery(/** @type {Record<string, string>} */ query, /** @type {Record<string, string>} */ patch) {
  const next = { ...query, ...patch };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
  const qs = p.toString();
  navigate(`/glossary${qs ? `?${qs}` : ''}`, { replace: true });
}

/** @param {{ content: Content, query: Record<string, string> }} props */
function GlossaryHome({ content, query }) {
  const tab = query.tab === 'rules' ? 'rules' : 'terms';
  const q = query.q || '';
  return html`
    <div class="gl-controls stack-sm">
      <${SearchInput}
        label=${t('glossary.searchLabel')}
        placeholder=${tab === 'rules' ? t('glossary.searchRules') : t('glossary.searchTerms')}
        value=${q}
        onValue=${(v) => setQuery(query, { q: v })}
        clearLabel=${t('glossary.clear')}
      />
      <${SegmentedControl}
        label=${t('glossary.view')}
        hideLabel
        value=${tab}
        onValue=${(v) => setQuery(query, { tab: v === 'rules' ? 'rules' : '', state: '', cat: '' })}
        options=${[
          { value: 'terms', label: t('glossary.tabTerms', { n: formatCount(content.entries.length) }) },
          { value: 'rules', label: t('glossary.tabRules', { n: formatCount(content.rules.length) }) },
        ]}
      />
    </div>
    ${tab === 'rules' ? html`<${RulesList} content=${content} query=${query} />` : html`<${TermsList} content=${content} query=${query} />`}
  `;
}

/** @param {{ content: Content, query: Record<string, string> }} props */
function TermsList({ content, query }) {
  const q = query.q || '';
  const cat = content.categories.some((c) => c.id === query.cat) ? query.cat : '';
  const list = useMemo(() => searchGlossary(content.entries, { q, category: cat }), [content, q, cat]);
  const counts = useMemo(() => {
    const all = searchGlossary(content.entries, { q });
    /** @type {Record<string, number>} */
    const by = {};
    for (const e of all) by[e.category] = (by[e.category] || 0) + 1;
    return { all: all.length, by };
  }, [content, q]);
  // With a query the list is ranked (flat). Without one: all categories as collapsed groups (the
  // long list stays short on a phone), or one category A–Z with the letter bar.
  const grouped = !q && !cat;
  const groups = useMemo(() => (q || grouped ? null : groupByLetter(list)), [list, q, grouped]);
  const catLabel = new Map(content.categories.map((c) => [c.id, c.label]));
  return html`
    <div class="gl-cats" role="group" aria-label=${t('glossary.categories')}>
      <${FilterChip} label=${t('glossary.allCategories')} selected=${!cat} count=${counts.all} onToggle=${() => setQuery(query, { cat: '' })} testId="glossary-cat-all" />
      ${content.categories.map(
        (c) => html`<${FilterChip} label=${c.label} selected=${cat === c.id} count=${counts.by[c.id] || 0}
          onToggle=${() => setQuery(query, { cat: cat === c.id ? '' : c.id })} testId=${`glossary-cat-${c.id}`} />`,
      )}
    </div>
    ${groups && groups.length > 1
      ? html`<nav class="gl-az" aria-label=${t('glossary.az')}>
          ${groups.map(
            (g) => html`<button type="button" class="gl-az-btn" aria-label=${t('glossary.jumpTo', { letter: g.letter })}
              onClick=${() => document.getElementById(`gl-letter-${g.letter}`)?.scrollIntoView({ block: 'start' })}>${g.letter}</button>`,
          )}
        </nav>`
      : null}
    <p class="muted small" aria-live="polite" data-testid="glossary-count">${t('glossary.count', { count: list.length, n: formatCount(list.length) })}</p>
    <div class="gl-list" data-testid="glossary-tags">
      ${list.length === 0
        ? html`<${EmptyState} icon="search" title=${t('glossary.noResults')} body=${t('glossary.noResultsBody')} />`
        : grouped
          ? content.categories.map((c) => {
              const items = list.filter((e) => e.category === c.id);
              if (!items.length) return null;
              return html`<details class="gl-group" data-cat=${c.id}>
                <summary class="gl-group-sum">
                  <span class="gl-group-title">${c.label}</span>
                  <span class="gl-group-n num">${items.length}</span>
                  <${Icon} name="chevron-down" size=${16} />
                </summary>
                <ul class="gl-items">${items.map((e) => html`<${TermItem} entry=${e} q=${q} catLabel=${''} />`)}</ul>
              </details>`;
            })
        : groups
          ? groups.map(
              (g) => html`<section class="gl-letter" id=${`gl-letter-${g.letter}`} aria-labelledby=${`gl-h-${g.letter}`}>
                <h2 class="gl-letter-h" id=${`gl-h-${g.letter}`}>${g.letter}</h2>
                <ul class="gl-items">${g.items.map((e) => html`<${TermItem} entry=${e} q=${q} catLabel=${catLabel.get(e.category)} />`)}</ul>
              </section>`,
            )
          : html`<ul class="gl-items">${list.map((e) => html`<${TermItem} entry=${e} q=${q} catLabel=${catLabel.get(e.category)} />`)}</ul>`}
    </div>
  `;
}

/** @param {{ entry: GlossaryEntry, q: string, catLabel: string }} props */
function TermItem({ entry: e, q, catLabel }) {
  return html`<li>
    <a class="gl-item" href=${glossaryHref(e.slug)} data-slug=${e.slug}>
      <span class="gl-item-head">
        <span class="gl-item-term"><${Highlight} text=${e.term} q=${q} /></span>
        <span class="gl-item-cat">${catLabel}</span>
      </span>
      <span class="gl-item-short"><${Highlight} text=${e.short} q=${q} /></span>
    </a>
  </li>`;
}

/** @param {{ state: string }} props */
function RuleState({ state }) {
  return html`<span class=${`rstate rstate-${state}`}><${Icon} name=${STATE_ICON[state] || 'info'} size=${14} /><span>${t(`glossary.state.${state}`)}</span></span>`;
}

/** @param {{ content: Content, query: Record<string, string> }} props */
function RulesList({ content, query }) {
  const state = RULE_STATES.includes(/** @type {any} */ (query.state)) ? query.state : '';
  const q = query.q || '';
  const list = useMemo(() => filterRules(content.rules, { state, q }), [content, state, q]);
  const counts = useMemo(() => ruleStateCounts(filterRules(content.rules, { q })), [content, q]);
  return html`
    <div class="gl-cats" role="group" aria-label=${t('glossary.stateFilter')}>
      <${FilterChip} label=${t('glossary.allStates')} selected=${!state} count=${filterRules(content.rules, { q }).length} onToggle=${() => setQuery(query, { state: '' })} testId="glossary-state-all" />
      ${RULE_STATES.filter((s) => counts[s]).map(
        (s) => html`<${FilterChip} label=${t(`glossary.state.${s}`)} selected=${state === s} count=${counts[s]}
          onToggle=${() => setQuery(query, { state: state === s ? '' : s })} testId=${`glossary-state-${s}`} />`,
      )}
    </div>
    <p class="muted small">${t('glossary.rulesIntro')}</p>
    <p class="muted small" aria-live="polite" data-testid="glossary-rules-count">${t('glossary.rulesCount', { count: list.length, n: list.length })}</p>
    ${list.length === 0
      ? html`<${EmptyState} icon="search" title=${t('glossary.noResults')} body=${t('glossary.noResultsBody')} />`
      : html`<ol class="gl-rules" data-testid="glossary-rules">
          ${list.map(
            (r) => html`<li>
              <a class="gl-rule" href=${glossaryHref(r.slug)} data-rule=${r.n}>
                <span class="gl-rule-n num" aria-hidden="true">${r.n}</span>
                <span class="gl-rule-body">
                  <span class="gl-rule-head"><span class="gl-rule-title"><span class="sr-only">${t('glossary.ruleN', { n: r.n })}: </span><${Highlight} text=${r.title} q=${q} /></span><${RuleState} state=${r.state} /></span>
                  <span class="gl-rule-says">${r.short ? html`<span class="gl-inshort">${t('glossary.inShort')}: </span>` : null}<${Highlight} text=${r.short || r.says} q=${q} /></span>
                </span>
              </a>
            </li>`,
          )}
        </ol>`}
  `;
}

/** Links to glossary entries or rules by slug, with their names. */
function SlugLinks({ slugs, content }) {
  const items = slugs
    .map((s) => {
      const m = /^rule-(\d+)$/.exec(s);
      const r = m ? content.ruleByN.get(Number(m[1])) : null;
      const e = content.bySlug.get(s);
      return r ? { slug: s, label: `${t('glossary.ruleN', { n: r.n })} · ${r.title}` } : e ? { slug: s, label: e.term } : null;
    })
    .filter(Boolean);
  if (!items.length) return null;
  return html`<ul class="gl-links">${items.map((x) => html`<li><a class="gl-link" href=${glossaryHref(x.slug)}>${x.label}</a></li>`)}</ul>`;
}

/** @param {{ entry: GlossaryEntry, content: Content }} props */
function EntryDetail({ entry: e, content }) {
  const known = useKnown(content);
  const terms = termIndexOf(content);
  const data = useDataset();
  const cat = content.categories.find((c) => c.id === e.category);
  const tagIds = e.covers?.tags || [];
  const tagCounts = useMemo(() => {
    if (!data || !tagIds.length) return [];
    const opts = filterOptions(data.picks).tags;
    return tagIds.map((id) => ({ id, count: opts.find((o) => o.value === id)?.count || 0 }));
  }, [data, e.slug]);
  return html`
    <${Button} variant="ghost" icon="chevron-left" href=${href('/glossary')} class="gl-back">${t('glossary.back')}</${Button}>
    <article class="card gl-entry" data-testid="glossary-term" data-slug=${e.slug} aria-labelledby="gl-entry-title">
      <header class="gl-entry-head">
        <a class="chip chip-accent gl-entry-cat" href=${href(`/glossary?cat=${e.category}`)}>${cat?.label || e.category}</a>
        <h2 id="gl-entry-title" class="gl-entry-title">${e.term}</h2>
        ${e.aliases?.length ? html`<p class="muted small">${t('glossary.aliases')}: ${e.aliases.join(' · ')}</p>` : null}
      </header>
      <p class="gl-entry-short"><${RefText} text=${e.short} known=${known} terms=${terms} exclude=${[e.slug]} /></p>
      <section class="gl-sec">
        <h3>${t('glossary.inSheet')}</h3>
        <p><${RefText} text=${e.inSheet} known=${known} terms=${terms} exclude=${[e.slug]} /></p>
      </section>
      ${e.example
        ? html`<section class="gl-example" aria-label=${t('glossary.example')}>
            <h3>${t('glossary.example')}</h3>
            <p class="num">${e.example}</p>
          </section>`
        : null}
      ${tagCounts.length
        ? html`<section class="gl-sec">
            <h3>${t('glossary.inData')}</h3>
            ${tagCounts.map(
              (x) => html`<p class="row-wrap">
                <span>${t('glossary.tagRows', { count: x.count, n: formatCount(x.count), tag: tagLabel(/** @type {any} */ (x.id)) })}</span>
                ${x.count ? html`<a class="link-btn" href=${href(`/explorer?tag=${x.id}`)} data-testid="glossary-tag-link" data-count=${x.count}>${t('glossary.seeInExplorer')}</a>` : null}
              </p>`,
            )}
          </section>`
        : null}
      ${e.related?.length
        ? html`<section class="gl-sec">
            <h3>${t('glossary.related')}</h3>
            <${SlugLinks} slugs=${e.related} content=${content} />
          </section>`
        : null}
    </article>
  `;
}

/** @param {{ rule: RuleEntry, content: Content }} props */
function RuleDetail({ rule: r, content }) {
  const known = useKnown(content);
  const terms = termIndexOf(content);
  const data = useDataset();
  const byRow = useMemo(() => new Map((data?.decisions || []).map((d) => [d.row, d])), [data]);
  const idx = content.rules.indexOf(r);
  const prev = content.rules[idx - 1];
  const next = content.rules[idx + 1];
  return html`
    <${Button} variant="ghost" icon="chevron-left" href=${href('/glossary?tab=rules')} class="gl-back">${t('glossary.backRules')}</${Button}>
    <article class="card gl-entry" data-testid="glossary-term" data-slug=${r.slug} aria-labelledby="gl-rule-title">
      <header class="gl-entry-head">
        <p class="gl-rule-eyebrow">${t('glossary.ruleN', { n: r.n })}</p>
        <h2 id="gl-rule-title" class="gl-entry-title">${r.title}</h2>
        <p class="row-wrap">
          <${RuleState} state=${r.state} />
          <span class="muted small">${r.since ? t('glossary.since', { date: formatDate(r.since) }) : t('glossary.noDate')}</span>
        </p>
        ${r.stateNote ? html`<p class="small gl-state-note"><${RefText} text=${r.stateNote} known=${known} terms=${terms} /></p>` : null}
      </header>
      ${r.short
        ? html`<p class="gl-entry-short gl-rule-short" data-testid="rule-short"><span class="gl-inshort">${t('glossary.inShort')}: </span>${r.short}</p>`
        : null}
      <section class="gl-sec">
        <h3>${t('glossary.says')}</h3>
        <p><${RefText} text=${r.says} known=${known} terms=${terms} /></p>
      </section>
      ${r.why
        ? html`<section class="gl-sec">
            <h3>${t('glossary.why')}</h3>
            <p><${RefText} text=${r.why} known=${known} terms=${terms} /></p>
          </section>`
        : null}
      ${r.terms?.length
        ? html`<section class="gl-sec">
            <h3>${t('glossary.terms')}</h3>
            <${SlugLinks} slugs=${r.terms} content=${content} />
          </section>`
        : null}
      <section class="gl-sec" data-testid="glossary-rule-decisions">
        <h3>${t('glossary.backedBy')}</h3>
        ${r.decisions.length
          ? html`<ul class="gl-decisions">
              ${r.decisions.map((row) => {
                const d = byRow.get(row);
                return html`<li>
                  <a href=${decisionHref(row)}>${t('glossary.decisionRow', { row })}</a>
                  ${d ? html`<span class="muted small"> · ${formatDate(d.date)} · ${d.topic}</span> <span class=${`gl-dstatus gl-dstatus-${decisionStatusKind(d.status)}`}>${d.status}</span>` : null}
                </li>`;
              })}
            </ul>`
          : html`<p class="muted small">${t('glossary.noDecisions')}</p>`}
      </section>
    </article>
    <nav class="gl-pager" aria-label=${t('glossary.rulePager')}>
      ${prev ? html`<${Button} href=${glossaryHref(ruleSlug(prev.n))} icon="chevron-left">${t('glossary.ruleN', { n: prev.n })}</${Button}>` : html`<span></span>`}
      ${next ? html`<a class="btn btn-secondary" href=${glossaryHref(ruleSlug(next.n))}><span>${t('glossary.ruleN', { n: next.n })}</span><${Icon} name="chevron-right" size=${18} /></a>` : html`<span></span>`}
    </nav>
  `;
}
