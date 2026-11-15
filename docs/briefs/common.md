## Setup (read carefully: other agents are working in parallel)

- Your workspace is the git worktree `<WORKTREES>/__ID__`, already created and already on branch `feat/__ID__` (check with `git -C <WORKTREES>/__ID__ status -sb`). Work ONLY inside that directory: `cd` into it at the start of every shell command (the shell may start elsewhere) and use absolute paths under it with the file tools. Never edit or run anything in `<MAIN_CHECKOUT>` (the main checkout) or in another agent's `<WORKTREES>/*` directory. Commit only on your branch, in logical steps. Do NOT push, do not touch `main`, and run no git network command at all: the orchestrator merges the branches.
- Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md` and `docs/FEATURE_GUIDE.md` completely before writing code. They are the contract. Then read `<PUBLIC_SKILLS_DIR>/frontend-design/SKILL.md` for design craft, and look at the existing UI kit and tokens (`src/lib/ui`, `src/lib/charts`, `src/styles`) so your section looks like part of the same app.
- No npm registry and no CDN here. Tools come from `/opt/npm-tools/node_modules` via `scripts/bin.mjs` (see the feature guide).
- **Ports:** every Playwright command must run with `E2E_PORT=__PORT__` (for example `E2E_PORT=__PORT__ npm run check`, `E2E_PORT=__PORT__ SCREENSHOT_DIR=<REVIEW_DIR>/__ID__ npm run screenshots`). The config reuses any server already listening on the port, and other worktrees run their own servers, so the default port would test someone else's files.
- **Files you own:** as `docs/FEATURE_GUIDE.md` section 1 says, plus what this brief names. Shared files (`src/lib`, `src/data`, `src/i18n`, `src/styles`, `tests/e2e/helpers.js`, `scripts/make-fixture.mjs`, `tests/fixtures/feed.json`) are edited by other agents at the same time: change them only when needed, only by adding (new functions, new keys, new fixture cases at the end; never reorder, rename or reformat what is there), cover each addition with a unit test, and list every shared change in your report so the merge is easy.
- **Build log:** write your entry in a new file `docs/build-log/__ID__.md` (what you built, decisions and why, problems and fixes). Do not edit `docs/BUILD_LOG.md`.
- The app is live with real data: about 710 Sombra rows, 153 Grok rows, 19 real bets, 123 decisions, growing daily. You can only test on the synthetic fixture (`?feed=fixture`, 247 picks); design and code for the real volume (paging or windowing, memoised stats).

## Rules

- ALL code in English: identifiers, file names, routes, test ids, CSS classes, comments, commits. Spanish only in i18n and content files and in sheet text. UI strings via `t()`, Spanish default (natural Colombian Spanish, tú), English complete.
- No money anywhere: no COP amount, bank balance or unit value in code, content, fixtures, tests, docs or commits. Units only; money appears only through `formatMoney` with the user's own Settings.
- Every number comes from `src/data/`. If a formula is missing, add it there with a unit test; never compute yield, EV, hit rate or drawdown in a screen.
- Show the sheet's own labels for tags (VALOR CASI, TARJETAS UNDER…) via `tagLabel`. Show `n` next to every rate or mean.
- Mobile first (390 px wide phone is the main device), then wide screens. Both themes. Accessible: labels, focus, 44 px targets, charts with a text alternative, colour never the only signal.
- The app never writes to the sheet. __SHEET__
- `E2E_PORT=__PORT__ npm run check` must pass before your last commit. Run the screenshots and LOOK at them (Read the PNGs: phone and desktop, light and dark) and fix what looks wrong or cramped before handing off. If something cannot be run, say so plainly; never claim a check passed that you did not run.
- End every commit message with these two lines:
  `Co-Authored-By: Claude Fable 5.2 <NOREPLY_ADDRESS>`
  `Claude-Session: <SESSION_URL>`
- Do not spawn subagents. If the contract is wrong or something is impossible, choose the most reasonable option, document it and continue; do not stop to ask.

## Report back (concise, factual)

Branch name and last commit; what the section does (short); every shared file you changed and why; test results with exact counts; screenshot paths; what you could not verify; open issues and suggestions for the other sections.
