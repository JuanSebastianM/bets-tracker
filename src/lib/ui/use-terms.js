// useTermIndex(): the glossary's inline-link index for the current locale, for <RefText terms=…>.
// The content is loaded once per locale (src/data/content.js caches it) and the index is built once
// per loaded content. Until it is loaded the hook returns null and texts render without term links.
import { useEffect, useState } from '../../../vendor/preact.js';
import { useLocale } from '../i18n.js';
import { loadContent, buildTermIndex } from '../../data/content.js';

/** @type {WeakMap<object, import('../../data/content.js').TermIndex>} */
const built = new WeakMap();

/** @param {import('../../data/content.js').Content} content */
export function termIndexOf(content) {
  let ix = built.get(content);
  if (!ix) {
    ix = buildTermIndex(content.fileOrder || content.entries);
    built.set(content, ix);
  }
  return ix;
}

/** @type {WeakMap<object, Set<number>>} */
const ruleSets = new WeakMap();

/**
 * The inline-link index and the rule numbers of the glossary content (for RefText's `terms` and
 * `known.ruleNumbers`), or nulls until the content is loaded.
 * @returns {{ terms: import('../../data/content.js').TermIndex | null, ruleNumbers: Set<number> | null }}
 */
export function useGlossaryLinks() {
  const locale = useLocale();
  const [content, setContent] = useState(/** @type {import('../../data/content.js').Content | null} */ (null));
  useEffect(() => {
    let alive = true;
    loadContent(locale).then(
      (c) => alive && setContent(c),
      () => alive && setContent(null),
    );
    return () => {
      alive = false;
    };
  }, [locale]);
  if (!content) return { terms: null, ruleNumbers: null };
  let rules = ruleSets.get(content);
  if (!rules) {
    rules = new Set(content.rules.map((r) => r.n));
    ruleSets.set(content, rules);
  }
  return { terms: termIndexOf(content), ruleNumbers: rules };
}

/** @returns {import('../../data/content.js').TermIndex | null} */
export function useTermIndex() {
  return useGlossaryLinks().terms;
}
