# Build log: Tests section (`feat/tests`, 15 Nov 2026)

## What was built

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

## Data additions (`src/data/tests-config.js`, additive)

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

## Decisions and why

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

## Problems and fixes

- Phone horizontal scroll from a long meter text (`nowrap`) and from tables in a grid child without
  `min-width: 0`: the meter head wraps and disclosure children shrink; tables scroll inside their box.
- The first interval strip used `preserveAspectRatio="none"`, which squashed the mean dot into an ellipse;
  it now positions everything in % of the width.
- The e2e fixes the browser clock (`page.clock.setFixedTime`) so the review countdown is stable.
