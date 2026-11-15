# Brief: the Tests section

You are building the **Tests** section (`#/tests`) of "Bets Tracker", a read-only PWA over Juan's soccer betting Google Sheet. Juan runs several "shadow tests": categories of picks that are logged without staking money, each with a fixed rule for when and how it gets decided. Today he has to ask a reviewer agent how they are going; this screen should tell him at a glance, in plain words, and be exactly consistent with how his reviews compute things.

## Domain sources (read the relevant parts; they are long, use grep and line ranges)

- `<SKILLS_DIR>/betting-analyst/SKILL.md`: section "Shadow tracking (`Sombra` tab)" (about lines 96–137), especially "Frozen tests", "Review", "VALOR PROP picks", "Model card-under picks", "Corner rejects", "Team-corner picks", "Model-only shots pick", and the rules it cites (grep "rule 29", "rule 30", "rule 32", "rule 34").
- `<SKILLS_DIR>/milestone-reviewer/SKILL.md` and `<SKILLS_DIR>/betting-review/SKILL.md` (`review.py`): the exact calculations. `src/data/tests-config.js` and `src/data/stats.js` already port them: memberships and formulas stay there; never re-derive them in the screen. If you find a mismatch with `review.py`, fix the data layer with a unit test and say so in the report.

## What to build

1. **Next Sombra review** card: the rule (at least 14 days since the last "Revisión Sombra" row in Decisiones and at least 150 rows graded since it), where it stands (days and rows left, a two-part progress), and "due now" when both are met. Below it, the history of past reviews (Decisiones rows whose topic starts with "Revisión Sombra"), each linking to `#/decisions/<row>` (that route is being built by another agent; just link to it).
2. **Frozen tests**: one card per test in `FROZEN_TESTS`: sheet label, what it tests in one plain sentence, start date, graded rows out of 100, rows with a two-sided close out of 50 (two progress bars), mean EV against the close with ± 2 standard errors drawn as an interval against zero, the state (collecting / would pass / would stop) with the rule in words ("se decide una sola vez, a las 100 filas, por precio contra el cierre y no por resultados; si pasa se te propone dinero real a 0.25u, nunca se aplica solo"), flat yield and hit rate clearly marked as context that decides nothing, a projected date for reaching 100 at the recent pace (in `src/data/`, unit-tested, shown as an estimate), and links: the picks in the Explorer (`href('/explorer?…')` with the tag filter; build the query with `toQueryString`), the decision row that defines it.
3. **Price-first tests** (VALOR, VALOR CASI, VALOR PROP, VALOR PROP CASI): they have their own rules (Decisiones rows 80, 97, 108; read them and the skill). Same card language, their own rule text, including the split by price source where reviews report it.
4. **Stopped or paused categories** (IA-WATCH, team-corner rejects, corner and card fillers…): a compact list with when and why they stopped and their final numbers, so old rows in the sheet make sense.
5. A short **"how to read this"** block at the top, collapsible: why decisions are made on price against the close instead of results, what 2 standard errors mean in one sentence, why a test is decided once. Link terms to the glossary (`#/glossary/<slug>`, slug = kebab-case of the term or tag id; another agent builds it).
6. An overview strip at the very top: how many tests are collecting, how many reached their decision count, the closest one to its decision.

Rule texts, start dates and decision rows belong in `src/data/tests-config.js` (data) with their display strings in your feature i18n; if a test's definition in the config is incomplete for this screen, extend the config additively with unit tests. Keep the test ids the foundation e2e relies on (`frozen-table`; see `tests/e2e/helpers.js`) or update them in the same commit. Tests: unit tests for every data addition (projection, state edge cases: 0 rows, 99/100, 100 with fewer than 50 closes, exactly on the 2 SE boundary); e2e for the screen on the fixture, links, both languages, no horizontal scroll.

## Setup (read carefully: other agents are working in parallel)

- Your workspace is the git worktree `<WORKTREES>/tests`, already created and already on branch `feat/tests` (check with `git -C <WORKTREES>/tests status -sb`). Work ONLY inside that directory: `cd` into it at the start of every shell command (the shell may start elsewhere) and use absolute paths under it with the file tools. Never edit or run anything in `<MAIN_CHECKOUT>` (the main checkout) or in another agent's `<WORKTREES>/*` directory. Commit only on your branch, in logical steps. Do NOT push, do not touch `main`, and run no git network command at all: the orchestrator merges the branches.
- Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md` and `docs/FEATURE_GUIDE.md` completely before writing code. They are the contract. Then read `<PUBLIC_SKILLS_DIR>/frontend-design/SKILL.md` for design craft, and look at the existing UI kit and tokens (`src/lib/ui`, `src/lib/charts`, `src/styles`) so your section looks like part of the same app.
- No npm registry and no CDN here. Tools come from `/opt/npm-tools/node_modules` via `scripts/bin.mjs` (see the feature guide).
- **Ports:** every Playwright command must run with `E2E_PORT=4184` (for example `E2E_PORT=4184 npm run check`, `E2E_PORT=4184 SCREENSHOT_DIR=<REVIEW_DIR>/tests npm run screenshots`). The config reuses any server already listening on the port, and other worktrees run their own servers, so the default port would test someone else's files.
- **Files you own:** as `docs/FEATURE_GUIDE.md` section 1 says, plus what this brief names. Shared files (`src/lib`, `src/data`, `src/i18n`, `src/styles`, `tests/e2e/helpers.js`, `scripts/make-fixture.mjs`, `tests/fixtures/feed.json`) are edited by other agents at the same time: change them only when needed, only by adding (new functions, new keys, new fixture cases at the end; never reorder, rename or reformat what is there), cover each addition with a unit test, and list every shared change in your report so the merge is easy.
- **Build log:** write your entry in a new file `docs/build-log/tests.md` (what you built, decisions and why, problems and fixes). Do not edit `docs/BUILD_LOG.md`.
- The app is live with real data: about 710 Sombra rows, 153 Grok rows, 19 real bets, 123 decisions, growing daily. You can only test on the synthetic fixture (`?feed=fixture`, 247 picks); design and code for the real volume (paging or windowing, memoised stats).

## Rules

- ALL code in English: identifiers, file names, routes, test ids, CSS classes, comments, commits. Spanish only in i18n and content files and in sheet text. UI strings via `t()`, Spanish default (natural Colombian Spanish, tú), English complete.
- No money anywhere: no COP amount, bank balance or unit value in code, content, fixtures, tests, docs or commits. Units only; money appears only through `formatMoney` with the user's own Settings.
- Every number comes from `src/data/`. If a formula is missing, add it there with a unit test; never compute yield, EV, hit rate or drawdown in a screen.
- Show the sheet's own labels for tags (VALOR CASI, TARJETAS UNDER…) via `tagLabel`. Show `n` next to every rate or mean.
- Mobile first (390 px wide phone is the main device), then wide screens. Both themes. Accessible: labels, focus, 44 px targets, charts with a text alternative, colour never the only signal.
- The app never writes to the sheet. You may read the real sheet only with mcp__Google_Sheets__get_values (load it with ToolSearch), only the tab Decisiones (spreadsheet ID <SPREADSHEET_ID>), in targeted ranges, to understand the content; never call any other Google Sheets tool, never read the tabs Bank, Resumen mensual, Por mercado, Por liga or Reglas!A1:B7, and never copy real rows into the repo.
- `E2E_PORT=4184 npm run check` must pass before your last commit. Run the screenshots and LOOK at them (Read the PNGs: phone and desktop, light and dark) and fix what looks wrong or cramped before handing off. If something cannot be run, say so plainly; never claim a check passed that you did not run.
- End every commit message with these two lines:
  `Co-Authored-By: Claude Fable 5.2 <NOREPLY_ADDRESS>`
  `Claude-Session: <SESSION_URL>`
- Do not spawn subagents. If the contract is wrong or something is impossible, choose the most reasonable option, document it and continue; do not stop to ask.

## Report back (concise, factual)

Branch name and last commit; what the section does (short); every shared file you changed and why; test results with exact counts; screenshot paths; what you could not verify; open issues and suggestions for the other sections.
