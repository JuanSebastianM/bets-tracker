# Bets Tracker

Read-only PWA that shows the data of Juan's "Bets Tracker with Claude" Google Sheet. Read
`docs/ARCHITECTURE.md` and `docs/DATA_CONTRACT.md` before changing anything: they are the contract for
the stack, the layout, the feed, the data model and the privacy rules.

Rules that are easy to get wrong:

- **The sheet is the source of truth and the app never writes to it.** The only code that touches the
  sheet is `apps-script/Feed.gs`, and it only calls read methods. No sheet data is committed to this
  repository: tests use the synthetic fixtures in `tests/fixtures/`.
- **No money leaves the sheet.** No COP amount, bank balance or unit value may appear in the feed, the
  fixtures, the code, the docs, a commit message or a screenshot. The app works in units; the bankroll
  and the unit value are typed by the user in Settings and stay in that browser's `localStorage`.
  `npm run check` includes a privacy test; never weaken it to make it pass.
- Code, comments, commits and docs in English. User-visible text goes through `t()` with Spanish and
  English strings; Spanish is the default. Text that comes from the sheet is shown as written.
- No build step and no CDN. Runtime libraries are vendored in `/vendor` by the `vendor` workflow.
- The workspace has no npm or CDN access. Use the preinstalled tools in `/opt/npm-tools/node_modules`
  through `scripts/bin.mjs`.
- Run `npm run check` before pushing. `main` deploys to GitHub Pages automatically after CI passes.
- Numbers shown to the user come from `src/data/` (one place per formula). A feature never re-derives
  yield, EV or drawdown on its own.
