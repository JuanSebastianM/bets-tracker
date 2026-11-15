// Links into the Glossary and the Decisions log, for every section of the app.
//
//   glossaryHref('near-value')    -> '#/glossary/near-value'
//   tagSlug('near_value')         -> 'near-value'   (tag entries: kebab-case of the TagId)
//   ruleSlug(29)                  -> 'rule-29'      (betting-analyst rules)
//   decisionHref(110)             -> '#/decisions/110' (Decisiones sheet row)
//   sheetRuleSlug('8. Stake máximo: … Kelly …') -> 'kelly' (a line of the sheet's Reglas tab)
//
// Slugs are stable kebab-case English. The list of slugs lives in src/content/glossary.*.json.

/** @param {string} slug */
export const glossaryHref = (slug) => `#/glossary/${encodeURIComponent(slug)}`;

/** Glossary slug of a tag id ('prop_near_value' -> 'prop-near-value'). @param {string} tagId */
export const tagSlug = (tagId) => String(tagId).replace(/_/g, '-').toLowerCase();

/** Glossary slug of a betting-analyst rule number. @param {number | string} n */
export const ruleSlug = (n) => `rule-${parseInt(String(n), 10)}`;

/** Link to one decision (its sheet row). @param {number | string} row */
export const decisionHref = (row) => `#/decisions/${parseInt(String(row), 10)}`;

/**
 * Which glossary entry explains a line of the sheet's Reglas tab (staking rules, their own numbering,
 * not the betting-analyst rules). First pattern that matches the Spanish text wins; 'sheet-rules'
 * (the entry about the Reglas tab itself) otherwise.
 * @type {Array<[RegExp, string]>}
 */
export const SHEET_RULE_SLUGS = [
  [/kelly/i, 'kelly'],
  [/\bclv\b|cuota de cierre/i, 'clv'],
  [/en vivo|perseguir/i, 'live-bet'],
  [/\bdobles?\b/i, 'double-bet'],
  [/l[íi]neas? finas?|l[íi]nea justa/i, 'fair-price'],
  [/sencillas?|cuota\s*(?:m[íi]nima|≥)/i, 'minimum-price'],
  [/ligas?\s+favoritas?|favoritos/i, 'favorites'],
  [/\bstake\b/i, 'stake'],
  [/calibraci[óo]n|\bbrier\b/i, 'calibration'],
  [/excepci[óo]n/i, 'favorites'],
];

/**
 * The real Reglas lines by number (read only, 15 Nov 2026; the text is not copied here): each number
 * with a keyword its line must contain, so a renumbered or rewritten line falls back to the keyword
 * list above instead of linking the wrong entry. Rule 1 is never published.
 * @type {Record<number, [RegExp, string]>}
 */
export const SHEET_RULE_BY_N = {
  2: [/\bstake\b/i, 'stake'],
  3: [/sencillas?|cuota/i, 'minimum-price'],
  4: [/\bdobles?\b/i, 'double-bet'],
  5: [/en vivo/i, 'live-bet'],
  6: [/l[íi]neas? finas?|l[íi]nea justa/i, 'fair-price'],
  7: [/favorit/i, 'favorites'],
  8: [/kelly/i, 'kelly'],
  9: [/cierre|\bclv\b/i, 'clv'],
  10: [/excepci[óo]n|favorit/i, 'favorites'],
  11: [/calibraci[óo]n|\bbrier\b/i, 'calibration'],
};

/**
 * @param {string} line  the line ("8. Stake máximo …") or its text without the number
 * @param {number | null} [n]  the rule number when the caller already split it off
 */
export function sheetRuleSlug(line, n = null) {
  const text = String(line ?? '');
  const num = n ?? (/^\s*(\d+)[.)]/.exec(text) ? Number(/^\s*(\d+)[.)]/.exec(text)[1]) : null);
  const byN = num != null ? SHEET_RULE_BY_N[num] : null;
  if (byN && byN[0].test(text)) return byN[1];
  for (const [re, slug] of SHEET_RULE_SLUGS) if (re.test(text)) return slug;
  return 'sheet-rules';
}
