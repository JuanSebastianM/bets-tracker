# Fixes: feed script version, exact Tests links (branch `feat/fixes`)

Two items from the README's open list, both answered "fix it" by Juan.

## 1. A missed redeploy of the feed script is visible

- `apps-script/Feed.gs` has `BT_FEED_SCRIPT_VERSION`: the first 12 hex characters of the SHA-256 of the
  file with that one value blanked (line endings as `\n`). It changes with any other edit, comments
  included, and stamping it does not change it.
- `scripts/stamp-feed.mjs` (`npm run feed:stamp`; `--check` writes nothing) computes it and writes it into
  `Feed.gs`, `src/feed-version.js` (`FEED_SCRIPT_VERSION`, what the app expects) and the fixture's
  `meta.scriptVersion`. `tests/unit/fixes-feed-version.test.mjs` recomputes it and fails when any of the
  three is stale, so editing `Feed.gs` without restamping fails `npm run check`.
- The script returns it as `meta.scriptVersion`, logs it first in `btFeedSelfTest`, and its cache prefix
  is now `btFeed:s1:v<version>:`, so a redeployed script never serves the previous version's cached copy
  (unit test with a fake cache shared by two versions). Nothing else in the script changed.
- App: `validateFeed` sets a missing or empty value to `null`; `scriptVersionStatus(meta)` in
  `src/data/feed.js` returns `current`, `different` or `missing`. Settings ("Datos de la hoja") shows both
  versions, the state, and when they differ: the data is still valid, what to do (paste, self-test, new
  version of the existing deployment), the five-minute cache, and a link to README section 5. A calm
  info banner shows on the Overview and Settings only (as the missing-columns banner), with "Ver en
  Ajustes" and "Ocultar por ahora"; dismissal is per session (`sessionStorage`, keyed on the pair
  deployed → expected, so a new mismatch shows again).
- The fixture generator imports the expected version, so ordinary e2e runs never show the banner; the
  banner tests change the value in a route.
- Decision: a missing field counts as "different" (the currently deployed script has none), worded as
  "one from before the script reported its version". No schema bump: the shape did not change.
- Problem: the privacy test greps the repo for a dollar sign next to a digit, which flagged regex
  replacement strings (numbered group references). Fixed with replacer functions instead of touching the test.

## 2. Every Tests link is exact

- New filter field `tests` (URL `test`), ids of `TEST_FILTERS` in `src/data/tests-config.js`: the 8 frozen
  tests, the 4 price-first tests and the 7 stopped categories (ids unique across kinds, unit-tested).
  Each entry's `member` is the predicate the card counts with: `isCountable && match` for frozen tests
  and stopped categories, `priceFirstMember(test)` (now also used by `priceFirstProgress`) for the
  price-first ones. `testIdsOf(pick)` is memoised per pick in a `WeakMap`.
- Decision: a link shows every member row, pending included (the card's `rows`), not only graded ones:
  the Explorer is for looking at the rows, and the card already shows graded / pending separately. The
  link says the count ("Ver las 12 filas en el Explorador", `data-rows`), which is the Explorer's count.
- `filters.js` imports `tests-config.js`; `tests-config.js` only references `filters.js` in JSDoc types,
  so there is no run-time cycle and no restructuring was needed.
- Everything a list field has: URL round trip (unknown ids dropped), `filterOptions` (config order),
  `facetCounts`, `activeEntries` right after source and tag ("Prueba: CÓRNERS EQUIPO (pasó todos los
  filtros)"), removal, `countActive`, saved presets; old URLs parse as before.
- Filter panel: a "Prueba" section after Tag, collapsed by default, three groups (frozen, price-first,
  stopped) with counts; its chips wrap instead of being cut (the labels differ at the end). It works in
  the Explorer, the Simulator and Analysis because they share the panel.
- Every `explorer` in the config is now `{ tests: [id] }`; `explorerExact`, the approximation note and
  its strings are gone, as are the field-filter constants only the old links used.

## Tests

- Unit: `fixes-feed-version.test.mjs` (7) and `fixes-test-filter.test.mjs` (7), including the link =
  membership = card rows check for every test on the fixture, on synthetic rows that hit CÓRNERS EQUIPO's
  "OR dated" branch (date only, passed-all only, neither, pending, published, not countable, Grok), and
  through the URL. Two shared tests updated: `lines.test.mjs` (no `explorerExact`; every link exact) and
  `tests-section.test.mjs` (links are `test=<id>`).
- E2E: `fixes-feed-version.spec.js` (5), `fixes-test-filter.spec.js` (6); `tests.spec.js` expects the new
  link URL. `fixes-screenshots.spec.js` (review only) shoots the banner, Settings, a Tests card, the
  Explorer on `test=` and the panel section.
