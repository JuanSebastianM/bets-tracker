// STUB (foundation): the number of decisions and the latest one. The Decisions feature replaces it
// with the searchable timeline.
import { html } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Card, FeedGate, Chip } from '../../lib/ui/index.js';
import { formatDate } from '../../lib/format.js';

function Decisions({ data }) {
  const last = data.decisions[data.decisions.length - 1];
  return html`<div class="decisions stack">
    <${Card} title=${t('decisions.stubTitle', { count: data.decisions.length, n: data.decisions.length })} testId="decisions-count">
      ${last
        ? html`<div class="stack-sm">
            <div class="row"><span class="muted small num">${formatDate(last.date)}</span><${Chip}>${last.status}</${Chip}></div>
            <h3>${last.topic}</h3>
            <p class="small">${last.decision}</p>
          </div>`
        : html`<p class="muted">${t('decisions.none')}</p>`}
    </${Card}>
  </div>`;
}

export function DecisionsScreen() {
  return html`<${FeedGate}>${(data) => html`<${Decisions} data=${data} />`}</${FeedGate}>`;
}
