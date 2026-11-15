# Build log: Decisions and Glossary (feat/knowledge, 15 Nov 2026)

## What was built

- **Decisions** (`#/decisions`, `#/decisions/<row>`): the Decisiones tab as a timeline, newest first and
  grouped by month, 25 per page. Each decision shows its sheet row, date, status chip (the sheet's word,
  an icon and a border style per state: solid, dashed, dotted, struck through), theme, topic and decision.
  Evidence and "Cómo y cuándo se revisa" open on demand and are only rendered while open (the real evidence
  texts run to thousands of characters each). Search covers every column, the date and the row number,
  is accent-insensitive, highlights the matches and opens the evidence or review when the match is there.
  Filters by status, theme and date range; all of it in the URL (`q`, `st`, `th`, `from`, `to`, `view`,
  `page`). A count card with the totals per status, and an "En vigor" view (Vigente and Provisional only)
  grouped by theme. One page per decision with "Cita" / "La citan" (the citation graph) and the rules it
  mentions. The staking rules of the Reglas tab as their own block, each linked to its glossary entry.
- **Glossary** (`#/glossary`, `#/glossary/<slug>`): 143 entries in nine categories (basics, markets, the
  system, every sheet tag, note abbreviations, filters and reasons, statuses, review measures, sources),
  each with a short definition, "En esta hoja", a worked example where it helps (prices, probabilities,
  units) and related links. Search as you type (term, aliases, definitions; accent- and case-insensitive,
  ranked), category chips, A–Z jump bar, deep links. Tag entries show how many rows carry the tag and link
  to the Explorer filtered by it.
- **The 36 betting-analyst rules in plain words** (`#/glossary/rule-N`, the "Reglas" tab of the glossary):
  title, what it says, why it exists (when the skill gives a lesson), state (in force, provisional,
  paused, stopped, replaced) and since when, the terms it uses and the Decisiones rows that back it.
- Content is in `src/content/{glossary,rules}.{es,en}.json`, loaded once per locale by
  `src/data/content.js`. The deploy's precache list is generated from every file under `src/`
  (`scripts/build-site.mjs`), so the content files are already in the service worker shell: a unit test
  builds the site and checks they are in `sw.js`. `sw.js` itself needed no edit.
- Shared helpers: `src/lib/glossary-links.js` (`glossaryHref`, `tagSlug`, `ruleSlug`, `decisionHref`,
  `sheetRuleSlug`), `<Term>` and `<RefText>` in the UI kit, documented in FEATURE_GUIDE section 10.

## Decisions and why

- **Themes are derived, not stored.** `decisionTheme()` folds the topic (lower case, no accents) and takes
  the first theme whose pattern matches, in a fixed order (reviews, grok, staking, filters, measures,
  data, shadow, model, workflow); if the topic matches nothing the decision text is tried, else workflow.
  The order puts specific themes first so "Revisión Sombra 300 filas" is a review and "Regla 24 (filtro 5)"
  a filter. Spot-checked on about 30 of the real topics (read only, nothing copied); unit tests use
  synthetic topics. A few real topics will land in a debatable theme; the rule is easy to tune.
- **Cross-references are tokens, not HTML.** `tokenizeRefs()` finds "Decisiones row N", "fila(s) N",
  "row(s) N" with ranges and lists ("filas 84-85, 93 y 97") and "regla(s)/rule(s) N" (with letters,
  "rule 34e"). A group is linked number by number and only when every number is a known decision row
  (or rule 1–36): the sheet also cites rows of Sombra and Grok ("filas 2-515", "fila 646", "filas 125,
  127 de Grok"), and the real Decisiones has rows 2–125, so an unknown number keeps the whole group plain.
  Another tab named just before or after ("Sombra fila 12", "fila 17 de Apuestas") also keeps it plain;
  "Reglas rule 4" (the sheet's own Reglas tab) is never a skill rule.
- **Rule states.** The brief lists in force, provisional, paused and replaced; rule 31 (AI watch) is
  neither paused nor replaced but stopped, so a fifth state "stopped" was added. Rules 1, 2, 19–21 and 23
  are replaced by rule 29 only for results and goals, so they stay "in force" with a state note; rule 23 is
  "provisional" (the skill says so) and dormant; rule 30 is "paused" (real money paused). "Since" is the
  date the skill gives (or the date of the backing decision); rules the skill gives no date say so.
- **Numbers in the rules are quoted from the skill**; amounts of money are left out (rule 4 says "contra
  el bank del momento", never a figure). The content gate test fails on `$`, COP, pesos and grouped
  thousands.
- **Tag entries keep the sheet label as the term in both languages** (VALOR CASI, SHADOW (regla 30)…),
  because that is what Juan reads in the sheet; the test checks it against `tagLabel()`.
- **The staking rules (Reglas tab) have their own numbering**, different from the skill's rules. Each
  line links to the entry that explains it through a small keyword map (`sheetRuleSlug`), falling back to
  the "Reglas (pestaña)" entry. The real lines were not read (the brief forbids reading Reglas), so the map
  was written from the fixture's lines and the skill's description; an unknown line still gets a link.
- The Glossary does not wait for the feed: content is static, so it works offline and before the first
  sync. The feed only adds tag counts and decision topics when it is loaded.

## Problems and fixes

- The foundation's shell test expected the glossary deep link to print the raw slug; it now checks the
  entry's term ("VALOR CASI").
- An evidence disclosure did not open when a search started matching inside it (its open state was set
  on mount); it is now keyed on whether the search matches, so a new match remounts it open.
- On phones the nine category chips and the A–Z bar took most of the first screen; both are now one
  line that scrolls sideways inside itself (the page never scrolls sideways).
- The contract's note table puts values in brackets (`ref` (`feed` / `books` …)); the gate test strips
  bracketed text before collecting field names.
