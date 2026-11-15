# Brief: the Simulator section

You are building the **Simulator** (`#/simulator`, Spanish label "Simulador") of "Bets Tracker", a read-only PWA over Juan's soccer betting Google Sheet. Juan's words: "a section that shows me like 'if you had placed these bets at 1u each, this is how they would look like now': I should be able to pick a filter (VALOR, VALOR CASI, TARJETAS UNDER, VALOR PROP, etc), the unit amount, price ranges (<=2.0, etc), and anything you think can be helpful to filter by." He also wants to set a bankroll by hand to try the same record with different bankrolls (the real one never leaves the sheet; `settings.js` holds what he types, on his device only).

`main` already has: the shared filter panel (`FilterPanel`, `ActiveFilters`, `FilterButton`, `SavedFilters` from `src/lib/ui`, documented in `docs/FEATURE_GUIDE.md`, "Filter panel"), the Explorer (its "Simular estos picks" button opens `#/simulator?<the same filter query>`), the Overview (its links carry a period as `date=`/`slate=`), and `src/data/simulate.js` with a first version of the engine. A stub screen exists in `src/features/simulator`; replace it.

## What to build

1. **Pick the bets**: the shared filter panel exactly as the Explorer uses it (same query string, same saved filters), active-filter chips, and a one-line count ("164 picks calificados, 19 pendientes"). Default when the page is opened with no query: Sombra, all tags.
2. **Pick the staking** (state in the URL too, next to the filters):
   - flat stake in units (quick chips 0.25, 0.5, 1, 2 and a free number; default from Settings `defaultStake`);
   - percentage of the bankroll (compounding), with a starting bankroll in units (default: the bankroll from Settings converted with `bankrollUnits()` when set, otherwise a neutral 100) ;
   - "as staked" for sources that have a stake (real bets: the sheet's stake and the sheet's own profit; Grok: his suggested stake);
   - fractional Kelly from the logged fair probability and price, with the fraction (default one quarter) and a cap in units (default 2), only for picks that have a probability; say how many picks were left out.
   Explain each mode in one plain line. Same-day picks are staked on the bankroll at the start of that day (they are placed before any of them settles); document it on screen in the percentage mode.
3. **Result**, big and readable first: "Si hubieras apostado 1u en cada uno: +12.41u" (and the money equivalent only when the user set a unit value, via `formatMoney`), record, yield, picks, average price; then the cumulative curve with drawdown shading (`LineChart`) and a table toggle; maximum drawdown (units, and % of the starting bankroll), longest losing and winning streaks, best and worst day, time under water; a month-by-month table; pending picks and how many units are at stake in them.
4. **What the price says**: next to the actual result, the profit the same stakes would be expected to make judged by the closing price (sum of stake × fair-close EV over picks that have a two-sided close, with n and ± 2 SE), drawn as a second line when possible, and one honest sentence comparing both ("ganaste +12u pero contra el cierre el precio valía −4u: el resultado todavía puede ser suerte"). Add a "rango por azar" for the total (± 2 SE of the summed profit) so a small sample is not over-read.
5. **Compare two scenarios** side by side (A and B: each its own filters and staking; for example VALOR ≤ 2.0 vs VALOR, or flat vs Kelly): both curves on one chart, a small table of differences. Scenario B is optional and lives in the URL as well, so a comparison can be bookmarked. Let him save a scenario with a name (reuse the saved-filter storage: a preset stores the whole query string).
6. **Break the result down** inside the simulated set: by tag, market family and price band (reuse the grouping helpers in `src/data/`), each row linking to the Explorer with that slice.
7. Keep it compact on a phone: the first screen shows the chosen bets, the staking and the headline result; details below in collapsible blocks. Target: the default page at 390 px under about 4,000 px tall with the blocks collapsed.

All simulation maths lives in `src/data/simulate.js` (extend it additively) with unit tests: each staking mode, voids and half results, same-day ordering, compounding, Kelly cap and negative-edge picks (stake 0), drawdown and streaks on known sequences, the expected-by-close line, empty and all-pending sets. Keep the test ids the foundation e2e relies on (`sim-profit`; see `tests/e2e/helpers.js`) or update them in the same commit. E2E: arriving from the Explorer link with filters, changing the stake and seeing the headline change, each staking mode, URL round-trip through reload, scenario B, saving and re-applying a scenario, bankroll set in Settings (seed through `openApp`) showing money, both languages, no horizontal scroll on phone and desktop.

Lessons from the sections already reviewed: pages that stack one full card per item get far too long on a phone (use compact rows that expand); tables at 1280 px must not break labels in the middle of a word (give tag columns enough width or `white-space: nowrap`).

## Setup (read carefully: other agents are working in parallel)

- Your workspace is the git worktree `<WORKTREES>/simulator`, already created and already on branch `feat/simulator` (check with `git -C <WORKTREES>/simulator status -sb`). Work ONLY inside that directory: `cd` into it at the start of every shell command (the shell may start elsewhere) and use absolute paths under it with the file tools. Never edit or run anything in `<MAIN_CHECKOUT>` (the main checkout) or in another agent's `<WORKTREES>/*` directory. Commit only on your branch, in logical steps. Do NOT push, do not touch `main`, and run no git network command at all: the orchestrator merges the branches.
- Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md` and `docs/FEATURE_GUIDE.md` completely before writing code. They are the contract. Then read `<PUBLIC_SKILLS_DIR>/frontend-design/SKILL.md` for design craft, and look at the existing UI kit and tokens (`src/lib/ui`, `src/lib/charts`, `src/styles`) so your section looks like part of the same app.
- No npm registry and no CDN here. Tools come from `/opt/npm-tools/node_modules` via `scripts/bin.mjs` (see the feature guide).
- **Ports:** every Playwright command must run with `E2E_PORT=4185` (for example `E2E_PORT=4185 npm run check`, `E2E_PORT=4185 SCREENSHOT_DIR=<REVIEW_DIR>/simulator npm run screenshots`). The config reuses any server already listening on the port, and other worktrees run their own servers, so the default port would test someone else's files.
- **Files you own:** as `docs/FEATURE_GUIDE.md` section 1 says, plus what this brief names. Shared files (`src/lib`, `src/data`, `src/i18n`, `src/styles`, `tests/e2e/helpers.js`, `scripts/make-fixture.mjs`, `tests/fixtures/feed.json`) are edited by other agents at the same time: change them only when needed, only by adding (new functions, new keys, new fixture cases at the end; never reorder, rename or reformat what is there), cover each addition with a unit test, and list every shared change in your report so the merge is easy.
- **Build log:** write your entry in a new file `docs/build-log/simulator.md` (what you built, decisions and why, problems and fixes). Do not edit `docs/BUILD_LOG.md`.
- The app is live with real data: about 710 Sombra rows, 153 Grok rows, 19 real bets, 123 decisions, growing daily. You can only test on the synthetic fixture (`?feed=fixture`, 247 picks); design and code for the real volume (paging or windowing, memoised stats).

## Rules

- ALL code in English: identifiers, file names, routes, test ids, CSS classes, comments, commits. Spanish only in i18n and content files and in sheet text. UI strings via `t()`, Spanish default (natural Colombian Spanish, tú), English complete.
- No money anywhere: no COP amount, bank balance or unit value in code, content, fixtures, tests, docs or commits. Units only; money appears only through `formatMoney` with the user's own Settings.
- Every number comes from `src/data/`. If a formula is missing, add it there with a unit test; never compute yield, EV, hit rate or drawdown in a screen.
- Show the sheet's own labels for tags (VALOR CASI, TARJETAS UNDER…) via `tagLabel`. Show `n` next to every rate or mean.
- Mobile first (390 px wide phone is the main device), then wide screens. Both themes. Accessible: labels, focus, 44 px targets, charts with a text alternative, colour never the only signal.
- The app never writes to the sheet. You do not need the real sheet: do not call any Google Sheets tool.
- `E2E_PORT=4185 npm run check` must pass before your last commit. Run the screenshots and LOOK at them (Read the PNGs: phone and desktop, light and dark) and fix what looks wrong or cramped before handing off. If something cannot be run, say so plainly; never claim a check passed that you did not run.
- End every commit message with these two lines:
  `Co-Authored-By: Claude Fable 5.2 <NOREPLY_ADDRESS>`
  `Claude-Session: <SESSION_URL>`
- Do not spawn subagents. If the contract is wrong or something is impossible, choose the most reasonable option, document it and continue; do not stop to ask.

## Report back (concise, factual)

Branch name and last commit; what the section does (short); every shared file you changed and why; test results with exact counts; screenshot paths; what you could not verify; open issues and suggestions for the other sections.
