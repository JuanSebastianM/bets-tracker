# Build log: independent audit (feat/audit, 15 Nov 2026)

Scope: privacy (no money leaves the sheet), whether the app's numbers match `review.py` and an independent
recomputation on the real sheet, and behaviour that the section agents could not check. Real rows were read
read-only (the allowed ranges only) into `/tmp/audit/`, never into the repository. No real row, amount or
figure from the sheet is in this file, the tests or the commits.

## What changed

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

## How the real data was checked

1. Sheets API display values per chunk of at most 150 rows, saved under `/tmp/audit/raw/`. Display strings
   were converted the way `getValues()` would type them (numbers, percentages as fractions, ISO date
   strings kept as text, which `btFeedCell` treats like a `Date`). Where this can hide a difference: the
   live script gets full-precision numbers (a percentage shown with two decimals, a price shown rounded)
   and real `Date` objects for dates and Grok times; `Reglas` was read from row 8 only, so the header
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

## Decisions

- The extra scrubbing hides a little more than strictly needed (a third-party subscription price in one
  decision). Hiding too much is the safe side; counts of things (`60 mil caracteres`, `36k tokens`),
  prices with three decimals, ids written `id 12345678` and coefficients near the word `unidad` stay.
- Bounds per numeric kind instead of per column: simple, and no real value is near them.
- Synthetic examples use figures that do not coincide with any real amount.
