// Display components: Card, Stat, Scoreboard (the record), StatusBadge, TagBadge, Banner,
// EmptyState, Skeleton, Disclosure.
import { html } from '../../../vendor/preact.js';
import { Icon } from './icons.js';
import { t } from '../i18n.js';
import { formatCount } from '../format.js';
import { tagLabel } from '../../data/tags.js';

/**
 * A slab of content. `title` renders an h2 (or `level` 3); `action` sits at the right of the title.
 * @param {{ title?: any, subtitle?: any, action?: any, children?: any, class?: string, level?: 2 | 3, tone?: 'plain' | 'accent', testId?: string }} props
 */
export function Card({ title, subtitle, action, children, class: cls = '', level = 2, tone = 'plain', testId }) {
  const H = level === 3 ? 'h3' : 'h2';
  return html`<section class=${`card card-${tone} ${cls}`} data-testid=${testId}>
    ${title || action
      ? html`<header class="card-head">
          <div class="card-titles">
            ${title ? html`<${H} class="card-title">${title}</${H}>` : null}
            ${subtitle ? html`<p class="card-sub">${subtitle}</p>` : null}
          </div>
          ${action || null}
        </header>`
      : null}
    ${children}
  </section>`;
}

/**
 * A labelled figure. tone colours the value only for results (won/lost); `n` is shown beside rates.
 * @param {{ label: string, value: any, sub?: any, tone?: 'plain' | 'won' | 'lost' | 'pending', testId?: string }} props
 */
export function Stat({ label, value, sub, tone = 'plain', testId }) {
  return html`<div class=${`stat stat-${tone}`} data-testid=${testId}>
    <div class="stat-label">${label}</div>
    <div class="stat-value num">${value}</div>
    ${sub ? html`<div class="stat-sub">${sub}</div>` : null}
  </div>`;
}

/**
 * The record as a scoreboard: big tabular W–L–V figures over a proportional bar.
 * The bar is decoration; the figures and the sr text carry the meaning.
 * @param {{ won: number, lost: number, void: number, halfWon?: number, halfLost?: number, size?: 'lg' | 'md' }} props
 */
export function Scoreboard({ won, lost, void: voids, halfWon = 0, halfLost = 0, size = 'lg' }) {
  const total = won + lost + voids + halfWon + halfLost;
  const pct = (/** @type {number} */ n) => (total ? `${(n / total) * 100}%` : '0%');
  return html`<div class=${`scoreboard scoreboard-${size}`}>
    <div class="score-figures num" aria-hidden="true">
      <span class="score-won">${won}</span><span class="score-sep">–</span><span class="score-lost">${lost}</span>${voids
        ? html`<span class="score-sep">–</span><span class="score-void">${voids}</span>`
        : null}
      ${halfWon + halfLost ? html`<span class="score-half">+${halfWon + halfLost}½</span>` : null}
    </div>
    <span class="sr-only">${t('record.sr', { won, lost, void: voids, halves: halfWon + halfLost })}</span>
    <div class="score-bar" aria-hidden="true">
      <i class="sb-won" style=${{ width: pct(won + halfWon) }}></i>
      <i class="sb-void" style=${{ width: pct(voids) }}></i>
      <i class="sb-lost" style=${{ width: pct(lost + halfLost) }}></i>
    </div>
  </div>`;
}

const STATUS_ICON = { won: 'won', lost: 'lost', void: 'void', half_won: 'half', half_lost: 'half', pending: 'pending', other: 'info' };
const STATUS_TONE = { won: 'won', lost: 'lost', void: 'void', half_won: 'won', half_lost: 'lost', pending: 'pending', other: 'neutral' };

/**
 * Result of a pick: icon + word (never colour alone).
 * @param {{ status: import('../../data/types').Status, raw?: string }} props
 */
export function StatusBadge({ status, raw }) {
  return html`<span class=${`badge badge-${STATUS_TONE[status] || 'neutral'}`} title=${raw || undefined}>
    <${Icon} name=${STATUS_ICON[status] || 'info'} size=${14} />
    <span>${status === 'other' && raw ? raw : t(`status.${status}`)}</span>
  </span>`;
}

/**
 * The sheet's own tag label (VALOR CASI, TARJETAS UNDER…), linked to its glossary entry when `href` is given.
 * @param {{ tag: import('../../data/types').TagId, href?: string }} props
 */
export function TagBadge({ tag, href }) {
  const label = tagLabel(tag);
  return href ? html`<a class="tag" href=${href}>${label}</a>` : html`<span class="tag">${label}</span>`;
}

/**
 * A message across the page. tone: info | warning | error | offline.
 * @param {{ tone?: 'info' | 'warning' | 'error' | 'offline', title?: any, children?: any, action?: any, testId?: string }} props
 */
export function Banner({ tone = 'info', title, children, action, testId }) {
  const icon = tone === 'offline' ? 'offline' : tone === 'info' ? 'info' : 'warning';
  return html`<div class=${`banner banner-${tone}`} role=${tone === 'error' ? 'alert' : 'status'} data-testid=${testId}>
    <${Icon} name=${icon} size=${20} />
    <div class="banner-body">
      ${title ? html`<strong>${title}</strong>` : null}
      ${children ? html`<div>${children}</div>` : null}
    </div>
    ${action || null}
  </div>`;
}

/**
 * Empty or not-yet state: say what is missing and what to do.
 * @param {{ icon?: string, title: any, body?: any, action?: any, testId?: string }} props
 */
export function EmptyState({ icon = 'info', title, body, action, testId }) {
  return html`<div class="empty" data-testid=${testId}>
    <${Icon} name=${icon} size=${32} />
    <h2 class="empty-title">${title}</h2>
    ${body ? html`<p class="empty-body">${body}</p>` : null}
    ${action || null}
  </div>`;
}

/** Loading placeholder lines. @param {{ lines?: number, height?: number }} props */
export function Skeleton({ lines = 3, height = 16 }) {
  return html`<div class="skeleton" aria-hidden="true">
    ${Array.from({ length: lines }, (_, i) => html`<i style=${{ height: `${height}px`, width: `${100 - ((i * 17) % 40)}%` }}></i>`)}
  </div>`;
}

/** A count with its noun ("53 picks"). @param {{ n: number, k?: string }} props */
export function CountLabel({ n, k = 'common.picks' }) {
  return html`<span class="num">${t(k, { count: n, n: formatCount(n) })}</span>`;
}

/**
 * Native disclosure (details/summary) for secondary content.
 * @param {{ summary: any, children?: any, open?: boolean }} props
 */
export function Disclosure({ summary, children, open = false }) {
  return html`<details class="disclosure" open=${open}>
    <summary><span>${summary}</span><${Icon} name="chevron-down" size=${16} /></summary>
    <div class="disclosure-body">${children}</div>
  </details>`;
}
