# Line and side filter (feat/lines), 15 Nov 2026

Juan asked to filter by specific lines ("TARJETAS UNDER 4.5, tarjetas under 5.5, etc… same for all other
tags where possible").

## What was built

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

## Decisions

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

## Real sheet check

Read only `Sombra!D:E`, `Grok!E:F`, `Apuestas!F:G`. Every totals / team-totals / handicap selection has
one of the parsed shapes (inspected shape by shape, not run row by row through the parser), so 0 expected
lines were missed. Shapes without a line: 1X2 and halves, DNB, doble oportunidad, BTTS, correct score,
first scorer, Más córners / Córners 1X2 / Tarjetas 1X2 / Más tarjetas, the two Apuestas combos.

## Problems and fixes

- JSON string files are edited by appending new namespaces (`lines.*`) instead of touching existing
  one-line objects; built-in presets got an optional `labelKey` for that reason.
- The "Por línea" summary doubled the height of the Overview tag table on phones; pulled it up under the
  row (negative top margin) while keeping a 44 px target.
