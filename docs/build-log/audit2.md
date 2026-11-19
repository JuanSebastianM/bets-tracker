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
