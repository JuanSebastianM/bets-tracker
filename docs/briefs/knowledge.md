# Brief: the Decisions and Glossary sections

You are building two sections of "Bets Tracker", a read-only PWA over Juan's soccer betting Google Sheet: **Decisions** (`#/decisions`, "Decisiones") and **Glossary** (`#/glossary`, "Glosario"). Feature folders: `src/features/decisions` and `src/features/glossary` (you own both), plus `src/content/**`. Juan's words: "a Glossary with all the terms related to sports betting and ideally including ones we have mentioned across the Sheet. Also what each rule from the betting-analyst skill means in easily digestible words."

## Domain sources

- `<SKILLS_DIR>/betting-analyst/SKILL.md` (157 KB: use grep and line ranges, do not read it whole at once): "Principles (hard rules)" (about lines 32–76) holds the numbered rules; "Shadow tracking", "Grok comparison", "Logging a confirmed bet", "Grading", "Lessons log" explain tags, notes and columns. `<SKILLS_DIR>/milestone-reviewer/SKILL.md` explains the review measures.
- `docs/DATA_CONTRACT.md` lists every tag, market family, status, filter reason and note field the app knows.
- The real Decisiones tab (read access described under Rules) shows how terms are used.

## Decisions

The feed gives `data.decisions` (row, date, topic, decision, evidence, review, status) and `data.rules` (the sheet's staking rule lines). There are about 123 decisions with long evidence texts; Juan wants the evidence kept in full.

1. A timeline, newest first, grouped by month: date, topic, status chip (Vigente, Provisional, Abierta, Reemplazada: shown as written, with distinct non-colour-only styles), the decision text; evidence and "how and when it is reviewed" expandable. Search across all text with highlighted matches, filter by status, filter by theme (derive a small set of themes from the topic text with a documented, unit-tested rule in `src/data/`: for example reviews, model, filters, shadow tests, staking, data sources, workflow), date range. State in the URL.
2. Deep link per decision: `#/decisions/<row>` (the sheet row number: the skills and the sheet cite "Decisiones row 110" / "fila 110" all the time, and other sections link here). Inside any decision text, turn "Decisiones row N", "fila N" and "row N" references into links to that decision, and "regla N" / "rule N" into links to that rule in the glossary. Do this with a small tokenizer that returns safe nodes (never innerHTML), unit-tested.
3. "Related": on a decision's page, the decisions that cite it and the ones it cites.
4. The staking rules (`data.rules`) as their own short block, each linked to the glossary entry that explains it.
5. A count and a "what is in force now" view: only Vigente and Provisional, grouped by theme.

## Glossary

1. Content files `src/content/glossary.es.json`, `glossary.en.json`, `rules.es.json`, `rules.en.json` and a small loader in `src/data/content.js` (fetch once, cache; add the files to the service worker shell list in `sw.js` so the glossary works offline, and say so in the report).
2. Entries, each with: slug, term, short definition (one or two plain sentences a newcomer understands), "in this sheet" (how Juan's system uses it, when it applies), a tiny worked example with numbers where it helps (prices, probabilities, units: never money), related slugs, category. Categories: betting basics (odds, implied probability, margin/vig, fair price, value, EV, yield, ROI, unit, stake, bankroll, variance, sample size, standard error, drawdown, closing line, CLV, steam, sharp vs soft book, Kelly, flat staking…), markets (1X2, doble oportunidad, DNB, hándicap asiático with half and quarter lines and half-won/half-lost, totales, BTTS, córners, tarjetas and how reds count, tiros, builders/dobles…), this sheet's tags (one entry per TagId, titled with the sheet label), note abbreviations (feed, apertura feed, ref feed / ref N casas / ref 1 casa / ref consenso, muestra 10+ / 6–9, FUERZA mantiene / rechaza, pin, cierre, IA media, blend, modelo últ. 5…), filter reasons (F-gap, F-ratio, razor, filtro 4, filtro 5, regla 23, muestra…), statuses, review measures (fair-close EV, de-vig, power method, 2 SE, Brier, calibration), sources and tools (Sofascore, bet365 feed, Pinnacle, Betano, Betsson, Stake, fstats, Grok).
3. **Every numbered rule of the betting-analyst skill in plain words**: number, a short title, what it says in two to four easy sentences, why it exists (the lesson behind it, when the skill gives one), its state (in force, provisional, paused, replaced) and since when, and the decisions that back it (links to `#/decisions/<row>`). Write them as you would explain them to a friend who bets casually; no jargon without a link to its entry. Cover every rule number that appears in "Principles (hard rules)" and any rule number cited elsewhere in the skill; a unit test must fail if a number in a checked-in list of expected rule numbers has no entry. Be faithful: paraphrase, do not invent thresholds; when a rule has numbers, quote the numbers exactly as the skill has them (except money: leave amounts out and say "tu unidad").
4. Screen: search-as-you-type over term, definition and aliases (accent-insensitive), category chips, A–Z, deep links `#/glossary/<slug>`, "related" links, a "rules" tab ordered by number with a state filter. Slugs are stable kebab-case English (tag entries use the kebab-case of the tag id, e.g. `near-value`; rules use `rule-29`).
5. For the rest of the app: a helper `src/lib/glossary-links.js` exporting `glossaryHref(slug)`, `tagSlug(tagId)`, `ruleSlug(n)` and a tiny `<Term slug=…>` link component (exported from `src/lib/ui/index.js`), documented in `docs/FEATURE_GUIDE.md`. Other agents are told to link to `#/glossary/<slug>` with these slug conventions.
6. Quality gates as unit tests: Spanish and English have the same slugs; every TagId, MarketFamily, Status, filter reason and note field named in `src/data/tags.js` / the data contract has an entry; every "related" slug exists; no entry contains a currency amount; every rule number expected has an entry in both languages.

Spanish is the primary language of the content (natural Colombian Spanish, tú); English is a full translation, not a summary. Tests: the unit gates above, e2e for search, category filter, deep links, decision deep link and cross-links, status filter, both languages, no horizontal scroll. Keep the test ids the foundation e2e relies on (`decisions-count`, `glossary-tags`; see `tests/e2e/helpers.js`) or update them in the same commit.

## Setup (read carefully: other agents are working in parallel)

- Your workspace is the git worktree `<WORKTREES>/knowledge`, already created and already on branch `feat/knowledge` (check with `git -C <WORKTREES>/knowledge status -sb`). Work ONLY inside that directory: `cd` into it at the start of every shell command (the shell may start elsewhere) and use absolute paths under it with the file tools. Never edit or run anything in `<MAIN_CHECKOUT>` (the main checkout) or in another agent's `<WORKTREES>/*` directory. Commit only on your branch, in logical steps. Do NOT push, do not touch `main`, and run no git network command at all: the orchestrator merges the branches.
- Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md` and `docs/FEATURE_GUIDE.md` completely before writing code. They are the contract. Then read `<PUBLIC_SKILLS_DIR>/frontend-design/SKILL.md` for design craft, and look at the existing UI kit and tokens (`src/lib/ui`, `src/lib/charts`, `src/styles`) so your section looks like part of the same app.
- No npm registry and no CDN here. Tools come from `/opt/npm-tools/node_modules` via `scripts/bin.mjs` (see the feature guide).
- **Ports:** every Playwright command must run with `E2E_PORT=4183` (for example `E2E_PORT=4183 npm run check`, `E2E_PORT=4183 SCREENSHOT_DIR=<REVIEW_DIR>/knowledge npm run screenshots`). The config reuses any server already listening on the port, and other worktrees run their own servers, so the default port would test someone else's files.
- **Files you own:** as `docs/FEATURE_GUIDE.md` section 1 says, plus what this brief names. Shared files (`src/lib`, `src/data`, `src/i18n`, `src/styles`, `tests/e2e/helpers.js`, `scripts/make-fixture.mjs`, `tests/fixtures/feed.json`) are edited by other agents at the same time: change them only when needed, only by adding (new functions, new keys, new fixture cases at the end; never reorder, rename or reformat what is there), cover each addition with a unit test, and list every shared change in your report so the merge is easy.
- **Build log:** write your entry in a new file `docs/build-log/knowledge.md` (what you built, decisions and why, problems and fixes). Do not edit `docs/BUILD_LOG.md`.
- The app is live with real data: about 710 Sombra rows, 153 Grok rows, 19 real bets, 123 decisions, growing daily. You can only test on the synthetic fixture (`?feed=fixture`, 247 picks); design and code for the real volume (paging or windowing, memoised stats).

## Rules

- ALL code in English: identifiers, file names, routes, test ids, CSS classes, comments, commits. Spanish only in i18n and content files and in sheet text. UI strings via `t()`, Spanish default (natural Colombian Spanish, tú), English complete.
- No money anywhere: no COP amount, bank balance or unit value in code, content, fixtures, tests, docs or commits. Units only; money appears only through `formatMoney` with the user's own Settings.
- Every number comes from `src/data/`. If a formula is missing, add it there with a unit test; never compute yield, EV, hit rate or drawdown in a screen.
- Show the sheet's own labels for tags (VALOR CASI, TARJETAS UNDER…) via `tagLabel`. Show `n` next to every rate or mean.
- Mobile first (390 px wide phone is the main device), then wide screens. Both themes. Accessible: labels, focus, 44 px targets, charts with a text alternative, colour never the only signal.
- The app never writes to the sheet. You may read the real sheet only with mcp__Google_Sheets__get_values (load it with ToolSearch), only the tab Decisiones (spreadsheet ID <SPREADSHEET_ID>), in targeted ranges, to understand the content; never call any other Google Sheets tool, never read the tabs Bank, Resumen mensual, Por mercado, Por liga or Reglas!A1:B7, and never copy real rows into the repo.
- `E2E_PORT=4183 npm run check` must pass before your last commit. Run the screenshots and LOOK at them (Read the PNGs: phone and desktop, light and dark) and fix what looks wrong or cramped before handing off. If something cannot be run, say so plainly; never claim a check passed that you did not run.
- End every commit message with these two lines:
  `Co-Authored-By: Claude Fable 5.2 <NOREPLY_ADDRESS>`
  `Claude-Session: <SESSION_URL>`
- Do not spawn subagents. If the contract is wrong or something is impossible, choose the most reasonable option, document it and continue; do not stop to ask.

## Report back (concise, factual)

Branch name and last commit; what the section does (short); every shared file you changed and why; test results with exact counts; screenshot paths; what you could not verify; open issues and suggestions for the other sections.
