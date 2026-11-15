# Build log: Overview (`#/`, Resumen)

Branch `feat/overview`, 15 Nov 2026.

## What was built

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

## Data and decisions

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

## Problems and fixes

- The fixture has under 20 closes for every tag, so every tag reads "muy pronto"; the markets table shows
  the other verdicts. The rule is unit tested on synthetic picks for every branch.
- E2E fixes "today" with `page.clock.setFixedTime` (2026-11-15, the fixture's last day) so the period and
  pending tests do not depend on the run date.
