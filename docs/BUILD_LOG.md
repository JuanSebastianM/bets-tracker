# Build log

How Bets Tracker was built, one dated entry per piece of work. Newest last. Each entry: what was built,
the decisions and why, the problems and how they were solved.

## 2026-11-15 — Foundation

**What exists.** The read-only feed script (`apps-script/Feed.gs`), the whole data layer (`src/data/`),
the shell (hash router, bottom bar on phones, side rail from 960 px, "Más" page), the UI kit and SVG
charts (`src/lib/`), light and dark tokens, i18n (Spanish default, English complete), a complete Settings
page, a small stub on real data for every other section, the PWA (manifest, generated icons, a service
worker that caches the shell only), a deterministic synthetic fixture with its generator, 72 unit tests,
21 Playwright smoke tests, review screenshots, and the CI / Pages / vendor workflows.

**Discovery on the real sheet (read only).** Before writing parsers, the sheet was read with targeted,
read-only calls: header rows, every `Estado`, every `Motivo de descarte` of Sombra (710 rows), recent and
early notes, Grok verdicts and notes, the `Mercado` values of the three tabs, the rule lines. Nothing from
it was copied into the repo; the contract gained a short inventory (counts and formats only). Findings
that changed the plan: the sheet writes **Medio** ganada/perdida (not *Media*); the sheet's time zone is
America/Los_Angeles, so dates are formatted in the spreadsheet's own zone; three early rows say
"Pasó todos los filtros / Stake < 0.25u" (new tag `low_edge`); early rule-30 rows read
`SHADOW: córners pausados (regla 30)`; Grok writes `CLV … vs Cuota (Betano)`; a free-bet note in Apuestas
carries money text (the scrubber hides it).

**Decisions and why.**

- *review.py is the reference for numbers.* The betting-review skill's `review.py` is what Juan's reviews
  run, so `notes.js` and `tests-config.js` are a port of it: the note parsers, proportional and power
  de-vig, price source, "fair-close EV" as review.py's price-vs-close EV (own book first, else the bet365
  feed), raw CLV only at the same source, SE clustered by match, break-even as the mean of 1/price, the
  frozen-test memberships. Where the first contract draft differed, the contract was corrected.
- *Feed.gs has a pure core.* `btFeedBuild(tabValues, timeZone, now)` takes plain 2-D arrays, so it is
  tested in Node through `node:vm` with no Apps Script; the Apps Script part is three read calls. Every
  global starts with `btFeed`/`BT_FEED_` because the file shares a project with the Pinnacle puller.
- *Privacy in depth.* Header whitelist, money headers refused even if whitelisted, a cell scrubber for
  every money shape, a final self-check that fails the build if `COP` or `$` survive, numeric cells with
  money text dropped, the rules tab read only below its `Reglas` header (never rule 1), and a repo-wide
  grep in `tests/unit/privacy.test.mjs`. Money examples live in one fixture file.
- *Response cache and lock (Juan's request).* The public URL runs under the owner's quota, so `doGet`
  serves a chunked CacheService copy for 5 minutes, takes a script lock on a miss so a burst builds once,
  ignores every request parameter (no bypass) and never fails because of the cache. The app shows "sheet
  read at" next to "last synced" so a 5-minute-old answer is not a surprise; `btFeedClearCache()` and the
  archive-the-deployment kill switch are documented.
- *Stale-while-revalidate in the app.* IndexedDB copy first, live fetch second, a failed fetch never drops
  shown data; fixture and live data use separate cache entries.
- *One filter object, in the URL.* Explorer and Simulator share `filters.js`; the query round-trips
  (lists are double-encoded so league names with commas survive).
- *Design.* A match-night ledger read on a phone: cool concrete greys, one floodlight-teal accent, green
  and red only for results, amber only for pending. The memorable element is the record set like a
  stadium scoreboard (big tabular W–L–V figures over a proportional bar); everything else stays quiet.
  System fonts (no CDN, nothing to vendor), tabular figures everywhere numbers line up.
- *Charts measure their box.* SVG charts read their real width (ResizeObserver) so axis text stays 11 px
  on a phone and on a desktop instead of scaling with a fixed viewBox.

**Problems and fixes.**

- Node's `deepStrictEqual` failed on arrays built inside the `vm` context (different realm): the tests
  spread them into local arrays first.
- Time-only cells: in 1899 Bogotá used local mean time (−4:56), so a naive "UTC−5" test date showed 14:33
  for 14:30. The test now builds the instant from the time-zone database, the way Sheets hands the value
  to Apps Script; the script formats with the spreadsheet's zone and gets 14:30.
- The synthetic fixture first produced three-way closes with an overround under 100%, which made a
  fair-close EV larger than its raw CLV (impossible on real data, and review.py's sanity check). The
  generator now builds ~106% books; a unit test enforces the check on every fixture row.
- The privacy grep caught money-looking strings in the code and tests (a regex back-reference, a test
  literal); they were rewritten so the only money text is the privacy fixture and the contract's examples.
- Spanish dates came out as "15 de nov de 2026" from `Intl`; `formatDate` now assembles "15 nov 2026".
