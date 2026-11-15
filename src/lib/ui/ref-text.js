// <RefText text=… known=… q=…>: sheet or content text with its cross-references turned into links
// ("fila 110" → #/decisions/110, "regla 29" → #/glossary/rule-29) and the search query highlighted.
// Built from tokens (src/data/decisions.js tokenizeRefs) as Preact nodes: never innerHTML.
import { html } from '../../../vendor/preact.js';
import { tokenizeRefs, highlightSegments } from '../../data/decisions.js';
import { decisionHref, glossaryHref, ruleSlug } from '../glossary-links.js';

/** @param {{ text: string, q?: string }} props */
export function Highlight({ text, q }) {
  if (!q) return text;
  return highlightSegments(text, q).map((s) => (s.hit ? html`<mark class="hl">${s.text}</mark>` : s.text));
}

/**
 * @param {{ text: string, q?: string, known?: { decisionRows?: Set<number> | number[], ruleNumbers?: Set<number> | number[] }, class?: string }} props
 */
export function RefText({ text, q = '', known = {}, class: cls }) {
  const tokens = tokenizeRefs(text, known);
  const nodes = tokens.map((tk) => {
    const inner = html`<${Highlight} text=${tk.text} q=${q} />`;
    if (tk.type === 'decision') return html`<a class="ref ref-decision" href=${decisionHref(tk.row)}>${inner}</a>`;
    if (tk.type === 'rule') return html`<a class="ref ref-rule" href=${glossaryHref(ruleSlug(tk.n))}>${inner}</a>`;
    return inner;
  });
  return cls ? html`<span class=${cls}>${nodes}</span>` : html`${nodes}`;
}
