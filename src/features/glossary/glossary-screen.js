// STUB (foundation): the sheet's tags with their counts, and the rule lines the feed publishes.
// The Glossary feature replaces it with src/content/glossary.*.json and rules.*.json.
import { html } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Card, FeedGate, TagBadge } from '../../lib/ui/index.js';
import { filterOptions } from '../../data/filters.js';

/** @param {{ params: Record<string, string> }} props */
export function GlossaryScreen({ params }) {
  return html`<${FeedGate}>${(data) => {
    const tags = filterOptions(data.picks).tags;
    return html`<div class="glossary stack">
      ${params.term ? html`<p class="muted small" data-testid="glossary-term">${t('glossary.deepLink', { term: params.term })}</p>` : null}
      <${Card} title=${t('glossary.tagsTitle')} subtitle=${t('glossary.stubBody')} testId="glossary-tags">
        <ul class="glossary-tags">
          ${tags.map((x) => html`<li><${TagBadge} tag=${/** @type {any} */ (x.value)} /> <span class="muted small num">${x.count}</span></li>`)}
        </ul>
      </${Card}>
      <${Card} title=${t('glossary.rulesTitle', { count: data.rules.length, n: data.rules.length })}>
        <ol class="glossary-rules small">${data.rules.map((r) => html`<li>${r}</li>`)}</ol>
      </${Card}>
    </div>`;
  }}</${FeedGate}>`;
}
