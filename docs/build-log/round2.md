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
