// STUB (foundation): one line per frozen test (graded out of 100, closes out of 50) and the next
// Sombra review. The Tests feature replaces it.
import { html, useMemo } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Card, FeedGate, DataTable, Chip } from '../../lib/ui/index.js';
import { formatDate, formatPct, todayIn } from '../../lib/format.js';
import { FROZEN_RULE, FROZEN_TESTS, frozenProgress, nextShadowReview } from '../../data/tests-config.js';
import { APP_TIMEZONE } from '../../config.js';

function Tests({ data }) {
  const rows = useMemo(() => FROZEN_TESTS.map((test) => frozenProgress(test, data.picks)), [data]);
  const review = useMemo(() => nextShadowReview(data.decisions, data.picks, todayIn(APP_TIMEZONE)), [data]);
  return html`<div class="tests stack">
    <${Card} title=${t('tests.reviewTitle')} testId="next-review">
      <p>${review.dueDate
        ? t('tests.reviewDue', { date: formatDate(review.dueDate), rows: review.dueRows, graded: review.graded, days: review.daysLeft, left: review.rowsLeft })
        : t('tests.reviewUnknown')}</p>
    </${Card}>
    <${Card} title=${t('tests.frozenTitle')} subtitle=${t('tests.frozenRule', { graded: FROZEN_RULE.minGraded, close: FROZEN_RULE.minWithClose, z: FROZEN_RULE.zThreshold })}>
      <${DataTable}
        testId="frozen-table"
        caption=${t('tests.frozenTitle')}
        rowKey=${(/** @type {any} */ r) => r.test.id}
        columns=${[
          { key: 'name', label: t('tests.test'), render: (/** @type {any} */ r) => r.test.sheetLabel },
          { key: 'graded', label: t('tests.graded'), num: true, render: (/** @type {any} */ r) => `${r.graded}/${FROZEN_RULE.minGraded}` },
          { key: 'close', label: t('tests.withClose'), num: true, render: (/** @type {any} */ r) => `${r.withClose}/${FROZEN_RULE.minWithClose}` },
          { key: 'ev', label: t('stats.fairCloseEv'), num: true, render: (/** @type {any} */ r) => formatPct(r.ev.mean) },
          { key: 'state', label: t('tests.state'), render: (/** @type {any} */ r) => html`<${Chip} tone=${r.state === 'pass' ? 'won' : r.state === 'stop' ? 'lost' : 'neutral'}>${t(`tests.states.${r.state}`)}</${Chip}>` },
        ]}
        rows=${rows}
      />
    </${Card}>
  </div>`;
}

export function TestsScreen() {
  return html`<${FeedGate}>${(data) => html`<${Tests} data=${data} />`}</${FeedGate}>`;
}
