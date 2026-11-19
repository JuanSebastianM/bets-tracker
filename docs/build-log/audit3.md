## 2026-11-19: Third audit pass (regression on the merged build)

*`feat/audit3`, by the audit agent.*

Real data re-checked read-only (the sheet had not changed since 18 Nov), feed rebuilt with this build's
`btFeedBuild` under `/tmp/audit2/`. Nothing from the sheet is in this file, the tests or the commits.
`apps-script/Feed.gs` unchanged.

### What changed

- **`src/data/lines.js`:** three-way corner and card markets (`Córners 1X2`, `Más córners…`, `Tarjetas 1X2`,
  `Más tarjetas…`) get no line even when the selection has a number (DATA_CONTRACT section 4). No real row
  has that shape; the fixture has two. `tests/unit/slow-phone.test.mjs` digest recomputed for this parse
  change only (the previous code still gives the previous digest); `tests/e2e/lines.spec.js` expects 93.
- **`src/data/notes.js`, `src/data/normalize.js`:** a Grok pick's book is only a book whose own noted price
  equals G (`grokBookOpen`, `grokPriceBooks`, review.py's `book_open_grok`); the CLV-book fallback made the
  pick sheet say Grok's price "coincide con Betano" when it was Kambi's or Grok's own (40 real rows).
- **`src/content/glossary.*.json`:** "EV justo (revisión)" said its feed leg is the feed's opening; review.py
  uses "feed X" (the feed price when the row was logged). Added the IA-WATCH source; "Precio vs cierre"
  says that Grok rows are measured on the book's opening.
- Tests added to `audit2-grok-close`, `audit2-notes`, `audit2-content`.

### How it was checked

Per-row parity with review.py (price vs close and the review's fair-close EV, 728 rows); Overview in four
periods; 89 Explorer filter combinations including every `test=` id and `pending_slate`; Simulator in three
modes; every Tests card against review.py; Analysis (breakdown, Brier, histogram bins, Pinnacle direction);
worker vs main-thread dataset (deep equal); old vs new filter code on the same picks; offline, error, two
tabs and update flows on the built site; scroll restoration; since-last-visit with and without snapshot;
script-version states; English pass of every route.
