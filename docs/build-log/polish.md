# Build log: integration and polish pass (feat/polish, 15 Nov 2026)

## What was done

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
8. **Real-data fit** (read only: `Decisiones!B:B`, `Reglas!A8:A40`; nothing copied). Themes: 16 of 123
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

## Decisions

- Rows that link elsewhere get a separate line of glossary links rather than a nested link.
- The rules list shows the short sentence instead of the clamped long text (the page has both).
- Inline linking skips common words that are also aliases (cuota, valor, stake, over…); capitalised
  sheet words match only in capitals, so "valor" in a sentence never links to the VALOR tag.
- An Analysis row link is dropped rather than shown inexact; the Analysis e2e now expects the exact
  count (21 graded VALOR picks, not 22 with the pending one).
- The offline test serves the built site on E2E_PORT + 50 under `bt-offline.test` (Chrome host-resolver
  rule and an insecure-origin-as-secure flag), because the app keeps the service worker off on
  localhost.

## Problems and fixes

- Shared e2e expectations changed by the new links (two links in an Explorer row, "VALOR" linked twice
  on an entry page): scoped the locators.
