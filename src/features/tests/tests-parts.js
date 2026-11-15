// Small presentational pieces of the Tests section: progress meter, the EV interval strip against
// zero, the state chip and glossary links. No figures are computed here; they arrive formatted or
// as the values src/data/ returned.
import { html } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { Icon } from '../../lib/ui/index.js';
import { formatPct } from '../../lib/format.js';

// Glossary and decision links come from the one shared implementation.
export { tagSlug, glossaryHref, decisionHref, tagHref } from '../../lib/glossary-links.js';
import { glossaryHref } from '../../lib/glossary-links.js';

/**
 * A labelled progress bar with its figures in text ("15 de 100 calificadas").
 * @param {{ label: string, value: number, total: number, text: string, met?: boolean, testId?: string }} props
 */
export function Meter({ label, value, total, text, met, testId }) {
  const share = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return html`<div class=${`tests-meter${met ? ' is-met' : ''}`} data-testid=${testId}>
    <div class="tests-meter-head">
      <span class="tests-meter-label">${label}</span>
      <span class="tests-meter-text num">${met ? html`<${Icon} name="check" size=${14} />` : null}${text}</span>
    </div>
    <div class="tests-meter-track" role="progressbar" aria-label=${label} aria-valuemin="0" aria-valuemax=${total}
      aria-valuenow=${Math.min(value, total)} aria-valuetext=${text}>
      <i style=${{ width: `${share * 100}%` }}></i>
    </div>
  </div>`;
}

const STATE_ICON = { collecting: 'pending', pass: 'won', stop: 'lost', extended: 'pending', context: 'info' };
const STATE_TONE = { collecting: 'neutral', pass: 'won', stop: 'lost', extended: 'neutral', context: 'info' };

/** The state of a test as icon + word (never colour alone). @param {{ state: string }} props */
export function StateChip({ state }) {
  return html`<span class=${`chip chip-${STATE_TONE[state] || 'neutral'} tests-state`} data-state=${state}>
    <${Icon} name=${STATE_ICON[state] || 'info'} size=${14} />${t(`tests.states.${state}`)}
  </span>`;
}

/**
 * The mean of a measure with its interval, drawn against the zero line. The sentence is both the
 * caption and the accessible name; the figures are also written next to it by the caller.
 * @param {{ mean: number | null, lo: number | null, hi: number | null, summary: string, testId?: string }} props
 */
export function EvStrip({ mean, lo, hi, summary, testId }) {
  if (mean == null) return null;
  const H = 34;
  const ext = Math.max(0.05, Math.abs(mean), Math.abs(lo ?? 0), Math.abs(hi ?? 0)) * 1.15;
  // Positions in % of the width (4% inset each side), so the strip follows the card without stretching the dot.
  const x = (/** @type {number} */ v) => `${(4 + ((v + ext) / (2 * ext)) * 92).toFixed(2)}%`;
  const w = (/** @type {number} */ a, /** @type {number} */ b) => `${Math.max(0.6, ((b - a) / (2 * ext)) * 92).toFixed(2)}%`;
  const side = lo != null && lo > 0 ? 'above' : hi != null && hi < 0 ? 'below' : 'across';
  return html`<figure class="tests-strip-fig" data-testid=${testId}>
    <svg class=${`tests-ev tests-ev-${side}`} width="100%" height=${H} role="img" aria-label=${summary}>
      <line class="tests-ev-axis" x1="4%" x2="96%" y1=${H / 2} y2=${H / 2} />
      <line class="tests-ev-zero" x1=${x(0)} x2=${x(0)} y1="3" y2=${H - 3} />
      ${lo != null && hi != null ? html`<rect class="tests-ev-ci" x=${x(lo)} y=${H / 2 - 5} width=${w(lo, hi)} height="10" rx="3" />` : null}
      <circle class="tests-ev-mean" cx=${x(mean)} cy=${H / 2} r="5" />
    </svg>
    <figcaption class="tests-ev-scale num" aria-hidden="true">
      <span>${formatPct(-ext, { digits: 0 })}</span><span>0</span><span>${formatPct(ext, { digits: 0 })}</span>
    </figcaption>
  </figure>`;
}

/**
 * A sentence from i18n with one glossary term linked inside it ("…({term})…").
 * @param {{ k: string, termKey: string, slug: string }} props
 */
export function TermSentence({ k, termKey, slug }) {
  const [before, after = ''] = t(k).split('{term}');
  return html`<p>${before}<a href=${glossaryHref(slug)}>${t(termKey)}</a>${after}</p>`;
}

/**
 * A tiny mark of the mean and its interval against zero, for a list row. Decorative: the row says the
 * figures in words.
 * @param {{ mean: number | null, lo: number | null, hi: number | null }} props
 */
export function MiniEv({ mean, lo, hi }) {
  if (mean == null) return null;
  const ext = Math.max(0.05, Math.abs(mean), Math.abs(lo ?? 0), Math.abs(hi ?? 0)) * 1.1;
  const x = (/** @type {number} */ v) => `${(6 + ((v + ext) / (2 * ext)) * 88).toFixed(2)}%`;
  const w = (/** @type {number} */ a, /** @type {number} */ b) => `${Math.max(1, ((b - a) / (2 * ext)) * 88).toFixed(2)}%`;
  return html`<svg class="tests-mini-ev" width="100%" height="12" aria-hidden="true" focusable="false">
    <line class="tests-ev-zero" x1=${x(0)} x2=${x(0)} y1="0" y2="12" />
    ${lo != null && hi != null ? html`<rect class="tests-ev-ci" x=${x(lo)} y="3" width=${w(lo, hi)} height="6" rx="2" />` : null}
    <circle class="tests-ev-mean" cx=${x(mean)} cy="6" r="3.5" />
  </svg>`;
}

/** A thin bar for a list row (decorative; the count is written beside it). @param {{ value: number, total: number }} props */
export function MiniBar({ value, total }) {
  const share = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return html`<span class="tests-mini-bar" aria-hidden="true"><i style=${{ width: `${share * 100}%` }}></i></span>`;
}
