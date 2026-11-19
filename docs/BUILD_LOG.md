# Build log

How Bets Tracker was built, one entry per piece of work, in the order it was merged (all on 15 Nov 2026,
times in Bogotá). Each entry: what was built, the decisions and why, the problems and how they were
solved. Entries are kept as written at the time: a later entry can supersede an earlier one (for example
the price bands, the glossary links or the Reglas mapping). The README tells the whole story in one
place: [How it was built](../README.md#7-how-it-was-built).

## 2026-11-15: Foundation

*`main`, commits 11:56 to 12:43, by the foundation agent.*

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

## 2026-11-15: feed installed and connected (orchestrator)

- `Feed.gs` was added as a second file to the sheet's existing Apps Script project (the one that holds
  the Pinnacle puller) through the owner's browser; `Code.gs` was not touched. The file was loaded from
  this repository at a pinned commit and its SHA-256 was compared in the page before saving.
- The scope annotation ("only current doc") was removed before installing. The project was authorised
  with the full spreadsheet scope by the Pinnacle script, whose time trigger runs every 15 minutes;
  an annotation in a new file would have changed the scopes of the whole project and could have stopped
  that trigger until someone re-authorised it. The run that followed the change completed normally.
- `btFeedSelfTest` on the real sheet: all whitelisted headers found, a handful of redactions, no money
  marker left. Deployed as a web app (execute as the owner, anyone can access) and its URL set in
  `src/config.js`.
- First check of the live feed, done in the browser from the app's own origin: no currency code, no
  dollar amount, no number with two or more thousand groups.
- Bug found by that check: the final self-check treated any dollar sign as money and replaced a whole
  `Decisiones` evidence cell that only quotes a `$(…)` template placeholder. The leftover check now
  needs a number next to the sign. Unit test added.
- The e2e test for "feed not configured" was replaced by two tests that intercept the script URL (live
  feed shown without the example banner; unreachable feed with no cache shows the retry state). Tests
  never call the real script.

## 2026-11-15: Overview (`#/`, Resumen)

*`feat/overview`, merged 14:00. Written by the section agent; folded in here unchanged except for headings.*

### What was built

- **Period switch** (Todo, 30 días, 7 días, Última jornada) at the top. It applies to every figure on the
  screen (source cards, tag and market tables, real bets) and lives in the URL as the filters' own `date`
  key (`#/?date=7d`), so the quick links and every row link carry the same window to the Explorer,
  the Simulator and Tests. A line under the switch says which dates the period covers.
- **En pocas palabras**: written summary of the last graded slate, what is pending from today, the best
  and worst Sombra tag against the close (with n), and, per source, the gap between results and price
  quality when they disagree ("gana en resultados pero pierde contra el cierre: probablemente suerte").
- **Source cards** (Apuestas, Sombra, Grok; test ids `source-*` kept): record scoreboard, units, yield
  with n, hit rate against break-even with n, mean fair-close EV with its ±2 SE range and n, pending,
  the verdict word, a cumulative sparkline, and a paragraph (`describeSource`) that says how big the sample
  is and what it can and cannot say.
- **Sombra por etiqueta**: one row per tag with graded picks: n, record, yield, a range bar of the
  fair-close EV (±2 SE on a shared axis with the zero line, mean as a dot), the EV with its n, and the
  verdict word. Each row is a link to the Explorer (`src=shadow&tag=…` plus the period) and has a full
  accessible name with every figure. **Sombra por mercado**: the same, smaller, by market family.
- **Hoy y pendientes**: pending picks dated today or later, grouped by slate date, counts per source,
  the first six picks of each slate and a link to the Explorer (`st=pending&slate=…`). Pending picks of
  earlier days that the sheet still has ungraded are counted in one line.
- **Desde tu última visita**: shown only when something was graded or added since the previous visit:
  record and units per source plus a sentence.
- **Apuestas reales**: units per day with the sheet's own Ganancia (u) (line chart with drawdown shading
  and a table toggle), distance below the peak now and the worst drop (also as % of the bankroll only
  when the user set one in Settings), average stake with n, best and worst day.
- **Quick links**: Ver todos los picks, Simular, Tests, each with the current period.

### Data and decisions

- New module `src/data/overview.js` (pure, unit tested): `periodFromQuery`, `periodFilter`,
  `picksInPeriod` (runs `applyFilters`, the Explorer's own code), `lastGradedSlate`, `closeVerdict`,
  `VERDICT_MIN_N`, `rankRows`, `shadowTagRows`, `shadowMarketRows`, `bestWorst`, `rangeAxis`, `axisPct`,
  `sourceSummary`, `cumulativeUnits`, `dailyUnits`, `realBetsExtras`, `slateReport`, `upcomingPending`,
  `overduePending`, `visitSnapshot`, `sinceLastVisit`, `dateIn`. Rates and means still come from
  `stats.js` (`summarize`, `drawdown`, `mean`).
- **Verdict rule** (`closeVerdict`): no two-sided closes → "sin cierres"; fewer than 20 → "muy pronto";
  whole ±2 SE range above zero → "por encima del cierre"; whole range below → "por debajo del cierre";
  otherwise "tirando a favor" / "tirando en contra" by the sign of the mean. 20 is lower than the frozen
  tests' 50-row gate on purpose: it is a reading aid, not a decision; the Tests section keeps the 50.
- **Ranking**: groups with a verdict by mean fair-close EV, then "muy pronto" groups by n, then groups
  without closes.
- **Última jornada** means the latest slate with a graded pick, not the newest date in the sheet (that is
  usually today's slate, all pending). It is passed on as an explicit `slate=YYYY-MM-DD`, so the Explorer
  shows the same picks.
- **Since the last visit**: the sheet keeps no grading time, so on each visit the screen stores a small
  snapshot in this browser (`localStorage` `bt.overview.visit`: the visit instant, the uids pending then and
  the last row per source). The next visit reports picks that were pending (or added) then and are graded
  now, and how many rows were added. Without a matching snapshot (a `lastVisit` set elsewhere, or the first
  visit after this update) it falls back to graded picks dated from the visit's day in Bogotá and says so in
  the sentence. `settings.lastVisit` and the snapshot are written after the screen has been visible for
  1.5 s (and again when a newer dataset is shown), never on every render. The previous visit is read once
  per app session, so browsing away and back keeps the same card until the app is reopened.
- **Today and pending** do not follow the period switch: they are about today by definition.
- Average stake counts graded and pending real bets (what was actually staked); the drawdown % uses the
  same denominator as `stats.drawdown` (bankroll + peak).
- Sentences: `describeSampleSize` says what a sample of n can say (<30, <100, more) and never promises a
  result; `describeResultsVsClose` speaks only when the close has a verdict (n ≥ 20).

### Problems and fixes

- The fixture has under 20 closes for every tag, so every tag reads "muy pronto"; the markets table shows
  the other verdicts. The rule is unit tested on synthetic picks for every branch.
- E2E fixes "today" with `page.clock.setFixedTime` (2026-11-15, the fixture's last day) so the period and
  pending tests do not depend on the run date.

## 2026-11-15: Explorer and the shared filter panel

*`feat/explorer`, merged 14:09. Written by the section agent; folded in here unchanged except for headings.*

**What was built.** The Explorer section (`#/explorer`, `#/explorer/:uid`) and the filter panel that the
Simulator and Analysis will reuse (`src/lib/ui/filter-panel.js`: `FilterPanel`, `ActiveFilters`,
`FilterButton`, `SavedFilters`, `useMediaQuery`). The Explorer has a summary strip for the current filter
(record, flat yield at 1u, units, hit rate against break-even, fair-close EV with its ±2 SE range and n,
pending, one sentence from `summaries.describe`, a cumulative sparkline and "Simular estos picks"), a
search box, sort (menu plus direction on phones, column headers on the table), paging, removable chips
of the active filters, cards on phones and a sortable table from 960 px, and a pick detail with
everything the sheet and the parsed notes say (sheet row, tag meaning and glossary link, every book's
price and close with the other side, CLV and fair-close EV with one-line explanations, model / blend /
fair / AI probabilities, reference, sample, FUERZA, Pinnacle 1X2 open → last, raw notes) with previous /
next inside the current filtered and sorted list.

**Decisions and why.**

- *Everything in the hash query.* Filters use the keys of `filters.js`; the Explorer adds `sort`, `dir`
  and `page` (only when not the default). A view is a bookmark; reload keeps it; the detail URL carries
  the same query, so closing it and previous / next stay inside the same list. "Simular estos picks"
  passes only the filter part to `#/simulator`.
- *Facet counts under the other filters.* Each option shows how many picks it would give if the other
  filters stayed as they are (the usual faceted-search rule), computed by `facetCounts` with
  `applyFilters` itself so the panel and the list can never disagree. Text, EV and probability are applied
  once up front; the last slate is always taken from all picks. Options at 0 are disabled (short lists) or
  hidden (leagues, raw markets) unless selected.
- *Side column at 1200 px, table at 960 px.* At 1280 px the content box is about 1000 px; a 248 px
  column leaves the table about 750 px, which fits the ten columns only with market and selection stacked
  in one column (two sort buttons in its header) and short dates (`15 nov`, full date in the tooltip).
  Between 960 and 1200 px the table is full width and the panel opens as a dialog.
- *The detail is a route.* The shell remounts the screen and scrolls to the top on every path change,
  so the Explorer remembers the scroll position and the opened pick in a module variable and puts both
  back when the detail closes (focus returns to the pick's card or row). Previous / next replace the
  history entry, so Back always returns to the list; a deep link falls back to the list (`goBack`).
- *Saved filters and starting points* sit in the panel (a disclosure above the sections) so any screen
  that drops in `SavedFilters` gets them. Built-ins only fill the panel; tapping the active one clears it.
- *Tag groups* (price-first tests, model tests, published, rejects and watch, real bets, Grok) are data
  (`TAG_GROUPS` in `tags.js`, with a test that every tag is in exactly one group).
- *Sorting is data* (`explore.js`): nulls always last, ties in chronological order, text folded for
  accents and case.

**Problems and fixes.**

- 19 px of horizontal scroll on a 390 px phone: implicit grid columns sized to the min-content of the
  toolbar. Fixed with `grid-template-columns: minmax(0, 1fr)` on the layout and the main column.
- The fixture had no pick whose `pin id` matched a Pinnacle row (ids were random). The generator now
  appends one Pinnacle row with the pin id of the last Sombra row that notes one, after the loop and
  without drawing random numbers, so nothing else in the fixture changed (Pinnacle rows 12 → 13).
- The table cut tag labels mid-word with `overflow-wrap: anywhere`; tags now wrap between words only.

**Not verified.** Real-volume behaviour was only reasoned about (paging 50 per page, memoised list,
summary and facet counts; about 30 passes of `applyFilters` per filter change), not measured on the live
feed. Screen readers were not tried; roles, labels and focus order were checked in the tests.

## 2026-11-15: Tests section

*`feat/tests`, merged 14:14 (after one revision). Written by the section agent; folded in here unchanged except for headings.*

### What was built

`#/tests` replaces the foundation stub, top to bottom:

1. **Overview strip**: tests collecting rows, tests that reached their decision count (100 graded and 50
   with a two-sided close), and the closest one to its decision (the smaller of graded / 100 and
   closes / 50, linked to its card).
2. **How to read this** (collapsed): price against the close instead of results, 2 standard errors in one
   sentence, why a test is decided once, what the bars and the strip show. Terms link to
   `#/glossary/fair-close-ev` and `#/glossary/standard-error`.
3. **Next Sombra review** (Decisiones row 112): the rule, days since the last "Revisión Sombra N filas" out
   of 14 and rows graded since it out of 150 (two meters), "Toca ya" when both are met, the due date and
   what is left. Below it, every Decisiones row whose topic starts with "Revisión Sombra", newest first,
   linked to `#/decisions/<row>`.
4. **Frozen tests** (row 111), one card each: sheet label, one plain sentence, start date (or the first
   row), pending count, graded out of 100 and two-sided closes out of 50 (with own book / feed split),
   mean price-vs-close EV with n, ±2 SE interval drawn against zero (SVG with an accessible sentence),
   z, the state and the rule in words, flat record / yield / hit rate marked "Contexto, no decide", the
   projected decision date at the recent pace, and links to the Explorer and the defining decision row.
   The container keeps `data-testid="frozen-table"`.
5. **Price-first tests**: VALOR (rows 79, 80, 108), VALOR CASI (context), VALOR PROP (row 97), VALOR PROP
   CASI (context). Each with its own rule text, progress toward its own count, its measure and interval,
   context figures, a disclosure with the price-band lines and the split by the price's book, and links.
6. **Stopped categories**: IA-WATCH corners and cards, team-corner rejects, team shots, corner/card and
   shots fillers, MODELO SOLO under 1.70: when and why they stopped, final record, yield, EV against the
   close (with n), date span, Explorer and decision links.

### Data additions (`src/data/tests-config.js`, additive)

- Frozen tests gained `decisionRow` and `explorer` (the closest Explorer filter; documented on screen as
  an approximation, because memberships such as "passed every filter" or "side = under" have no filter).
- `Z_EPS`: "z of 2 or more" now tolerates floating-point error, so a mean exactly 2 SE above zero passes
  (unit-tested). This is the only change to an existing function.
- `projectDate`, `frozenProjection` (pace = graded rows by match date over the last 14 days, or since the
  test's start when it is younger; the decision date is the later of the 100-graded and 50-closes dates),
  `decisionShare`, `waitingFor`, `testsOverview`, `shadowReviewHistory`, `shadowReviewParts`.
- `PRICE_FIRST_TESTS`, `VALUE_RULE`, `PROP_RULE`, `propCloseEv` (F × power-de-vigged bet365 close − 1,
  review.py's `vprop_measure`, reusing `powerProb` from `notes.js`), `priceFirstProgress`.
- `STOPPED_CATEGORIES`, `stoppedSummary`.
- Unit tests: `tests/unit/tests-section.test.mjs` (16 tests: projection, 0 rows, 99/100, 100 graded with
  49 closes, exactly on and just under the 2 SE boundary, overview, history, review parts, VALOR cases a,
  a with ≤3.0, b, b waiting, c, Pinnacle count, VALOR PROP 60 / 120 / clear / stop / extended, stopped
  memberships).

### Decisions and why

- **The frozen-test port matches review.py.** Checked line by line: memberships, graded = a price and a
  settled status, `pvc` (own-book close first, else the feed), clustered SE by date + match, z = mean / SE,
  ready at 100 graded and 50 with a close. No mismatch found apart from the z boundary tolerance.
- **VALOR is measured on `openingFairEv`** (review.py's `fev1`, milestone-reviewer's fair-close EV), not on
  `fairCloseEv` (the frozen tests' price-vs-close EV): the gate of rows 79/80 is "mean fair-close EV above
  zero over 30+ rows", which is the block's `fev1`.
- **VALOR PROP decision uses a 95% interval** (1.96 × clustered SE) as row 97 asks; review.py prints the same
  interval. Row 97 mentions a bootstrap by match; neither review.py nor the app runs one. Flat yield for
  "CLARA" is the yield of all graded VALOR PROP rows.
- **VALOR PROP rows are not date-filtered**, like review.py, although row 97 says "dated 7 Nov or later";
  the category started on 6 Nov, so the two can only differ if a row is dated before 7 Nov.
- **Pinnacle (row 108)**: the app counts graded VALOR and VALOR CASI rows that carry a Pinnacle id (what
  review.py prints); the join with Pinnacle's close is left to the review and said so on screen.
- **Stopped categories show live final numbers, never figures copied from reviews**: no real data in the
  repo. Fillers are limited to rows dated up to the stop date, so later (b)-type rejects are not mixed in.
- Glossary and decision links are plain hashes (`#/glossary/<slug>`, `#/decisions/<row>`); the Glossary
  branch is adding `glossaryHref`/`tagSlug` helpers, which can replace the two local ones in
  `tests-parts.js` after the merge.
- z, pace and per-slate figures are formatted with a dot (`formatNumber(…, 'en')`) to match prices and
  percentages, which the app always writes with a dot.

### Problems and fixes

- Phone horizontal scroll from a long meter text (`nowrap`) and from tables in a grid child without
  `min-width: 0`: the meter head wraps and disclosure children shrink; tables scroll inside their box.
- The first interval strip used `preserveAspectRatio="none"`, which squashed the mean dot into an ellipse;
  it now positions everything in % of the width.
- The e2e fixes the browser clock (`page.clock.setFixedTime`) so the review countdown is stable.

### Revision after review: compact list (15 Nov 2026)

The first version was about 25,500 px tall on a phone (one 1.5-screen card per test). Now:

- Under the strip and the review card, **one list of all twelve tests** (frozen first, then price-first):
  label, state chip, graded "16/100" with a thin bar, two-sided closes "11/50" (price-first: rows with the
  measure out of the rule's count, 30 for VALOR, 60/120 for VALOR PROP; context tests show plain counts),
  EV against the close with n and a small interval mark. On a phone each row is two lines; from 720 px it
  is one line under a column header.
- **Accordion**: a row is a button (`aria-expanded`, `aria-controls`, Enter/Space) that expands the full
  content in place; one open at a time. The open test lives in the query (`#/tests?open=<id>`), so the
  strip's "la más cerca de decidir", other sections and reloads open the right one; other query
  parameters (Overview's `date=`) are kept and unknown ids are ignored. A query is used rather than a
  path because the shell remounts and scrolls to the top on a path change.
- Review card: meters, due chip and the due line stay visible; the rule sentence and past reviews are
  behind a disclosure. Stopped categories sit behind one disclosure, each a summary row with when and
  the final numbers, details on tap. "How to read" moved below the list and now carries the frozen and
  price-first intros.
- Height at 390 px, fixture, collapsed: about 2,400 px (was about 25,500).

## 2026-11-15: Decisions and Glossary

*`feat/knowledge`, merged 14:24. Written by the section agent; folded in here unchanged except for headings.*

### What was built

- **Decisions** (`#/decisions`, `#/decisions/<row>`): the Decisiones tab as a timeline, newest first and
  grouped by month, 25 per page. Each decision shows its sheet row, date, status chip (the sheet's word,
  an icon and a border style per state: solid, dashed, dotted, struck through), theme, topic and decision.
  Evidence and "Cómo y cuándo se revisa" open on demand and are only rendered while open (the real evidence
  texts run to thousands of characters each). Search covers every column, the date and the row number,
  is accent-insensitive, highlights the matches and opens the evidence or review when the match is there.
  Filters by status, theme and date range; all of it in the URL (`q`, `st`, `th`, `from`, `to`, `view`,
  `page`). A count card with the totals per status, and an "En vigor" view (Vigente and Provisional only)
  grouped by theme. One page per decision with "Cita" / "La citan" (the citation graph) and the rules it
  mentions. The staking rules of the Reglas tab as their own block, each linked to its glossary entry.
- **Glossary** (`#/glossary`, `#/glossary/<slug>`): 143 entries in nine categories (basics, markets, the
  system, every sheet tag, note abbreviations, filters and reasons, statuses, review measures, sources),
  each with a short definition, "En esta hoja", a worked example where it helps (prices, probabilities,
  units) and related links. Search as you type (term, aliases, definitions; accent- and case-insensitive,
  ranked), category chips, A–Z jump bar, deep links. Tag entries show how many rows carry the tag and link
  to the Explorer filtered by it.
- **The 36 betting-analyst rules in plain words** (`#/glossary/rule-N`, the "Reglas" tab of the glossary):
  title, what it says, why it exists (when the skill gives a lesson), state (in force, provisional,
  paused, stopped, replaced) and since when, the terms it uses and the Decisiones rows that back it.
- Content is in `src/content/{glossary,rules}.{es,en}.json`, loaded once per locale by
  `src/data/content.js`. The deploy's precache list is generated from every file under `src/`
  (`scripts/build-site.mjs`), so the content files are already in the service worker shell: a unit test
  builds the site and checks they are in `sw.js`. `sw.js` itself needed no edit.
- Shared helpers: `src/lib/glossary-links.js` (`glossaryHref`, `tagSlug`, `ruleSlug`, `decisionHref`,
  `sheetRuleSlug`), `<Term>` and `<RefText>` in the UI kit, documented in FEATURE_GUIDE section 10.

### Decisions and why

- **Themes are derived, not stored.** `decisionTheme()` folds the topic (lower case, no accents) and takes
  the first theme whose pattern matches, in a fixed order (reviews, grok, staking, filters, measures,
  data, shadow, model, workflow); if the topic matches nothing the decision text is tried, else workflow.
  The order puts specific themes first so "Revisión Sombra 300 filas" is a review and "Regla 24 (filtro 5)"
  a filter. Spot-checked on about 30 of the real topics (read only, nothing copied); unit tests use
  synthetic topics. A few real topics will land in a debatable theme; the rule is easy to tune.
- **Cross-references are tokens, not HTML.** `tokenizeRefs()` finds "Decisiones row N", "fila(s) N",
  "row(s) N" with ranges and lists ("filas 84-85, 93 y 97") and "regla(s)/rule(s) N" (with letters,
  "rule 34e"). A group is linked number by number and only when every number is a known decision row
  (or rule 1–36): the sheet also cites rows of Sombra and Grok ("filas 2-515", "fila 646", "filas 125,
  127 de Grok"), and the real Decisiones has rows 2–125, so an unknown number keeps the whole group plain.
  Another tab named just before or after ("Sombra fila 12", "fila 17 de Apuestas") also keeps it plain;
  "Reglas rule 4" (the sheet's own Reglas tab) is never a skill rule.
- **Rule states.** The brief lists in force, provisional, paused and replaced; rule 31 (AI watch) is
  neither paused nor replaced but stopped, so a fifth state "stopped" was added. Rules 1, 2, 19–21 and 23
  are replaced by rule 29 only for results and goals, so they stay "in force" with a state note; rule 23 is
  "provisional" (the skill says so) and dormant; rule 30 is "paused" (real money paused). "Since" is the
  date the skill gives (or the date of the backing decision); rules the skill gives no date say so.
- **Numbers in the rules are quoted from the skill**; amounts of money are left out (rule 4 says "contra
  el bank del momento", never a figure). The content gate test fails on `$`, COP, pesos and grouped
  thousands.
- **Tag entries keep the sheet label as the term in both languages** (VALOR CASI, SHADOW (regla 30)…),
  because that is what Juan reads in the sheet; the test checks it against `tagLabel()`.
- **The staking rules (Reglas tab) have their own numbering**, different from the skill's rules. Each
  line links to the entry that explains it through a small keyword map (`sheetRuleSlug`), falling back to
  the "Reglas (pestaña)" entry. The real lines were not read (the brief forbids reading Reglas), so the map
  was written from the fixture's lines and the skill's description; an unknown line still gets a link.
- The Glossary does not wait for the feed: content is static, so it works offline and before the first
  sync. The feed only adds tag counts and decision topics when it is loaded.

### Problems and fixes

- The foundation's shell test expected the glossary deep link to print the raw slug; it now checks the
  entry's term ("VALOR CASI").
- An evidence disclosure did not open when a search started matching inside it (its open state was set
  on mount); it is now keyed on whether the search matches, so a new match remounts it open.
- On phones the nine category chips and the A–Z bar took most of the first screen; both are now one
  line that scrolls sideways inside itself (the page never scrolls sideways).
- The contract's note table puts values in brackets (`ref` (`feed` / `books` …)); the gate test strips
  bracketed text before collecting field names.

## 2026-11-15: Simulator

*`feat/simulator`, merged 14:30. Written by the section agent; folded in here unchanged except for headings.*

**What was built.** The Simulator section (`#/simulator`) replaces the stub: the shared filter panel
picks the bets (same query string and saved filters as the Explorer; opened with no query it shows
Sombra, every tag), a staking plan sits next to the filters in the URL (flat units with quick chips,
% of the bankroll compounding, "as staked", fractional Kelly with fraction and cap), and the headline
says what the plan would have made ("Si hubieras apostado 1u en cada uno: +5.42u", money only with the
user's unit value), with the record, yield, picks, average price, the chance range (± 2 SE of the summed
profit), one sentence against the close and the cumulative curve with the drawdown shaded and the
expected-by-close line. Collapsed blocks: drops and streaks (max drawdown in units and % of the starting
bankroll, streaks, best and worst day, time under water), what the price says, month by month, the
breakdown by tag / market / price band (rows link to the Explorer with that slice), pending picks and
units at stake, scenario B, and saved scenarios.

**Decisions and why.**

- *Engine in `src/data/simulate.js`, extended in place.* `simulate()` keeps its signature and output
  (the Explorer's sparkline uses it) and gains fields. Percent stakes now use the bankroll at the start of
  the pick's day; the old per-pick compounding only differed for same-day picks, and the brief asks for
  day-start staking.
- *Fair probability for Kelly*: the blend (for VALOR rows the consensus fair probability), else
  1 / Cuota justa, else the model probability. Picks without any are left out (counted); picks without
  an edge get stake 0 and are not placed (counted, left out of the record and streaks).
- *As staked*: Apuestas use the sheet's stake and its own Ganancia (u) (free bets and odd settlements);
  Grok uses his suggested stake with the flat formula; Sombra has no stake and is left out (counted).
- *Expected by the close*: Σ stake × fair-close EV over picks with a two-sided close; the SE is n × the
  match-clustered SE of the per-pick values (milestone-reviewer's clustering). The sentence compares it
  with the profit on the same picks, not the whole set, so both sides cover the same bets. The line is
  drawn only when at least half the replayed picks have such a close (picks without one add 0 to it).
- *Chance range* uses the plain SE of per-pick profit (review.py's plain_se, as the yield SE does).
- *Time under water*: the longest stretch below a previous peak (the start, 0, is the first peak), in
  calendar days from the peak's date to the recovery date (or the last date, "and still going").
- *URL*: staking keys `mode`, `stake`, `pct`, `bank`, `kf`, `kcap` (only the ones the mode uses, plus
  `bank`, and only when not the default); defaults come from Settings (`defaultStake`, the bankroll in
  units, else 100). Scenario B is one key, `b`, holding its own query string, so the filter code is
  reused as is and a comparison is a bookmark.
- *Saved scenarios* reuse the saved-filter storage; the stored query writes every staking option
  explicitly so a saved scenario does not change when Settings change. Plain saved filters appear too
  (applied with the current defaults) and can be used as B.
- *Two lines on one chart*: a new `MultiLineChart` in `src/lib/charts` (appended), lines told apart by
  colour and dash style with a legend. The A/B chart puts both on the union of their days, each carried
  forward.
- *Phone height*: setup, headline and curve first; seven collapsed blocks whose summary already says
  the key figure. Default page at 390 px is about 2,050 px tall.

**Problems and fixes.**

- The breakdown rows first put the record next to the name; reordered so name/profit and
  record/yield form two lines.
- The comparison and month tables scrolled sideways at 390 px; narrower padding, the month table drops
  the staked column (yield carries it with its n), and the comparison labels wrap.

**Not verified.** Real-volume speed (about 710 Sombra rows) was reasoned about, not measured: one
`applyFilters` + `simulate` per scenario, memoised on the query; the per-pick curve has one point per
pick. Screen readers not tried.

## 2026-11-15: Analysis section

*`feat/analysis`, merged 14:39. Written by the orchestrator from the agent's hand-off (see the note at the end).*

**What was built.** The Analysis section (`#/analysis`, `#/analysis/:part`) replaces the stub: four parts,
one visible at a time, switched by a row of links (the part is in the path: breakdown, calibration, close,
grok), with the shared filter panel applying to all of them (side column from 1200 px, bottom sheet below).
Breakdown: 15 dimensions; per group n, record, hit rate vs break-even, yield ±2 SE, units, fair-close EV
±2 SE with n and the verdict word; range chart of the chosen measure; minimum-n slider (grey or hide);
sort in the URL; compact rows on phones, a table from 720 px; links to the Explorer with the slice added;
optional two-way table. Calibration: model, blend, consensus (price-first rows), Sofascore AI; Brier per
series and the market's on the same picks; a sentence each; CalibrationChart with n per dot. Close:
fair-close EV histogram, mean, range, share above zero, verdict; raw CLV as context; split by close source;
closing moves per market family; Pinnacle 1X2 direction. Grok vs Claude: written comparison, Grok by our
verdict with reasons, team corners vs Sombra's CÓRNERS EQUIPO, Grok by market.

**Decisions and why.**
- Part in the path, everything else in the query; view keys kept across parts. `#/analysis` stays bare
  while filters change, because a path change remounts the screen (it closed the filter sheet).
- Bands are [lo, hi); band links use the inclusive filter ranges with hi − 0.0001 (the sheet logs at most
  4 decimals), tested on every fixture band.
- Weekday has no link (no weekday filter; adding one would change the shared filter state).
- Market probability for Brier = (1 + fairCloseEv) / price; both scores on the same picks.
- The blend column on price-first rows is the consensus fair probability: its own series.
- Close source split = closeSource (own book vs bet365 feed), as review.py reports it.
- Closing moves use raw CLV at the same source only.
- Pinnacle: proportional de-vig of the pick's outcome (1X2, double chance, DNB) at open and last read; under
  half a point = no move; team names from the pick's own match; half-time markets not joined.
- Grok verdict classifier: kind from the start of the text, reason from after the arrow (priced) or the
  colon (not priced). Fixture shapes plus the skill's shapes unit-tested; no fixture rows added (would
  change the other sections' e2e counts).
- The Grok part ignores the source and tag filters (banner when set).
- Sentences in `src/features/analysis/text.js` only format figures from `src/data/`, always with n, and end
  with a sample-size caution.

**Shared changes (additive).** charts: RangeChart, Histogram, CalibrationChart `showN`; components.css:
their styles at the end; format.js: `formatScore`; tests/e2e/helpers.js: three ROUTES appended.

**Problems and fixes.** Part links overflowed at 390 px (shortened labels). The group table overflowed at
1280 px next to the side panel: record under n, verdict under the label, EV range under the mean; labels
wrap only between words. Calibration n labels overlapped: collision skip.

(Written by the orchestrator from the agent's hand-off: the agent could not create this file itself.)

## 2026-11-15: Line and side filter

*`feat/lines`, merged 14:50. Written by the section agent; folded in here unchanged except for headings.*

Juan asked to filter by specific lines ("TARJETAS UNDER 4.5, tarjetas under 5.5, etc… same for all other
tags where possible").

### What was built

- `src/data/lines.js`: `parseLine(marketRaw, selection, family)` → `{ line, lineKey }`; `lineKey` is
  `<scope>:<over|under>:<value>` or `ah:<signed>`. Labels through `t()`, ordering, `lineAddsInfo`,
  `groupByLine`. `normalize.js` adds `line` and `lineKey` to every pick (combos forced to null).
- Filter state: `sides`, `lines`, `passedAll` with URL keys `side`, `line`, `pass`; `applyFilters`,
  `filterOptions`, `facetCounts` (also `passedAll: {yes, no}`), `activeEntries` / `removeEntry`,
  `countActive` all know them. Three built-in presets (Tarjetas Under 4.5 / 5.5, Córners totales Under 9.5).
- Filter panel: "Línea" section after Market, open by default (so TARJETAS UNDER + Under 4.5 is two taps
  on the phone sheet), side chips, line chips with counts under the other filters, grouped by kind of
  market when several. "Pasó todos los filtros" tri-state in the Reason section.
- Pick card and detail sheet show the line label only when the selection does not already say it (in the
  real data that is practically never; the Explorer table has no new column).
- Simulator breakdown: "Línea" option; rows in line order, scoped labels when kinds mix.
- Overview tag table: under each tag with two or more lines, a collapsed "Por línea · N líneas" list (n,
  record, yield, EV vs close with n, verdict), each row linking to the Explorer with tag + line.
- Tests section: `explorer` filters tightened with `MODEL_SHADOW_TAGS`, `sides`, `lines`, `passedAll`
  and the hidden `lt170` preset; each test and stopped category has `explorerExact`; only the
  CÓRNERS EQUIPO test (an OR of "passed every filter" and a date) stays approximate, and only its card
  shows the note now.
- Price bands: `priceBand(1.70)` is now `170_200` (it was `le170`, while the `170_200` preset also took
  1.70, so a row's link could show more picks than the row). The low band is `lt170` (< 1.70), linked
  through a hidden preset. Every breakdown row link (tag, market, price, line) goes through `exactSlice`.

### Decisions

- **Scope in the lineKey.** The brief's examples were `under:4.5`; with the scope ("cards", "corners_team"…)
  a chip "Under 4.5" under Tarjetas does not also select team-corner Under 4.5 picks. Chips stay short
  ("Under 4.5") and add the scope only when chosen lines mix kinds.
- **`side` unchanged.** It is review.py's side() and the frozen tests use it; the `sides` filter matches it,
  which makes the TARJETAS UNDER test links exact. Handicaps are told apart by the `ah` kind of the key.
- **Doble oportunidad "+0.5"** is not a line (it is a result market written as a handicap), nor is
  "pago anticipado si va +2".
- **Exact links**: graded statuses are added to breakdown links because the row counts only graded picks;
  PUBLICADA Y APOSTADA and unpriced rows are excluded only when present, to keep links short. In the
  staked and Kelly modes the Simulator also skips rows without stake / probability; those cannot be
  expressed as filters, so the link can show more picks there.
- `lt170` is hidden from the chips so Juan's presets (≤ 1.70, < 2.00, ≤ 2.00, ≤ 2.50…) keep their meaning
  and the price section does not grow.
- No fixture change: every shape the e2e needs already exists, and adding rows would move counts other
  sections assert. The rarer shapes are unit-tested with synthetic copies.

### Real sheet check

Read only `Sombra!D:E`, `Grok!E:F`, `Apuestas!F:G`. Every totals / team-totals / handicap selection has
one of the parsed shapes (inspected shape by shape, not run row by row through the parser), so 0 expected
lines were missed. Shapes without a line: 1X2 and halves, DNB, doble oportunidad, BTTS, correct score,
first scorer, Más córners / Córners 1X2 / Tarjetas 1X2 / Más tarjetas, the two Apuestas combos.

### Problems and fixes

- JSON string files are edited by appending new namespaces (`lines.*`) instead of touching existing
  one-line objects; built-in presets got an optional `labelKey` for that reason.
- The "Por línea" summary doubled the height of the Overview tag table on phones; pulled it up under the
  row (negative top margin) while keeping a 44 px target.

## 2026-11-15: Independent audit

*`feat/audit`, merged 15:20. Written by the section agent; folded in here unchanged except for headings.*

Scope: privacy (no money leaves the sheet), whether the app's numbers match `review.py` and an independent
recomputation on the real sheet, and behaviour that the section agents could not check. Real rows were read
read-only (the allowed ranges only) into `/tmp/audit/`, never into the repository. No real row, amount or
figure from the sheet is in this file, the tests or the commits.

### What changed

- **`apps-script/Feed.gs` (needs a redeploy in the sheet).** The scrubber missed many money shapes
  (millions in words, `7M`-style suffixes, `mil` without a currency, spaced thousands, other currencies,
  `COP:` separators, numbers followed by `$`, money-sized numbers after money words such as `freebet`,
  `bank`, `unidad`, `1u =`, bare five-digit integers). Numeric cells had no plausibility bound, so a
  money figure typed in a units or price column went through as a number, and a number in a text column
  was never scrubbed. A whitelisted header that appeared twice was read from its first copy. All fixed,
  each with a synthetic test; `docs/DATA_CONTRACT.md` section 2 lists the rules.
- **`src/data/tags.js`, `src/data/analysis.js`.** Four real October Grok rows have verdict shapes the
  classifiers did not know (`Mercado primero (regla 29)…`, `Marcador exacto no cotizado; …`): they were
  `grok_other` / kind `none`. Now priced by rule 29 and not priced. A `→ valor -x%` outcome is no value.
- Tests: `tests/unit/audit-feed.test.mjs`, `tests/unit/audit-simulate.test.mjs`,
  `tests/unit/audit-grok.test.mjs`, `tests/e2e/audit.spec.js`; new keys `auditTexts`, `auditSafe` at the
  end of `tests/fixtures/privacy-money.json`.

### How the real data was checked

1. Sheets API display values per chunk of at most 150 rows, saved under `/tmp/audit/raw/`. Display strings
   were converted the way `getValues()` would type them (numbers, percentages as fractions, ISO date
   strings kept as text, which `btFeedCell` treats like a `Date`). Where this can hide a difference: the
   live script gets full-precision numbers (a percentage shown with two decimals, a price shown rounded)
   and real `Date` objects for dates and Grok times; `Reglas` was read from row 8 only (the range allowed then; later reads start at row 10, below rule 1), so the header
   search could not be tested against a "Reglas" cell above it.
2. `btFeedBuild` from the worktree's `Feed.gs`, loaded in `node:vm` exactly like `tests/unit/feed-gs.test.mjs`.
3. The app's `normalizeFeed` and the data modules on that feed; `review.py` extracted from the
   `betting-review` skill with the milestone-reviewer hash check and run on the same Sombra rows; a short
   independent Python recomputation from the raw rows.
4. Filters: 101 combinations against an independent selection, URL round trip, boundary prices.
5. Behaviour: missing headers, an empty feed, 5,000 picks, 390/1280 px × light/dark × es/en on every route,
   and every route offline on the built site with the service worker on (`node scripts/build-site.mjs
   <dir>`, serve it on the e2e port, open with `?feed=fixture&sw=on`, `context.setOffline(true)`); the
   offline check is not part of `npm run check` because it needs the built site.

### Decisions

- The extra scrubbing hides a little more than strictly needed (a third-party subscription price in one
  decision). Hiding too much is the safe side; counts of things (`60 mil caracteres`, `36k tokens`),
  prices with three decimals, ids written `id 12345678` and coefficients near the word `unidad` stay.
- Bounds per numeric kind instead of per column: simple, and no real value is near them.
- Synthetic examples use figures that do not coincide with any real amount.

## 2026-11-15: Integration and polish pass

*`feat/polish`, merged 15:33. Written by the section agent; folded in here unchanged except for headings.*

### What was done

1. **One source for glossary links.** `tagSlug` lives only in `src/lib/glossary-links.js` (`tags.js` and
   the Tests section re-export it); `tagHref`, `REASON_SLUGS`, `MARKET_SLUGS` added. Tag badges link from
   the Explorer table and pick detail; filter-reason chips in the pick detail link to their entries; the
   Overview tag and market tables, the Analysis breakdown (tags, markets, reasons) and the Simulator
   breakdown get a line of glossary links (`TagGlossaryLinks`) because their rows already link to the
   Explorer. Tests cards link their tag and decisions. A unit test collects every slug in `src/` and the
   maps and checks both languages; nothing was missing.
2. **Shared pieces.** `VerdictChip` (Overview, Analysis) in the UI kit; `explorerHref` (three copies) and
   `SIDE_PANEL_QUERY` (three copies) in `src/lib/links.js`; `signClass` (three copies) in `format.js`.
3. **Rules in plain words.** A one-sentence `short` for all 36 rules, es and en, shown first on the rule
   page ("En corto: …") and in the rules list. Inline term links (`buildTermIndex` / `linkTerms` in
   `content.js`, rendered by `RefText terms=…`) on rule and glossary pages and in the pick detail's tag
   meaning. `DecisionLink` shows "Decisiones fila N · <tema>" on Tests cards (the rule page already did).
4. **Wide screens.** Rail background painted on `.app` (full height); `table-sticky` (Explorer table,
   Analysis groups) keeps the header under the app header; tags in tables wrap only between words and
   the Explorer tag column has a minimum width; the filter panel's implicit grid columns took the
   min-content width of the search box and dates (that, not 248 px, cut "VALOR CASI"): one shrinkable
   column, dates stacked in the side column.
5. **Banners.** Missing columns only on Overview and Settings.
6. **Analysis links.** `rowPatch` + `exactRowFilter` / `exactCellFilter` (intersect with the current
   filters, then verify against the row's picks; no link when impossible); `line` dimension. Unit test
   compares link and row for every dimension under seven filter states. The Simulator's price rows use
   the same intersection.
7. **Labels.** "Peor caída" / "Worst drop"; jornada → slate, banca → bank (the sheet's words), tag
   groups "Pruebas de precio / del modelo"; English already consistent (slate, bankroll).
8. **Real-data fit** (read only: `Decisiones!B:B`, `Reglas!A8:A40`, the range the brief allowed then; nothing copied. Later reads start at row 10, below rule 1, which states the unit value). Themes: 16 of 123
   real topics reached the catch-all before; 0 now. Reglas: line 11 (calibration) had no entry, now
   `calibration`; mapping is by rule number plus keyword.
9. **Speed.** 5,000-pick test. Hotspot: `notes.js` rebuilt about 15 regular expressions per row; compiled
   once now (normalize about 360 → 110–250 ms for 5,000 picks on this machine). Other figures well
   under budget (filter change with all facets ≈ 40 ms, Overview ≈ 65 ms, Analysis ≈ 150 ms).
10. **Phones.** Glossary without a search: nine collapsed category groups (≈ 920 px instead of ≈ 16,000);
    definitions clamp to two lines in lists. Decisions: one disclosure per card for evidence and review,
    decision text clamped to four lines without a search, month jump buttons. Date fields read
    "Desde el día" / "Hasta el día" with a described hint and `lang`.
11. **PWA.** Offline e2e on the built site (every route, network cut); manifest shortcuts (Explorer,
    Simulator); Settings shows "Estado de la app" with a reload button when a new version waits.
12. **Docs.** ARCHITECTURE (routes, query keys, banners, offline, perf), DATA_CONTRACT section 8,
    FEATURE_GUIDE section 10 and the build-log location.

### Decisions

- Rows that link elsewhere get a separate line of glossary links rather than a nested link.
- The rules list shows the short sentence instead of the clamped long text (the page has both).
- Inline linking skips common words that are also aliases (cuota, valor, stake, over…); capitalised
  sheet words match only in capitals, so "valor" in a sentence never links to the VALOR tag.
- An Analysis row link is dropped rather than shown inexact; the Analysis e2e now expects the exact
  count (21 graded VALOR picks, not 22 with the pending one).
- The offline test serves the built site on E2E_PORT + 50 under `bt-offline.test` (Chrome host-resolver
  rule and an insecure-origin-as-secure flag), because the app keeps the service worker off on
  localhost.

### Problems and fixes

- Shared e2e expectations changed by the new links (two links in an Explorer row, "VALOR" linked twice
  on an entry page): scoped the locators.

## 2026-11-15: Docs pass (README, briefs, one log, last audit findings)

*`feat/docs`, by the docs agent.*

### What was done

- **Real sheet text out of the repo.** The unit tests (`tags.test.mjs`, and single strings in
  `feed-gs`, `decisions`, `notes` and `analysis-data` tests) and `scripts/make-fixture.mjs` held verbatim
  reason, verdict, note and staking-rule texts. Every long one was rewritten as invented text with the
  same tag prefixes and formats (different numbers, wording and order). The regenerated fixture
  normalizes to exactly the same picks (tag, filter reasons, parsed notes, every field but the free
  text; checked pick by pick against the previous fixture), so no test count changed. Git history keeps
  the old copies (no money, no match names in them); the README says so.
- **Price labels.** `PRICE_PRESETS` labels are built from the bounds by `priceRangeLabel`: `200_250` reads
  "> 2.00, ≤ 2.50" and `250_400` "> 2.50, ≤ 4.00" (they excluded their low end while the labels read
  like `1.70–2.00`, which includes both). The Simulator's own copy of the band labels was removed; it
  uses the presets. `tests/unit/docs-price-labels.test.mjs` derives each expected label from how
  `applyFilters` treats prices at and next to each bound.
- **Contract.** Deliberate differences from `review.py` (VALOR PROP rows in market breakdowns; a free
  bet's stake counted as staked in the real-bets yield), the example row counts (Pinnacle 24, not 240),
  the `Stake máx. (u)` note, and the Reglas range (row 10 from now on).
- **README** with the full story, **`docs/briefs/`** (the agent briefs with placeholders),
  **`docs/screenshots/`** (`npm run screenshots:readme`, `tests/e2e/readme-screenshots.spec.js`, skipped
  unless `README_SHOTS=1`), and the build-log files folded into this file.

### Problems and fixes

- The new Grok "not priced" wording first missed the `not_modelled` pattern; reworded to a shape the
  classifier knows ("fuera del script").
- The audit brief quotes a money shape as an example; the published copy describes it in words so the
  repository's privacy test passes without being weakened.
- The 5,000-pick speed test failed once (normalize 2.4 s against a 1.5 s budget) while the machine was
  running several agents (load about 10); it passed on every rerun.

## Fixes: feed script version, exact Tests links (branch `feat/fixes`)

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

## 2026-11-18: Second independent audit (what the screens show)

*`feat/audit2`, by the audit agent.*

Scope: whether anything the app shows is wrong on the real data of 18 Nov 2026. Real rows were read
read-only (allowed ranges only) into `/tmp/audit2/`, the feed was built with this branch's `btFeedBuild`
(sheet time zone America/Los_Angeles), and the app was run on it locally with Playwright (the feed URL
intercepted). Every figure was compared with an independent Python recomputation from the raw rows and
with `review.py` v1.1 (hash checked). No real row, figure or amount is in this file, the tests or the commits.

### What changed

- **`src/data/notes.js`, `src/data/normalize.js`: Grok against the close.** Grok's Cuota is Grok's quote,
  often not the price of the book whose close is noted; and `Córners 1X2` / `Más córners` / `Tarjetas 1X2`
  closes were de-vigged as two-way lines (the draw read as the only other side). On the real sheet that
  turned Grok's mean EV against the close from about −6% into a positive figure with a "leaning for"
  verdict and an Overview sentence saying Grok beats the close. Now: three-way corner and card markets
  need two other outcomes (`outcomesNeeded`), and Grok's fair-close EV and CLV use the book's own opening
  in the notes (review.py v1.1 `load_grok`: CLV book first, within 30% of its close, no bet365 fallback),
  via the new `grokSameBook`. `extra.grokOpen` / `extra.grokBook` record what was used.
- **`src/data/notes.js`: double-chance closes "(1X a / X2 b / 12 c)"** gave the pick's own price as its
  other side in the pick sheet. Display only; measures unchanged.
- **`src/data/summaries.js`, `src/i18n/*.json`:** "en 1 calificadas" → singular (`summaries.recordOne`,
  `summaries.sampleSmallOne`, added at the end of the block).
- **`src/content/rules.*.json`: rule 16** described the Sofascore AI as opened on every slate; since the
  lean run (15 Nov 2026, Decisiones row 125) it is read only for shortlisted picks. Linked to row 125.
- Tests: `tests/unit/audit2-grok-close.test.mjs`, `audit2-notes.test.mjs`, `audit2-content.test.mjs`.

### Decisions

- Grok follows review.py's definition instead of the contract's "price × close probability" because
  review.py v1.1 states "Grok's price in G, never compared with a book's close" and rule 34 forbids
  cross-source CLV. The Sombra measures are untouched and still equal review.py row by row.
- Defects in `src/features` and `src/lib` (decisions month counts, "último slate" meaning, the label of
  two different EV measures) are reported, not fixed (brief).

### How it was checked

Overview (all periods, both languages), 64 Explorer filter combinations, 4 pick sheets, Simulator in
flat / percent / Kelly, every frozen and price-first test card, Analysis breakdown and calibration,
Decisions counts and search, Settings, four browser time zones around Bogotá midnight, synthetic edge
feeds (empty, one pick, all pending, no closes), URL injection and corrupt localStorage.

## 2026-11-19: Accessibility and a slow phone

*`feat/a11y`, by the accessibility and performance agent.*

**What was asked.** Juan asked for two things nobody had tested: the app with a screen reader, and the
app on a slow phone. Neither a screen reader nor a phone exists in the workspace, so the work is the
most rigorous substitute available, plus an honest list of what a person still has to check by hand
(`docs/ACCESSIBILITY.md` section 5).

**Accessibility: how.** No rule engine (axe and the like) is installed or installable, so the checks
were written by hand (`tests/e2e/a11y-audit.js`): names and states from Chrome's own accessibility tree
through CDP (what a screen reader receives), DOM rules (one `main`, one `h1`, no skipped levels, ids,
`aria-*` references, `lang`, tables, svg), contrast computed from the rendered colours of every text
node over its composited background, non-text contrast of every field and control, 44 px touch areas
that count `::after` tap areas, and a "speech stream" dump that reads each route the way browse mode
would. The first run reported 400 to 1,300 issues per combination of size, language and theme; almost all
were a handful of causes repeated.
`tests/e2e/a11y.spec.js` runs the audit on every route and the open states (phone and desktop, Spanish
and English, light and dark), the keyboard flows, reflow at 320 px and 200% text, and reduced motion.

**Accessibility: what was found and fixed** (details and before/after ratios in ACCESSIBILITY.md):
field and control borders at 1.6–1.9:1 (new `--c-control-line` token); pending chips 4.47:1 and void
badges 4.03:1 (two tokens darkened); small-sample rows in Analysis faded with opacity to about 2:1 and
restored only on hover (now greyed with the muted ink); chip tap areas that measured 42 px, not the 44
the comment promised (the `::after` sits on the padding box); a dozen small targets (segments, link
buttons, selects, decision topics 19 px tall); a filter section named "Tipo de mercado 2" (the
`aria-label` on a `span` is ignored); `aria-controls` pointing at panels that do not exist while closed;
radio groups with no arrow keys and every option a Tab stop; focus lost to the page body when
pagination or a pick's previous / next disabled the pressed button, and when the refresh button
disabled itself; the stale banner inserted together with its text (not announced) — now a permanent
live region announces sync results; the record spoken with "0 nulas, 0 medias"; a stray "u" read
before a field's label; Spanish sheet text unmarked in the English UI; at 200% text the page title
squeezed to zero width and several rows pushed the page sideways (one chip by 186 px).

**Decisions.** Spoken forms go next to the visible figure (sr-only text or the control's name), never
replace it: many tests and the numbers auditor read the visible text, and the brief forbids changing
the wording of data. So records inside the generated sentences still read as digits and hyphens; that
is listed as the first thing to check with a real reader. Small targets were enlarged with an invisible
`::after` wherever the look mattered, so the screenshots barely change. The "Fila N" link that
duplicated every decision topic left the Tab order instead of growing.

**Slow phone: how.** `scripts/perf/phone-lab.mjs` builds the real site (service worker on), replaces
the fixture with 1,500 or 5,000 synthetic picks in the fixture's shapes, serves it gzipped over HTTP/2
(as GitHub Pages and Apps Script do; a self-signed certificate) and drives Chrome at 4x and 6x CPU
throttling with slow-4G and 3G network emulation. It measures every route cold and on a repeat open,
when the cached and the live data reach the screen (User Timing marks added to `store.js`), long tasks,
transfer sizes, the latency of nine interactions (from the action to the paint after the result,
median of five) and memory after visiting every route. `npm run perf:phone` prints the whole table;
`tests/e2e/slow-phone.spec.js` keeps five budgets in the check. The first runs over plain HTTP/1.1
showed cold loads of 15 s on 3G, almost all of it six connections queuing 115 files; that is not how
the site is served, so the lab moved to HTTP/2 and the HTTP/1.1 numbers are kept only as a note.

**Slow phone: what was fixed** (numbers in `docs/PERFORMANCE.md`): the HTML now announces every module
of the start-up import graph and the start-up strings (build step), so they download at once instead
of one import level per round trip; the feed fetch starts with the strings, not after the first render;
a fetched feed with the same sheet-read time as the one on screen is not rebuilt or redrawn; a new feed
is built in a module worker while the cached one stays usable, and the cache is written after the new
data is painted; facet counts reuse the full result for every filter that is not set (about 35 passes
over all picks became 2–5), the last slate is no longer scanned on every pass, search text is folded
once per pick; the Explorer's list, summary and curve and the panel's counts survive the remount that
opening a pick causes (`memoLast`); the Simulator stopped re-filtering and re-counting on a stake
change; formatted dates are cached. Every speed-up is checked to change nothing: a digest of the
filter and facet outputs on 5,000 picks taken with the old code must match, and the worker's dataset
must deep-equal the main thread's.

**Problems.** Building the dataset in the worker made the *first* paint of a repeat open slower (the
feed goes to the worker and the dataset comes back as two structured clones), so the cached copy is
built on the main thread and only a live swap behind a screen already shown uses the worker. Screens
remount on every path change, so a cache keyed on identity (`memoLast`) was simpler
and safer than lifting state. The lab's own CPU noise is large on a 2-core machine shared with other
agents: every number is a median, and the e2e budgets are about three times what the lab shows.

## 2026-11-19: Round 2 (the second audit's screen findings and the accessibility hand-off)

*`feat/round2`, by the round 2 agent.*

### What changed

1. **Two measures, two names.** `fairCloseEv` is "Precio vs cierre" / "Price vs close" everywhere
   (Overview, Explorer, Simulator, Analysis, frozen tests); `openingFairEv` is "EV justo (revisión)" /
   "Fair-close EV (review)" (VALOR and VALOR CASI, and beside price vs close for Sombra on the Overview's
   source card and tag table, with its n: `reviewFairEv`, `shadowTagReviewEv`). VALOR PROP's own measure
   is "EV vs bet365 (power)". The names follow milestone-reviewer and review.py: "price-vs-close EV"
   (`pvc`, the frozen tests) and "fair-close EV" (`fev`, the headline). The Tests list names each row's
   measure (the price-first group header says "Su medida", since its rows use two). Glossary:
   `price-vs-close` and `fair-ev-review`, each with a worked example that shows how the two differ on
   the same row; `fair-close-ev` (which described price vs close) is an alias that opens
   `price-vs-close` (`GLOSSARY_ALIASES`, `resolveGlossarySlug`), so old links keep their meaning.
2. **"Último slate"** is the last graded slate everywhere (`lastSlate` = the Overview's
   `lastGradedSlate`); new preset `pending_slate` ("Slate pendiente"). Old URLs keep working.
3. **Rolling periods** (7d, 30d, this month) have no end date; the Overview says "Del 9 nov en adelante,
   con los próximos slates incluidos" and the filter panel says the dates of any preset (`dateNote`).
   Consumers checked: Overview period and links, filter panel counts, Analysis month rows (the month end
   is used when the period has none), Simulator and Explorer (same `applyFilters`).
4. **Decisions** month headers and jump chips count the month under the filters (`monthCounts`); a
   month split across pages says "44 (25 en esta página)". Paging by month was considered and left out:
   November alone would be one 44-decision page that grows daily.
5. **Real-bets paragraph**: no flat break-even when stakes differ or a free bet is in; the sentence says
   why results and hit rate can disagree (`realStakeShape`, `describeRealHitRate`, `describeSourceFull`).
   The source card's "necesita X%" goes too in that case.
6. **Real-bets drawdown** on the chart's daily series, labelled "(por día)".
7. **Simulator chance range**: "Todos los picks dieron lo mismo…" when the SE is 0, "Con tan pocos
   picks…" under two (`chanceText`, now in `sentences.js`).
8. **Grok pick detail**: "Cuota de Grok: 2.44, la cuota que dio Grok; coincide con Betsson" and
   "Medido en Betsson: su apertura 2.44 contra su cierre 2.22, no la cuota de Grok".
9. **Links**: Overview tag, line and market rows use `exactSlice`; source cards, the quick link and
   pending slates say how many picks they open (`pendingSlateLink`); Analysis Grok-by-market links are
   exact. `tests/e2e/round2.spec.js` follows every kind (Overview in three periods, Tests cards and
   stopped categories, Analysis rows, cells and Grok markets, Simulator rows, glossary tag entries) and
   compares both ends; it fails on the old Overview links (checked by reverting them).
10. **Halves in words**: "3-2 (+2 medias)" / "(+2 halves)"; spoken "2 medio ganadas, 1 medio perdida".
    The scoreboard figures may now wrap (the longer text overflowed at 390 px with 200% text).
11. **Team markets** have their own glossary entries (`corners-team`, `cards-team`); `MARKET_SLUGS` no
    longer maps two families to one slug, so "Sombra por mercado" lists both links.
12. **Over / Under** reads `lineSide(p)`: the side only on picks with a line (DATA_CONTRACT section 4).
13. Settings: one cache note (the deploy sentence is appended when the versions differ). README updated.
14. **The intermittent keyboard test.** Reproduced under CPU load: the single test walking 16 routes
    takes about a minute unloaded and timed out at 90 s loaded; it also opened each route by a hash
    change, so the walk's start raced the new page's title taking focus. Probes that replaced the cached
    feed with a newer one while each focusable control of every route had focus never lost focus. But a
    real loss was found on the way: "Quitar todos" in the filter sheet, the Settings refresh and a chip
    whose count falls to 0 disable themselves while focused, so focus fell to the body (and out of the
    open dialog). `useFocusSafeDisabled` (kit `Button`, `FilterChip`) keeps such a control focusable and
    aria-disabled until focus moves on; a new keyboard test fails without it. The Tab walk is now one
    test per route on a fresh load.
15. Analysis range chart: the axis label sits on its own line above min and max; Spanish test names are
    `lang="es"` in the English UI on the Tests screen.

### Shared files changed (all additive except where the brief named the behaviour)

`src/data/filters.js` (presets, `lastSlate`/`pendingSlate`/`slateContext`/`lineSide`, rolling ends),
`src/data/overview.js` (`realBetsExtras` daily series; new `reviewFairEv`, `shadowTagReviewEv`,
`realStakeShape`, `pendingSlateLink`), `src/data/summaries.js` (new builders), `src/data/decisions.js`
(`monthCounts`), `src/data/analysis.js` (pending slate in the exact-link context), `src/lib/format.js`
(`formatRecord` halves), `src/lib/spoken.js`, `src/lib/glossary-links.js` (team slugs, aliases),
`src/lib/ui/controls.js` (`useFocusSafeDisabled` in `Button` and `FilterChip`), `src/lib/ui/display.js`
(scoreboard halves), `src/lib/ui/filter-panel.js` (date note), `src/styles/components.css`,
`src/styles/filter-panel.css`, `src/i18n/*.json` (values of `stats.fairCloseEv`, `pick.*`, some
`summaries.*`; new keys at the end of their blocks), `tests/unit/slow-phone.test.mjs` (digest recomputed:
the filter meanings changed on purpose, two states added).

### Not changed, reported

- The fixture has `Córners 1X2 | Over 3.5` and `Más tarjetas (3 vías) | Over 4.5` Grok rows that
  `lines.js` gives a line; the contract says three-way markets have none. Parsed values were left alone.
- Grok's "por veredicto" links (cotizados / no cotizados) still open every pick of the tag (their kinds
  split one tag in two); they do not show a count, so nothing contradicts.
- The Simulator's breakdown links are exact in flat mode; in Kelly mode a pick without a probability is
  skipped by the simulation but still in the Explorer slice.
