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
];

/** @param {string} line */
export function sheetRuleSlug(line) {
  for (const [re, slug] of SHEET_RULE_SLUGS) if (re.test(line)) return slug;
  return 'sheet-rules';
}
