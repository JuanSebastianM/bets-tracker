# Brief: the Analysis section

You are building the **Analysis** section (`#/analysis`, Spanish label "Análisis") of "Bets Tracker", a read-only PWA over Juan's soccer betting Google Sheet. The Overview answers "how are things going"; the Explorer shows the picks; this section answers "where is the edge, and is the model honest": breakdowns under any filter, calibration, price quality against the close, and Grok against Claude's own verdicts.

`main` already has: the shared filter panel (`FilterPanel`, `ActiveFilters`, `FilterButton`, `SavedFilters` from `src/lib/ui`, documented in `docs/FEATURE_GUIDE.md`, "Filter panel"), `TAG_GROUPS`, the Overview's `closeVerdict` and `shadowTagRows` in `src/data/overview.js` (reuse them: the verdict words must mean the same everywhere), grouped breakdowns and calibration buckets in `src/data/stats.js`, and the charts in `src/lib/charts`. A stub screen exists in `src/features/analysis`; replace it. Other sections link here with a filter query (`date=`, `tag=`, `src=`…); read it with `fromQuery`.

## What to build

Use tabs or a segmented control for the four parts (state in the URL, e.g. `#/analysis/breakdown`), with the shared filter panel applying to all of them.

1. **Breakdown**: choose a dimension (tag, market family, exact market, league, book, price band, month, weekday, model-probability band, logged-EV band, reference, sample, FUERZA, filter reason, source) and see, per group: n, record, hit rate vs break-even, flat yield, units, mean fair-close EV ± 2 SE with n, and the verdict word. Sortable; a bar chart of the chosen measure (yield or fair-close EV) with the interval; a minimum-n slider that hides or greys small groups; each row links to the Explorer with that slice added to the current filters. A second, optional dimension gives a small two-way table (for example tag × price band) for the top groups.
2. **Calibration**: does a pick logged at 60% win 60% of the time? For the model probability, the blend, the consensus fair probability (VALOR rows) and the Sofascore AI probability: `CalibrationChart` with buckets, n per bucket, Brier score and the same score for the market's de-vigged probability when available, so he can see who is better calibrated. One plain sentence per series, honest about n.
3. **Price against the close**: distribution of fair-close EV (a histogram: add a `Histogram` chart to `src/lib/charts` additively, with a text alternative) and of raw CLV as context; share of picks that beat the fair close; split by price source (own book vs bet365 feed) as the reviews do; how closing price moved against the logged price by market family; the Pinnacle join for result markets where a pick has a Pinnacle id (`pinnacleFor` in `src/data/explore.js`): did Pinnacle's 1X2 move towards or away from the pick between open and last read, with counts.
4. **Grok vs Claude**: Grok's logged picks by our verdict (priced / priced under rule 29 / not priced and why, from the verdict text: keep the classification in `src/data/` with unit tests), each group's record, yield and fair-close EV with n; Grok's team-corner picks (the only ones still logged since 10 Nov 2026) against Sombra's CÓRNERS EQUIPO rows on the same matches when both exist; by market; a short written comparison. Be even-handed: it is a comparison of two pickers on small samples, and the text must say what n is.
5. Keep it compact on a phone: one part visible at a time, tables that scroll inside their own box only on wide content, the chart above the table, details behind disclosures.

All numbers live in `src/data/` (new file `src/data/analysis.js` for what is missing, additive changes elsewhere) with unit tests: every grouping dimension, banding edges, Brier on known cases, histogram bins, the Grok verdict classifier on every shape of verdict text in the fixture, the Pinnacle direction. Keep the test ids the foundation e2e relies on (`analysis-bars`; see `tests/e2e/helpers.js`) or update them in the same commit. E2E: each part renders on the fixture, dimension switch, minimum-n, filters applied through the panel and through the URL, links landing on a filtered Explorer, both languages, no horizontal scroll on phone and desktop.

Lessons from the sections already reviewed: pages that stack one full card per item get far too long on a phone (use compact rows that expand); tables at 1280 px must not break labels in the middle of a word (give tag columns enough width or `white-space: nowrap`).

## Setup (read carefully: other agents are working in parallel)

- Your workspace is the git worktree `<WORKTREES>/analysis`, already created and already on branch `feat/analysis` (check with `git -C <WORKTREES>/analysis status -sb`). Work ONLY inside that directory: `cd` into it at the start of every shell command (the shell may start elsewhere) and use absolute paths under it with the file tools. Never edit or run anything in `<MAIN_CHECKOUT>` (the main checkout) or in another agent's `<WORKTREES>/*` directory. Commit only on your branch, in logical steps. Do NOT push, do not touch `main`, and run no git network command at all: the orchestrator merges the branches.
- Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md` and `docs/FEATURE_GUIDE.md` completely before writing code. They are the contract. Then read `<PUBLIC_SKILLS_DIR>/frontend-design/SKILL.md` for design craft, and look at the existing UI kit and tokens (`src/lib/ui`, `src/lib/charts`, `src/styles`) so your section looks like part of the same app.
- No npm registry and no CDN here. Tools come from `/opt/npm-tools/node_modules` via `scripts/bin.mjs` (see the feature guide).
- **Ports:** every Playwright command must run with `E2E_PORT=4186` (for example `E2E_PORT=4186 npm run check`, `E2E_PORT=4186 SCREENSHOT_DIR=<REVIEW_DIR>/analysis npm run screenshots`). The config reuses any server already listening on the port, and other worktrees run their own servers, so the default port would test someone else's files.
- **Files you own:** as `docs/FEATURE_GUIDE.md` section 1 says, plus what this brief names. Shared files (`src/lib`, `src/data`, `src/i18n`, `src/styles`, `tests/e2e/helpers.js`, `scripts/make-fixture.mjs`, `tests/fixtures/feed.json`) are edited by other agents at the same time: change them only when needed, only by adding (new functions, new keys, new fixture cases at the end; never reorder, rename or reformat what is there), cover each addition with a unit test, and list every shared change in your report so the merge is easy.
- **Build log:** write your entry in a new file `docs/build-log/analysis.md` (what you built, decisions and why, problems and fixes). Do not edit `docs/BUILD_LOG.md`.
- The app is live with real data: about 710 Sombra rows, 153 Grok rows, 19 real bets, 123 decisions, growing daily. You can only test on the synthetic fixture (`?feed=fixture`, 247 picks); design and code for the real volume (paging or windowing, memoised stats).

## Rules

- ALL code in English: identifiers, file names, routes, test ids, CSS classes, comments, commits. Spanish only in i18n and content files and in sheet text. UI strings via `t()`, Spanish default (natural Colombian Spanish, tú), English complete.
- No money anywhere: no COP amount, bank balance or unit value in code, content, fixtures, tests, docs or commits. Units only; money appears only through `formatMoney` with the user's own Settings.
- Every number comes from `src/data/`. If a formula is missing, add it there with a unit test; never compute yield, EV, hit rate or drawdown in a screen.
- Show the sheet's own labels for tags (VALOR CASI, TARJETAS UNDER…) via `tagLabel`. Show `n` next to every rate or mean.
- Mobile first (390 px wide phone is the main device), then wide screens. Both themes. Accessible: labels, focus, 44 px targets, charts with a text alternative, colour never the only signal.
- The app never writes to the sheet. You do not need the real sheet: do not call any Google Sheets tool.
- `E2E_PORT=4186 npm run check` must pass before your last commit. Run the screenshots and LOOK at them (Read the PNGs: phone and desktop, light and dark) and fix what looks wrong or cramped before handing off. If something cannot be run, say so plainly; never claim a check passed that you did not run.
- End every commit message with these two lines:
  `Co-Authored-By: Claude Fable 5.2 <NOREPLY_ADDRESS>`
  `Claude-Session: <SESSION_URL>`
- Do not spawn subagents. If the contract is wrong or something is impossible, choose the most reasonable option, document it and continue; do not stop to ask.

## Report back (concise, factual)

Branch name and last commit; what the section does (short); every shared file you changed and why; test results with exact counts; screenshot paths; what you could not verify; open issues and suggestions for the other sections.
