// <Term slug="near-value">VALOR CASI</Term>: a link to a glossary entry, for any section.
import { html } from '../../../vendor/preact.js';
import { glossaryHref } from '../glossary-links.js';

/**
 * Inline link to `#/glossary/<slug>`. Children default to the slug.
 * @param {{ slug: string, children?: any, title?: string, class?: string }} props
 */
export function Term({ slug, children, title, class: cls = '' }) {
  return html`<a class=${`term ${cls}`.trim()} href=${glossaryHref(slug)} title=${title}>${children ?? slug}</a>`;
}
