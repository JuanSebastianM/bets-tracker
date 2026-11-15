# Architecture

Bets Tracker is a static, installable web app (PWA) that reads one JSON feed served by a script inside
Juan's Google Sheet and shows it. It has no backend of its own and never writes anywhere except the
browser's own storage. `docs/DATA_CONTRACT.md` describes the feed, the privacy rules and the data model.

## Stack

- **Preact + htm**, plain ES modules, **no build step and no CDN**. Libraries live in `/vendor`, bundled
  by the `vendor` GitHub workflow from the versions pinned in `vendor/versions.json`.
- **TypeScript as a checker only**: source is `.js` with JSDoc types, `tsc --noEmit` runs in `check`.
- **Charts are hand-written SVG components** in `src/lib/charts/` (line, bars, calibration scatter,
  sparkline). No chart library.
- **Tests**: `node --test` for unit tests, Playwright for end-to-end smoke tests and screenshots.
- **Hosting**: GitHub Pages, deployed by CI from `main`.
- **Feed**: Google Apps Script web app (`apps-script/Feed.gs`), deployed from the sheet's own script
  project, "execute as me, anyone can access". Its URL is public by design and lives in `src/config.js`.

The stack is the one already used in `JuanSebastianM/tyler-tracker` (same scripts, same CI shape, same
vendor workflow), minus Supabase. The development workspace has no npm access, which is why there is no
bundler: everything must run from the files as they are.

## Layout

```
index.html              app shell, loads src/main.js
manifest.webmanifest    PWA manifest
sw.js                   service worker: caches the shell, never the feed
apps-script/Feed.gs     the only code that reads the sheet (read only)
assets/                 icons
vendor/                 preact.js (+ .d.ts), versions.json
src/
  main.js, app.js       boot, router (hash routes), layout, nav
  config.js             FEED_URL, schema version
  version.js            stamped by the deploy
  data/                 feed.js, normalize.js, tags.js, notes.js, filters.js, stats.js, simulate.js,
                        summaries.js, store.js (signals/state), settings.js (localStorage)
  lib/                  ui/ (kit: Card, Chip, Sheet, Table, Stat, Empty, Banner…), charts/, format.js, i18n.js
  features/             one folder per section (see Sections)
  i18n/                 es.json, en.json (same keys; checked by scripts/check-i18n.mjs)
  content/              glossary.es.json, glossary.en.json, rules.es.json, rules.en.json
  styles/               tokens.css (light + dark), base.css, components.css
scripts/                bin.mjs, serve.mjs, build-site.mjs, check-i18n.mjs, make-icons.mjs, vendor-build.mjs
tests/
  fixtures/             synthetic feed JSON (never real sheet data)
  unit/                 *.test.mjs
  e2e/                  *.spec.js
docs/                   ARCHITECTURE.md, DATA_CONTRACT.md, FEATURE_GUIDE.md
```

## Data flow and state

1. On start the app shows the cached feed (IndexedDB) at once, then fetches the live feed and swaps it in.
   A "last synced" stamp and a refresh button are always visible. Offline: the cache, with a banner.
2. `normalize.js` builds `Pick[]` once per feed; everything else derives from it with pure functions.
3. Filter state is one plain object (`src/data/filters.js`), serialisable to the URL hash query, so a
   filtered view can be bookmarked or shared and the Explorer and the Simulator share the same filters.
4. Settings (`localStorage`): language, theme, bankroll, unit value, currency label, default stake,
   saved filter presets. Nothing in Settings is ever sent anywhere.
5. `?feed=fixture` loads `tests/fixtures/feed.json` instead of the live feed (used by e2e tests and by
   development before the script is deployed).

## Sections (hash routes)

| Route | Feature folder | What it shows |
|---|---|---|
| `#/` | `features/resumen` | Per source (Apuestas, Sombra, Grok): record, yield, units, CLV / fair-close EV, pending; trend sparklines; written summaries ("En Sombra, las VALOR van 31-22 a cuota media 2.10…"); what changed since the last visit |
| `#/explorador` | `features/explorador` | Every pick as a list (cards on phones, table on wide screens) with the full filter panel, search, sort, and a detail sheet per pick with the parsed notes |
| `#/simulador` | `features/simulador` | "If you had bet X on each": filters + stake (flat units or % of bankroll) + bankroll → curve, drawdown, streaks, yield, EV vs close, per-month table |
| `#/tests` | `features/tests` | Each frozen test: graded rows out of 100, rows with a two-sided close out of 50, mean fair-close EV ± 2 SE, decision rule in words; countdown to the next Sombra review (14 days and 150 graded rows) |
| `#/analisis` | `features/analisis` | Breakdowns (market, league, book, price band, tag, month, weekday), calibration (probability vs hit rate), CLV distribution, Grok vs Claude |
| `#/decisiones` | `features/decisiones` | The decision log as a searchable timeline, with state chips, and the staking rules |
| `#/glosario` | `features/glosario` | Betting terms, the sheet's own tags and abbreviations, and every betting-analyst rule in plain words; searchable, deep-linkable (`#/glosario/valor-casi`); terms elsewhere in the app link here |
| `#/ajustes` | `features/ajustes` | Language, theme, bankroll and unit, feed status (rows per tab, redactions, missing headers), about |

Phones get a bottom bar (Resumen, Explorador, Simulador, Tests, Más); wide screens a side rail.

### Filters (shared by Explorador and Simulador)

Source; tag (multi); market family and raw market; league; book; status; price range with presets
(≤1.70, 1.70–2.0, ≤2.0, 2.0–2.5, ≤2.5, 2.5–4.0, >4.0) and custom min/max; date range with presets (last
slate, 7 days, 30 days, this month, since a date) and single slate date; has closing price; has two-sided
close; reference (`ref feed`, books, one book); sample (10+, 6–9); FUERZA (mantiene, rechaza); filter
reason (for `filtro` rows); EV range; model probability range; free-text search (match, league, notes).
The sheet has no slate *run* date, so "slate date" is the match date.

## Conventions

- Code, comments, commits, docs: English. UI strings: `t('key')`, Spanish default, English complete.
  Sheet text (leagues, matches, notes, decisions) is shown as written, never translated.
- Numbers: `format.js` only. Prices 2 decimals (3 when the sheet has 3), units with sign and 2 decimals,
  percentages 1 decimal, dates `15 nov 2026`. Money appears only when a bankroll is set in Settings and
  is labelled as the user's own setting.
- Accessibility: semantic HTML, focus states, 44 px touch targets, contrast AA in both themes, charts
  have a text alternative (the summary sentence and a table toggle), colour is never the only signal
  (won/lost also differ by icon or sign).
- Design: mobile first (the main use is a phone), calm and dense like a good sports-stats app, not a
  casino. One accent colour; green/red only for results. Dark and light themes from tokens.
- A feature folder owns its components and its e2e spec; it imports data only from `src/data/` and UI
  only from `src/lib/`. Shared needs go into `src/lib/` or `src/data/`, not copied between features.
- Performance: the feed can reach a few thousand rows. Lists are windowed or paged (50 per page);
  derived stats are memoised on (feed version, filter state).

## Checks and deploy

`npm run check` = typecheck + unit tests + i18n parity + privacy test + e2e smoke. CI runs it on every
push; on `main`, when it passes, CI assembles `_site`, stamps `sw.js` and `src/version.js` with the commit
and deploys to GitHub Pages. Feature work happens on `feat/<name>` branches merged into `main` by the
orchestrator after review.

## Changing the feed

`apps-script/Feed.gs` is copied by hand into the sheet's Apps Script project and redeployed (README has
the steps). Bump `schema` when the shape changes; the app refuses a newer schema with a clear message
instead of misreading it.
