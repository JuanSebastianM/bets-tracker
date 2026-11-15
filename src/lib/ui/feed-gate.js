// FeedGate: every data page renders through it, so loading, "not configured" and error states look
// the same everywhere. The child is a function of the dataset.
//   <FeedGate>${(data) => html`<${MyPage} data=${data} />`}</FeedGate>
import { html } from '../../../vendor/preact.js';
import { useFeed, refreshFeed } from '../../data/store.js';
import { t } from '../i18n.js';
import { EmptyState, Skeleton, Card } from './display.js';
import { Button } from './controls.js';

/** @param {{ children: (data: import('../../data/types').Dataset) => any }} props */
export function FeedGate({ children }) {
  const s = useFeed();
  if (s.data) return children(s.data);
  if (s.status === 'unconfigured') {
    return html`<${EmptyState}
      icon="info"
      testId="feed-unconfigured"
      title=${t('feed.unconfiguredTitle')}
      body=${t('feed.unconfiguredBody')}
      action=${html`<${Button} variant="secondary" href="?feed=fixture">${t('feed.openFixture')}</${Button}>`}
    />`;
  }
  if (s.status === 'error') {
    return html`<${EmptyState}
      icon="warning"
      testId="feed-error"
      title=${t('feed.errorTitle')}
      body=${t(`feed.error.${s.error?.code || 'invalid'}`, { detail: s.error?.detail || '' })}
      action=${html`<${Button} variant="primary" icon="refresh" onClick=${() => refreshFeed()}>${t('feed.retry')}</${Button}>`}
    />`;
  }
  return html`<${Card} testId="feed-loading"><${Skeleton} lines=${4} /></${Card}>`;
}
