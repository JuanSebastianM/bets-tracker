// <RefText text=… known=… q=…>: sheet or content text with its cross-references turned into links
// ("fila 110" → #/decisions/110, "regla 29" → #/glossary/rule-29) and the search query highlighted.
// Built from tokens (src/data/decisions.js tokenizeRefs) as Preact nodes: never innerHTML.
import { html } from '../../../vendor/preact.js';
import { tokenizeRefs, highlightSegments } from '../../data/decisions.js';
import { linkTerms } from '../../data/content.js';
import { decisionHref, glossaryHref, ruleSlug } from '../glossary-links.js';

/** @param {{ text: string, q?: string }} props */
export function Highlight({ text, q }) {
  if (!q) return text;
  return highlightSegments(text, q).map((s) => (s.hit ? html`<mark class="hl">${s.text}</mark>` : s.text));
}

/**
 * `terms` (from useTermIndex) also links the glossary's terms and aliases in the plain parts, the first
 * occurrence of each entry per call (one call = one paragraph); `exclude` slugs are never linked.
 * @param {{ text: string, q?: string, known?: { decisionRows?: Set<number> | number[], ruleNumbers?: Set<number> | number[] }, class?: string,
 *   terms?: import('../../data/content.js').TermIndex | null, exclude?: string[] }} props
 */
export function RefText({ text, q = '', known = {}, class: cls, terms = null, exclude }) {
  const tokens = tokenizeRefs(text, known);
  const seen = new Set();
  const nodes = tokens.flatMap((tk) => {
    const inner = html`<${Highlight} text=${tk.text} q=${q} />`;
    if (tk.type === 'decision') return [html`<a class="ref ref-decision" href=${decisionHref(tk.row)}>${inner}</a>`];
    if (tk.type === 'rule') return [html`<a class="ref ref-rule" href=${glossaryHref(ruleSlug(tk.n))}>${inner}</a>`];
    if (!terms) return [inner];
    return linkTerms(tk.text, terms, { seen, exclude }).map((x) =>
      x.type === 'term' ? html`<a class="term" href=${glossaryHref(x.slug)}><${Highlight} text=${x.text} q=${q} /></a>` : html`<${Highlight} text=${x.text} q=${q} />`,
    );
  });
  return cls ? html`<span class=${cls}>${nodes}</span>` : html`${nodes}`;
}
