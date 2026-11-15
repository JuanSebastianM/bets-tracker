# Brief: the Overview section

You are building the **Overview** (`#/`, Spanish label "Resumen") of "Bets Tracker", a read-only PWA over Juan's soccer betting Google Sheet. It is the first screen he sees, mostly on his phone, several times a day. His words: "a way to see how bets are doing (Sombra, Grok, Apuestas, etc)" and "summaries in human-readable text". A stub exists (one card per source); replace it with the real thing.

## What to build

1. **At a glance, per source** (Apuestas = real bets, Sombra = shadow picks at 1u flat, Grok = Grok's picks at 1u flat): record, units, yield, hit rate vs break-even, mean fair-close EV ± 2 SE with n, pending, and a cumulative curve. A period switch (all, 30 days, 7 days, last slate) that applies to the whole screen and lives in the URL.
2. **By tag** (the heart of it): a compact ranked table/cards of every Sombra tag with graded picks (VALOR, VALOR CASI, VALOR PROP, VALOR PROP CASI, TARJETAS UNDER, CÓRNERS EQUIPO, CÓRNERS RECHAZO, SHADOW regla 30, MODELO SOLO, PUBLICADA, filter rejects…): n, record, yield, fair-close EV with its interval shown as a small range bar, and a plain verdict word chosen by a documented rule in `src/data/` (for example "muy pronto" under a minimum n, "por debajo del cierre", "por encima del cierre") so he can read the table in five seconds. Each row links to the Explorer with that tag filtered (`href('/explorer?…')` built with `toQueryString`). Same idea, smaller, by market family.
3. **Written summaries**: extend `src/data/summaries.js` (you own it) so the screen can say, in Spanish and English, things like: how each source is doing and whether the sample is big enough to mean anything; the best and worst tags against the close with n; what happened in the last slate (graded, record, units) and what is pending today; the gap between results and price quality when they disagree ("gana en resultados pero pierde contra el cierre: probablemente suerte"). Sentences must be built from numbers in `src/data/`, be honest about small samples, and never promise profit. Unit-test the builders in both languages.
4. **Today / pending**: picks dated today or later still pending, grouped by slate date, with a link to the Explorer.
5. **Since your last visit**: picks graded since `settings.lastVisit` (results and net units per source), then update `lastVisit` (write it when the screen has been seen, not on every render). First visit shows nothing special.
6. **Real bets extras** for Apuestas: units over time using the sheet's own profit, current drawdown from peak (in units, and as % of the bankroll only if the user set one in Settings, via the helpers in `settings.js`/`stats.js`), average stake, best and worst day.
7. Quick links: "Ver todos los picks", "Simular", "Tests", each carrying the current period.

Keep the test ids the foundation e2e relies on (`source-shadow` and friends; see `tests/e2e/helpers.js` and `tests/e2e/shell.spec.js`) or update those tests in the same commit. Tests: unit tests for every new data function and sentence builder; e2e for the period switch (URL round-trip), tag table links landing on a filtered Explorer, last-visit behaviour (seed `settings` through `openApp`), both languages, no horizontal scroll.

## Setup (read carefully: other agents are working in parallel)

- Your workspace is the git worktree `<WORKTREES>/overview`, already created and already on branch `feat/overview` (check with `git -C <WORKTREES>/overview status -sb`). Work ONLY inside that directory: `cd` into it at the start of every shell command (the shell may start elsewhere) and use absolute paths under it with the file tools. Never edit or run anything in `<MAIN_CHECKOUT>` (the main checkout) or in another agent's `<WORKTREES>/*` directory. Commit only on your branch, in logical steps. Do NOT push, do not touch `main`, and run no git network command at all: the orchestrator merges the branches.
- Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md` and `docs/FEATURE_GUIDE.md` completely before writing code. They are the contract. Then read `<PUBLIC_SKILLS_DIR>/frontend-design/SKILL.md` for design craft, and look at the existing UI kit and tokens (`src/lib/ui`, `src/lib/charts`, `src/styles`) so your section looks like part of the same app.
- No npm registry and no CDN here. Tools come from `/opt/npm-tools/node_modules` via `scripts/bin.mjs` (see the feature guide).
- **Ports:** every Playwright command must run with `E2E_PORT=4182` (for example `E2E_PORT=4182 npm run check`, `E2E_PORT=4182 SCREENSHOT_DIR=<REVIEW_DIR>/overview npm run screenshots`). The config reuses any server already listening on the port, and other worktrees run their own servers, so the default port would test someone else's files.
- **Files you own:** as `docs/FEATURE_GUIDE.md` section 1 says, plus what this brief names. Shared files (`src/lib`, `src/data`, `src/i18n`, `src/styles`, `tests/e2e/helpers.js`, `scripts/make-fixture.mjs`, `tests/fixtures/feed.json`) are edited by other agents at the same time: change them only when needed, only by adding (new functions, new keys, new fixture cases at the end; never reorder, rename or reformat what is there), cover each addition with a unit test, and list every shared change in your report so the merge is easy.
- **Build log:** write your entry in a new file `docs/build-log/overview.md` (what you built, decisions and why, problems and fixes). Do not edit `docs/BUILD_LOG.md`.
- The app is live with real data: about 710 Sombra rows, 153 Grok rows, 19 real bets, 123 decisions, growing daily. You can only test on the synthetic fixture (`?feed=fixture`, 247 picks); design and code for the real volume (paging or windowing, memoised stats).

## Rules

- ALL code in English: identifiers, file names, routes, test ids, CSS classes, comments, commits. Spanish only in i18n and content files and in sheet text. UI strings via `t()`, Spanish default (natural Colombian Spanish, tú), English complete.
- No money anywhere: no COP amount, bank balance or unit value in code, content, fixtures, tests, docs or commits. Units only; money appears only through `formatMoney` with the user's own Settings.
- Every number comes from `src/data/`. If a formula is missing, add it there with a unit test; never compute yield, EV, hit rate or drawdown in a screen.
- Show the sheet's own labels for tags (VALOR CASI, TARJETAS UNDER…) via `tagLabel`. Show `n` next to every rate or mean.
- Mobile first (390 px wide phone is the main device), then wide screens. Both themes. Accessible: labels, focus, 44 px targets, charts with a text alternative, colour never the only signal.
- The app never writes to the sheet. You do not need the real sheet: do not call any Google Sheets tool.
- `E2E_PORT=4182 npm run check` must pass before your last commit. Run the screenshots and LOOK at them (Read the PNGs: phone and desktop, light and dark) and fix what looks wrong or cramped before handing off. If something cannot be run, say so plainly; never claim a check passed that you did not run.
- End every commit message with these two lines:
  `Co-Authored-By: Claude Fable 5.2 <NOREPLY_ADDRESS>`
  `Claude-Session: <SESSION_URL>`
- Do not spawn subagents. If the contract is wrong or something is impossible, choose the most reasonable option, document it and continue; do not stop to ask.

## Report back (concise, factual)

Branch name and last commit; what the section does (short); every shared file you changed and why; test results with exact counts; screenshot paths; what you could not verify; open issues and suggestions for the other sections.
