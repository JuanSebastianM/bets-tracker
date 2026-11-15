# 2026-11-15: Analysis section

**What was built.** The Analysis section (`#/analysis`, `#/analysis/:part`) replaces the stub: four parts,
one visible at a time, switched by a row of links (the part is in the path: breakdown, calibration, close,
grok), with the shared filter panel applying to all of them (side column from 1200 px, bottom sheet below).
Breakdown: 15 dimensions; per group n, record, hit rate vs break-even, yield ±2 SE, units, fair-close EV
±2 SE with n and the verdict word; range chart of the chosen measure; minimum-n slider (grey or hide);
sort in the URL; compact rows on phones, a table from 720 px; links to the Explorer with the slice added;
optional two-way table. Calibration: model, blend, consensus (price-first rows), Sofascore AI; Brier per
series and the market's on the same picks; a sentence each; CalibrationChart with n per dot. Close:
fair-close EV histogram, mean, range, share above zero, verdict; raw CLV as context; split by close source;
closing moves per market family; Pinnacle 1X2 direction. Grok vs Claude: written comparison, Grok by our
verdict with reasons, team corners vs Sombra's CÓRNERS EQUIPO, Grok by market.

**Decisions and why.**
- Part in the path, everything else in the query; view keys kept across parts. `#/analysis` stays bare
  while filters change, because a path change remounts the screen (it closed the filter sheet).
- Bands are [lo, hi); band links use the inclusive filter ranges with hi − 0.0001 (the sheet logs at most
  4 decimals), tested on every fixture band.
- Weekday has no link (no weekday filter; adding one would change the shared filter state).
- Market probability for Brier = (1 + fairCloseEv) / price; both scores on the same picks.
- The blend column on price-first rows is the consensus fair probability: its own series.
- Close source split = closeSource (own book vs bet365 feed), as review.py reports it.
- Closing moves use raw CLV at the same source only.
- Pinnacle: proportional de-vig of the pick's outcome (1X2, double chance, DNB) at open and last read; under
  half a point = no move; team names from the pick's own match; half-time markets not joined.
- Grok verdict classifier: kind from the start of the text, reason from after the arrow (priced) or the
  colon (not priced). Fixture shapes plus the skill's shapes unit-tested; no fixture rows added (would
  change the other sections' e2e counts).
- The Grok part ignores the source and tag filters (banner when set).
- Sentences in `src/features/analysis/text.js` only format figures from `src/data/`, always with n, and end
  with a sample-size caution.

**Shared changes (additive).** charts: RangeChart, Histogram, CalibrationChart `showN`; components.css:
their styles at the end; format.js: `formatScore`; tests/e2e/helpers.js: three ROUTES appended.

**Problems and fixes.** Part links overflowed at 390 px (shortened labels). The group table overflowed at
1280 px next to the side panel: record under n, verdict under the label, EV range under the mean; labels
wrap only between words. Calibration n labels overlapped: collision skip.

(Written by the orchestrator from the agent's hand-off: the agent could not create this file itself.)
