# 2026-11-15 — Simulator

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
