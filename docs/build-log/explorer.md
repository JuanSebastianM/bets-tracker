# 2026-11-15 — Explorer and the shared filter panel

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
