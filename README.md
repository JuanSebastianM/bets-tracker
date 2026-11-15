# Bets Tracker

A read-only, installable web app (PWA) for Juan's "Bets Tracker with Claude" Google Sheet: real bets,
shadow picks (Sombra) and Grok's picks, with filters, a "what if I had bet X on each" simulator, the frozen
tests, breakdowns, the decision log and a glossary. It reads one JSON feed served by a small Apps Script
inside the sheet and never writes anywhere but the browser's own storage. Mobile first; Spanish by
default, English complete.

- `docs/ARCHITECTURE.md` — stack, layout, sections, conventions
- `docs/DATA_CONTRACT.md` — the feed, the privacy rules, the Pick model, the formulas
- `docs/FEATURE_GUIDE.md` — how to build a section on the foundation
- `docs/BUILD_LOG.md` — how it was built
- `apps-script/Feed.gs` — the feed script, with install and redeploy steps in its header

## Quick start

```sh
npm run dev      # http://127.0.0.1:5173/?feed=fixture  (synthetic data)
npm run check    # typecheck, unit tests (privacy included), i18n parity, e2e
```

## Feed: install, redeploy, kill switch

Install and redeploy steps are in the header of `apps-script/Feed.gs`. If the public feed URL is ever
abused: in the Apps Script editor, Deploy → Manage deployments → archive the deployment (the URL stops
working at once), create a new deployment, put the new URL in `src/config.js` (`FEED_URL`) and push. The
installed app keeps showing its cached copy meanwhile. The script caches its answer for 5 minutes; run
`btFeedClearCache()` in the editor to force a fresh read.
