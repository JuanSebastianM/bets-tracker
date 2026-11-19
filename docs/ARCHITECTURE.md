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
  feed-version.js       the Feed.gs version the app expects (stamped by scripts/stamp-feed.mjs)
  data/                 feed.js, normalize.js, tags.js, notes.js, filters.js, stats.js, simulate.js,
                        summaries.js, store.js (signals/state), settings.js (localStorage),
                        tests-config.js (frozen tests, review schedule), types.d.ts
  data/ (cont.)         overview.js, analysis.js, lines.js, explore.js, decisions.js, content.js (glossary
                        loader, search, inline term index)
  lib/                  ui/ (kit, see docs/FEATURE_GUIDE.md), charts/, format.js, i18n.js, router.js,
                        store.js, storage.js, pwa.js, toast.js, theme-boot.js, glossary-links.js (every
                        link into the Glossary and the Decisions), links.js (explorerHref, SIDE_PANEL_QUERY)
  features/             one folder per section (see Sections) + registry.js
  i18n/                 es.json, en.json (same keys; checked by scripts/check-i18n.mjs)
  content/              glossary.es.json, glossary.en.json, rules.es.json, rules.en.json
  styles/               tokens.css (light + dark), base.css, components.css
scripts/                bin.mjs, serve.mjs, build-site.mjs, check-i18n.mjs, make-icons.mjs, vendor-build.mjs,
                        make-fixture.mjs (regenerates tests/fixtures/feed.json, deterministic),
                        stamp-feed.mjs (npm run feed:stamp: the feed script version)
tests/
  fixtures/             synthetic feed JSON (never real sheet data)
  unit/                 *.test.mjs
  e2e/                  *.spec.js
docs/                   ARCHITECTURE.md, DATA_CONTRACT.md, FEATURE_GUIDE.md
```

## Data flow and state

1. On start the app shows the cached feed (IndexedDB) at once, then fetches the live feed and swaps it in.
   A "last synced" stamp, the feed's "sheet read at" time (`generatedAt`) and a refresh button are always
   visible. Offline: the cache, with a banner. The script itself caches its answer for 5 minutes
   (`meta.cacheTtlSeconds`, DATA_CONTRACT "Abuse and limits"), so a refresh can bring data up to 5 minutes
   old; "sheet read at" says how old.
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
| `#/` | `features/overview` (Resumen) | Per source (Apuestas, Sombra, Grok): record, yield, units, CLV / fair-close EV, pending; trend sparklines; written summaries ("En Sombra, las VALOR van 31-22 a cuota media 2.10…"); what changed since the last visit |
| `#/explorer` | `features/explorer` (Explorador) | Every pick as a list (cards on phones, table on wide screens) with the full filter panel, search, sort, and a detail sheet per pick with the parsed notes |
| `#/simulator` | `features/simulator` (Simulador) | "If you had bet X on each": filters + stake (flat units or % of bankroll) + bankroll → curve, drawdown, streaks, yield, EV vs close, per-month table |
| `#/tests` | `features/tests` (Tests) | Each frozen test: graded rows out of 100, rows with a two-sided close out of 50, mean fair-close EV ± 2 SE, decision rule in words; countdown to the next Sombra review (14 days and 150 graded rows) |
| `#/analysis`, `#/analysis/:part` | `features/analysis` (Análisis) | Parts breakdown, calibration, close, grok. Breakdown by 16 dimensions (tag, market, raw market, league, book, price band, month, weekday, model-probability band, EV band, reference, sample, FUERZA, reason, source, line) with exact links to the Explorer, a two-way table, calibration with Brier, the price-vs-close distribution, Grok vs Claude |
| `#/decisions` | `features/decisions` (Decisiones) | The decision log as a searchable timeline, with state chips, and the staking rules |
| `#/glossary` | `features/glossary` (Glosario) | Betting terms, the sheet's own tags and abbreviations, and every betting-analyst rule in plain words; searchable, deep-linkable (`#/glossary/near-value`); terms elsewhere in the app link here |
| `#/settings` | `features/settings` (Ajustes) | Language, theme, bankroll and unit, feed status (rows per tab, redactions, missing headers), about |
| `#/more` | shell (`src/app.js`) | Phones only in practice: the list of the sections that are not in the bottom bar |

Phones get a bottom bar (Resumen, Explorador, Simulador, Tests, Más); wide screens a side rail (its
column is painted on `.app`, so it runs the full height of long pages). Detail routes: `#/explorer/:uid`,
`#/decisions/:row`, `#/glossary/:term` (`rule-N` for the betting-analyst rules).

### Query keys per section (hash query; every view is a bookmark)

| Section | Keys |
|---|---|
| Overview | `date` (`30d`, `7d`, `last_slate`; the filters' own date key) |
| Explorer | the filter keys (below) + `sort`, `dir`, `page` |
| Simulator | the filter keys + `mode`, `stake`, `pct`, `bank`, `kf`, `kcap`; scenario B in `b` (its own query string) |
| Tests | `open` (the test whose card is open); other keys (Overview's `date`) are kept |
| Analysis | the filter keys + `dim`, `dim2`, `sort`, `dir`, `measure`, `minn`, `small`, `series` (the part is in the path) |
| Decisions | `q`, `st`, `th`, `from`, `to`, `view` (`now`), `page` |
| Glossary | `tab` (`rules`), `q`, `cat`, `state` |

Filter keys (`src/data/filters.js` toQuery): `src, tag, mkt, mraw, lg, book, st, ref, sample, fz, why, side,
line` (lists), `price` (preset) or `pmin/pmax`, `date` (preset), `from`, `to`, `slate`, `close`, `close2`,
`evmin/evmax`, `prmin/prmax`, `pass`, `q`.

### Banners

The fixture banner and the offline / stale banner show on every page; the "missing columns" banner only
on the Overview and Settings (Settings lists the columns), and so does the "different feed script" banner
(`meta.scriptVersion` is not the version in `src/feed-version.js`, or is missing; dismissible for the
session; Settings shows both versions and what to do).

### Filters (shared by Explorer and Simulator)

Source; tag (multi); market family and raw market; league; book; status; price range with presets
(`≤ 1.70`; `1.70–2.00`; `< 2.00`; `≤ 2.00`; `> 2.00, ≤ 2.50`; `≤ 2.50`; `> 2.50, ≤ 4.00`; `≤ 4.00`; `> 4.00`; each
label is built from its bounds by `priceRangeLabel`, and "a–b" means both ends included) and custom min/max; date range with presets (last
slate, 7 days, 30 days, this month, since a date) and single slate date; has closing price; has two-sided
close; reference (`ref feed`, books, one book); sample (10+, 6–9); FUERZA (keeps, rejects); filter
reason (for `filtro` rows); EV range; model probability range; free-text search (match, league, notes).
The sheet has no slate *run* date, so "slate date" is the match date.

## Conventions

- **All code is English**: identifiers, file and folder names, routes, feed keys, tag ids, CSS classes,
  comments, commits, docs. Spanish appears only in `src/i18n/es.json`, `src/content/*.es.json`, the text
  that comes from the sheet, and the patterns that match that text. UI strings: `t('key')`, Spanish default, English complete.
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
  derived stats are memoised on (feed version, filter state). `tests/unit/polish-perf.test.mjs` builds
  5,000 synthetic picks from the fixture's shapes and holds normalize, a filter change with every facet
  count, summarize, the Overview figures, the Analysis breakdown and simulate to generous budgets.
- Offline: the deploy precaches every file under `src/` (build-site.mjs), so new files need no list;
  `tests/e2e/polish-offline.spec.js` builds the site, serves it under a non-localhost name (the app keeps
  the service worker off on localhost), cuts the network and opens every route. Settings shows whether
  the installed app is up to date or a new version waits (reload button). The manifest has shortcuts to
  the Explorer and the Simulator.

## Checks and deploy

`npm run check` = typecheck + unit tests (the privacy test is one of them) + i18n parity + e2e smoke. CI runs it on every
push; on `main`, when it passes, CI assembles `_site`, stamps `sw.js` and `src/version.js` with the commit
and deploys to GitHub Pages. Feature work happens on `feat/<name>` branches merged into `main` by the
orchestrator after review.

## Changing the feed

`apps-script/Feed.gs` is copied by hand into the sheet's Apps Script project and redeployed (README has
the steps). After editing it run `npm run feed:stamp` (the script version, DATA_CONTRACT "Script
version"; `npm run check` fails until you do); after redeploying, Settings shows whether the sheet runs
that version. Bump `schema` when the shape changes; the app refuses a newer schema with a clear message
instead of misreading it.
