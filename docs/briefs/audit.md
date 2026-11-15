# Brief: independent audit

You are the independent auditor of "Bets Tracker", a read-only PWA over Juan's soccer betting Google Sheet. You did not build any of it. Seven other agents did, testing only on a synthetic fixture. Your job is to find out whether the app tells the truth on the real data and whether any money can leak, and to prove it. Assume nothing works until you have checked it. A polish agent is editing UI code on another branch at the same time: you report findings; you change code only as described under "Fixes".

## Part 1: privacy (money must never leave the sheet)

1. Read `CLAUDE.md` and `docs/DATA_CONTRACT.md` section 2. Review `apps-script/Feed.gs` line by line as an adversary: can any whitelisted column carry money through (text in numeric columns, headers that change, merged cells, a new column named like a whitelisted one, the Reglas block, notes with amounts written in ways the patterns miss: "4 millones", "4M", "40 mil", "COP" glued to an amount with dot thousand groups [example reworded here so the repository's privacy test passes], amounts with spaces or thin spaces, "US$", "€", "libras", units-to-money sentences such as "1u = …")? Does it call anything that writes? Can a request parameter change what it returns? Write failing unit tests for every real gap and fix the scrubber (see "Fixes").
2. Run the real scrubber on the real data: read the real sheet (access rules below) into files under `/tmp/audit/` (never inside the repository), feed the raw rows to `btFeedBuild` in Node exactly as `tests/unit/feed-gs.test.mjs` loads it, and scan the output for money in every form you can think of, and for anything else that should not be public (email addresses, phone numbers, account or document numbers, full names other than team and player names, API keys or tokens). Report what the scrubber hid (kinds and counts, never the amounts) and anything it missed.
3. Scan the repository and its whole git history (`git log -p`) for money amounts, the unit value, bank balances, real sheet rows, emails, keys. Scan the review screenshots under `<REVIEW_DIR>/` for the same by reading a sample. Check that nothing in `src/` sends data anywhere except fetching the feed URL (no analytics, no third-party requests, no `fetch` to other hosts) and that Settings values (bankroll, unit value) never leave `localStorage`.

## Part 2: do the numbers match the source of truth?

The reference implementation of every review number is `review.py`, embedded in `<SKILLS_DIR>/betting-review/SKILL.md`, described in `<SKILLS_DIR>/milestone-reviewer/SKILL.md`; the betting-analyst skill (`<SKILLS_DIR>/betting-analyst/SKILL.md`, section "Shadow tracking") defines the tags and note formats. The app's port is in `src/data/` (`normalize.js`, `tags.js`, `notes.js`, `lines.js`, `stats.js`, `simulate.js`, `tests-config.js`, `overview.js`, `analysis.js`, `filters.js`).

1. Build the real dataset: with the real rows in `/tmp/audit/`, produce the feed with `btFeedBuild` and run the app's `normalize` on it in Node.
2. Extract `review.py` from the skill file (follow the skill's own extraction instructions, including its hash check if it has one) and run it on the same real Sombra rows in the form it expects. Compare, category by category and overall: row counts per category, graded counts, records, flat yield, mean price-against-close EV and its standard error, counts of rows with a two-sided close by source, the frozen tests' numbers and states, VALOR / VALOR PROP measures. Every difference is either a bug in the app (fix or report with a failing test) or a documented, deliberate difference (then check the doc says so). Also compare with the numbers written in the latest "Revisión Sombra" row of the real Decisiones tab, restricted to the rows that existed then.
3. Independently of both, recompute from the raw rows with your own short script: per source and per tag, the record, hit rate, flat 1u profit and yield, break-even rate; for real bets the sum of units and the yield (the sheet says, for October 2026: 19 bets, 7 won, 10 lost, 2 void, average price 2.83, units and yield as the app's Overview shows). Compare with `summarize`, the Overview data, the Simulator in flat mode and the Analysis breakdown totals (the same picks must give the same totals in every section).
4. Parsing coverage on the real rows: how many Sombra rows land in each tag (and are there rows whose tag looks wrong when you read their reason text?), how many notes fields parse (close, other side, feed, opening, ref, sample, FUERZA, pin), how many selections get a line, how many statuses are "other". List concrete row numbers for anything suspicious (row numbers only, no row content with money).
5. Filters: for at least 25 filter combinations (tags × price presets × lines × dates × sources × close flags), check that `applyFilters` equals an independent selection you write yourself, that `toQuery` → `fromQuery` round-trips, and that price boundaries (1.70, 2.00, 2.50, 4.00) behave as the labels say (≤ vs <).
6. Simulator: check each staking mode on small hand-computed sequences, including voids, half results, same-day ordering in the percentage mode, and Kelly with a cap; check drawdown and streaks on known sequences.

## Part 3: does the app behave?

Run `E2E_PORT=4189 npm run check`. Then, on the fixture, exercise what the section agents said they could not verify: every route offline after one load, a feed with missing headers, an empty feed, a feed with a newer schema, 5,000 picks (use the generator's shapes) for responsiveness, both languages, both themes, 390 px and 1280 px. Report only real defects, each with steps to reproduce.

## Access to the real sheet (strictly read-only)

Spreadsheet ID `<SPREADSHEET_ID>`. Use ONLY `mcp__Google_Sheets__get_values` (load it with ToolSearch). Allowed ranges: `Sombra!A:O`, `Grok!A:N`, `Decisiones!A:F`, `Pinnacle!A:Q`, `Reglas!A10:A40`, and in `Apuestas` only `A:I`, `K:R` and `U:AB` (never columns J, S, T). Never read the tabs `Bank`, `Resumen mensual`, `Por mercado`, `Por liga`, or `Reglas!A1:B7`. Never call any other Google Sheets tool. Read in chunks of at most 150 rows and write each chunk to `/tmp/audit/` as soon as you have it (the tool returns display values: convert as the feed script would receive them, and say in the report where that conversion could hide a difference from the live script, which gets typed values). Real rows never go into the repository, a commit message or your report.

## Fixes

Commit on your branch only: (a) unit tests that reproduce a defect (synthetic data only), (b) fixes in `apps-script/Feed.gs` and `src/data/` when the defect is clear and the fix is small and tested, (c) nothing in `src/features`, `src/lib` or `src/styles` (report those). If you change `Feed.gs`, say so prominently: the orchestrator must redeploy it in the sheet.

## Report

A findings list ordered by severity (critical: money or private data can leak, or a headline number is wrong; major; minor), each with evidence, the test that reproduces it and whether you fixed it; then the comparison tables (app vs review.py vs your own recomputation: counts and rounded aggregates only); what you could not check and why. No real row content, no amounts.

## Setup (read carefully: other agents are working in parallel)

- Your workspace is the git worktree `<WORKTREES>/audit`, already created and already on branch `feat/audit` (check with `git -C <WORKTREES>/audit status -sb`). Work ONLY inside that directory: `cd` into it at the start of every shell command (the shell may start elsewhere) and use absolute paths under it with the file tools. Never edit or run anything in `<MAIN_CHECKOUT>` (the main checkout) or in another agent's `<WORKTREES>/*` directory. Commit only on your branch, in logical steps. Do NOT push, do not touch `main`, and run no git network command at all: the orchestrator merges the branches.
- Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md` and `docs/FEATURE_GUIDE.md` completely before writing code. They are the contract. Then read `<PUBLIC_SKILLS_DIR>/frontend-design/SKILL.md` for design craft, and look at the existing UI kit and tokens (`src/lib/ui`, `src/lib/charts`, `src/styles`) so your section looks like part of the same app.
- No npm registry and no CDN here. Tools come from `/opt/npm-tools/node_modules` via `scripts/bin.mjs` (see the feature guide).
- **Ports:** every Playwright command must run with `E2E_PORT=4189` (for example `E2E_PORT=4189 npm run check`, `E2E_PORT=4189 SCREENSHOT_DIR=<REVIEW_DIR>/audit npm run screenshots`). The config reuses any server already listening on the port, and other worktrees run their own servers, so the default port would test someone else's files.
- **Files you own:** as `docs/FEATURE_GUIDE.md` section 1 says, plus what this brief names. Shared files (`src/lib`, `src/data`, `src/i18n`, `src/styles`, `tests/e2e/helpers.js`, `scripts/make-fixture.mjs`, `tests/fixtures/feed.json`) are edited by other agents at the same time: change them only when needed, only by adding (new functions, new keys, new fixture cases at the end; never reorder, rename or reformat what is there), cover each addition with a unit test, and list every shared change in your report so the merge is easy.
- **Build log:** write your entry in a new file `docs/build-log/audit.md` (what you built, decisions and why, problems and fixes). Do not edit `docs/BUILD_LOG.md`.
- The app is live with real data: about 710 Sombra rows, 153 Grok rows, 19 real bets, 123 decisions, growing daily. You can only test on the synthetic fixture (`?feed=fixture`, 247 picks); design and code for the real volume (paging or windowing, memoised stats).

## Rules

- ALL code in English: identifiers, file names, routes, test ids, CSS classes, comments, commits. Spanish only in i18n and content files and in sheet text. UI strings via `t()`, Spanish default (natural Colombian Spanish, tú), English complete.
- No money anywhere: no COP amount, bank balance or unit value in code, content, fixtures, tests, docs or commits. Units only; money appears only through `formatMoney` with the user's own Settings.
- Every number comes from `src/data/`. If a formula is missing, add it there with a unit test; never compute yield, EV, hit rate or drawdown in a screen.
- Show the sheet's own labels for tags (VALOR CASI, TARJETAS UNDER…) via `tagLabel`. Show `n` next to every rate or mean.
- Mobile first (390 px wide phone is the main device), then wide screens. Both themes. Accessible: labels, focus, 44 px targets, charts with a text alternative, colour never the only signal.
- The app never writes to the sheet. Real-sheet access is exactly as this brief describes (read-only, listed ranges, files under /tmp/audit only).
- `E2E_PORT=4189 npm run check` must pass before your last commit. Run the screenshots and LOOK at them (Read the PNGs: phone and desktop, light and dark) and fix what looks wrong or cramped before handing off. If something cannot be run, say so plainly; never claim a check passed that you did not run.
- End every commit message with these two lines:
  `Co-Authored-By: Claude Fable 5.2 <NOREPLY_ADDRESS>`
  `Claude-Session: <SESSION_URL>`
- Do not spawn subagents. If the contract is wrong or something is impossible, choose the most reasonable option, document it and continue; do not stop to ask.

## Report back (concise, factual)

Branch name and last commit; what the section does (short); every shared file you changed and why; test results with exact counts; screenshot paths; what you could not verify; open issues and suggestions for the other sections.
