// Links into the Glossary and the Decisions log, for any section:
//   <Term slug="near-value">VALOR CASI</Term>           inline link to a glossary entry
//   <DecisionLink row=${28} />                          "Decisiones fila 28 · <topic>" (topic from the feed)
//   <TagGlossaryLinks tags=${['value', 'near_value']} /> "En el glosario: VALOR · VALOR CASI"
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../i18n.js';
import { glossaryHref, decisionHref, tagHref } from '../glossary-links.js';
import { useDataset } from '../../data/store.js';
import { tagLabel } from '../../data/tags.js';

/**
 * Inline link to `#/glossary/<slug>`. Children default to the slug.
 * @param {{ slug: string, children?: any, title?: string, class?: string }} props
 */
export function Term({ slug, children, title, class: cls = '' }) {
  return html`<a class=${`term ${cls}`.trim()} href=${glossaryHref(slug)} title=${title}>${children ?? slug}</a>`;
}

/** @type {WeakMap<object, Map<number, string>>} */
const topicsByData = new WeakMap();

/** Topic (Tema) of each decision row in the loaded dataset. @param {any} data */
function topicsOf(data) {
  if (!data) return null;
  let m = topicsByData.get(data);
  if (!m) {
    m = new Map((data.decisions || []).map((/** @type {any} */ d) => [d.row, d.topic || '']));
    topicsByData.set(data, m);
  }
  return m;
}

/**
 * A link to one decision row, with its topic beside it when the feed has the row
 * ("Decisiones fila 28 · Cuota de cierre (CLV)"). `label` replaces "Decisiones fila N".
 * @param {{ row: number, label?: any, class?: string, topic?: boolean, testId?: string }} props
 */
export function DecisionLink({ row, label, class: cls = 'link-btn', topic: withTopic = true, testId }) {
  const data = useDataset();
  const topic = withTopic ? topicsOf(data)?.get(row) : '';
  const text = label ?? t('links.decisionRow', { row });
  return html`<a class=${`dlink ${cls}`.trim()} href=${decisionHref(row)} data-testid=${testId}
    aria-label=${topic ? t('links.decisionTopic', { label: t('links.decisionRow', { row }), topic }) : undefined}>
    <span class="dlink-row">${text}</span>${topic ? html`<span class="dlink-topic"> · ${topic}</span>` : null}
  </a>`;
}

/**
 * One line of glossary links for the sheet tags (or other entries) a table or chart shows: the rows
 * themselves link elsewhere, so the terms get their own links here. `items` takes { slug, label }
 * pairs for anything that is not a tag; repeated slugs are shown once.
 * @param {{ tags?: string[], items?: Array<{ slug: string, label: string }>, label?: string, testId?: string }} props
 */
export function TagGlossaryLinks({ tags = [], items = [], label, testId = 'tag-glossary-links' }) {
  const key = tags.join(',') + '|' + items.map((x) => x.slug).join(',');
  const list = useMemo(() => {
    const all = [...tags.filter(Boolean).map((tag) => ({ href: tagHref(tag), slug: `tag:${tag}`, label: tagLabel(/** @type {any} */ (tag)) })),
      ...items.map((x) => ({ href: glossaryHref(x.slug), slug: x.slug, label: x.label }))];
    const seen = new Set();
    return all.filter((x) => (seen.has(x.slug) ? false : (seen.add(x.slug), true)));
  }, [key]);
  if (!list.length) return null;
  return html`<p class="tag-gloss" data-testid=${testId}>
    <span class="tag-gloss-label">${label ?? t('links.tagMeanings')}:</span>
    ${list.map((x, i) => html`${i ? html`<span aria-hidden="true"> · </span>` : null}<a class="term" href=${x.href}>${x.label}</a>`)}
  </p>`;
}
