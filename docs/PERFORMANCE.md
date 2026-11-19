# Performance on a slow phone

How the app was measured on an emulated slow phone, the budgets it is held to and why, the results
before and after the work, and what a real phone could still do differently.

## 1. Method

`scripts/perf/phone-lab.mjs` (used by `npm run perf:phone` and `tests/e2e/slow-phone.spec.js`):

- **The real site**: `scripts/build-site.mjs` output, service worker on (`?sw=on`), served **gzipped
  over HTTP/2** with a throwaway self-signed certificate, as GitHub Pages serves the shell and Apps
  Script serves the feed. `--http1` serves plain HTTP/1.1 instead (see section 5).
- **Real size**: the fixture is replaced by 1,500 or 5,000 synthetic picks in the fixture's shapes
  (`scripts/perf/big-feed.mjs`, the construction of `tests/unit/polish-perf.test.mjs`): 626 KB / 96 KB
  gzipped and 2,071 KB / 310 KB gzipped. The live sheet has about 880 picks today and grows by 30–60 a
  day, so 1,500 is about a month away and 5,000 about half a year. It is served at the fixture URL
  (not intercepted) so its bytes go through the emulated network. By default every fetch gets a new
  sheet-read time, as when the sheet was read again; `--same-feed` returns the same answer every time.
- **The phone**: 390 × 844 at DPR 2, touch, Chrome with `Emulation.setCPUThrottlingRate` 4x and 6x and
  `Network.emulateNetworkConditions` **slow 4G** (150 ms, 1.6 Mbps down, 750 kbps up: Lighthouse's) and
  **3G** (562.5 ms, 1.44 Mbps, 675 kbps: DevTools').
- **Loads, for every route**: cold (new profile: nothing cached) and repeat (shell in the service worker,
  feed in IndexedDB). Times from navigation start: the route's content on screen (its `ready` test id);
  `bt:cache-data` and `bt:live-data`, User Timing marks in `src/data/store.js` when the cached and the
  live data are handed to the screens (the next frame paints them); long tasks (count / longest);
  transfer sizes of the shell and the feed; request count.
- **Interactions**, timed inside the page from the action to the first paint after the screen shows the
  result, median of 5: route change Resumen → Explorador, open the filter sheet, toggle a tag chip,
  type one letter in the Explorer search, change the Simulator stake, expand a test, open a pick, switch
  the Analysis dimension, next page.
- **Memory**: JS heap after visiting every route and a forced garbage collection.

The lab runs on a shared 2-core machine: identical runs differ by 10–30%, and a few hundred ms on single
values. Read medians and trends, not single cells.

## 2. Budgets and why

A mid-range Android phone of a few years ago is about 4x slower than this machine's core (the reason
Lighthouse throttles 4x); 6x stands for an older or busy one.

| What | Budget | Why |
|---|---|---|
| Every interaction, 4x, 1,500 picks | median ≤ 200 ms | Google's "good" Interaction to Next Paint; above it a tap feels late |
| Every interaction, 4x, 5,000 picks | median ≤ 300 ms | half a year of growth must still feel responsive, if not instant |
| Repeat open (the installed app), 4x, slow 4G, 1,500 | content ≤ 1.5 s; live data ≤ 2 s; longest task ≤ 300 ms | the everyday case: open the app, see the numbers, the fresh sheet follows without a freeze |
| First open, 4x, 1,500 | content ≤ 4 s on slow 4G, ≤ 8 s on 3G | once per install or after clearing data |
| `slow-phone.spec.js` in `npm run check` | route 600, sheet 600, chip 500, pick 600, search 450 ms (median of 5 at 4x, 1,500 picks, one re-measure) | about three times the lab's after-values, so a loaded CI runner does not flake |

## 3. Results (HTTP/2; before = the code before this work, after = with it)

Loads at 4x CPU, slow 4G, 1,500 picks (ms; the four busiest routes; every route is in `npm run perf:phone`):

| Route | cold content before → after | repeat content | repeat live data | repeat longest task |
|---|---|---|---|---|
| Resumen | 4253 → 3667 | 821 → 1042 | 1420 → 1326 | 334 → 268 |
| Explorador | 4273 → 4065 | 1071 → 842 | 1648 → 1192 | 374 → 208 |
| Simulador | 4799 → 3528 | 1038 → 1073 | 1634 → 1297 | 346 → 237 |
| Análisis | 4301 → 3445 | 917 → 992 | 1644 → 1360 | 261 → 164 |

Same, 5,000 picks:

| Route | cold content | repeat content | repeat live data | repeat longest task |
|---|---|---|---|---|
| Resumen | 5909 → 4819 | 1407 → 1193 | 3391 → 2613 | 772 → 392 |
| Explorador | 5786 → 5362 | 1226 → 1258 | 3075 → 2555 | 670 → 393 |
| Simulador | 6174 → 5323 | 1420 → 1481 | 3070 → 2546 | 654 → 491 |
| Análisis | 5914 → 4930 | 1365 → 1314 | 3382 → 2656 | 685 → 491 |

3G, 4x, cold content on the Resumen: 1,500 picks 8333 → 6081, 5,000 picks 10120 → 7329.
With `--same-feed` (reopened within the script's 5-minute cache), 5,000 picks: live data at about 2.2 s
with no rebuild and no redraw (the swap used to cost a 650–770 ms task).

Interactions (median ms, 4x; 6x in brackets):

| Interaction | 1,500 before → after | 5,000 before → after |
|---|---|---|
| Route change | 133 → 127 | 227 → 120 (388 → 185) |
| Open the filter sheet | 142 → 104 | 336 → 137 (452 → 225) |
| Toggle a tag chip | 114 → 155 | 177 → 139 (263 → 185) |
| Type a letter in search | 92 → 55 | 197 → 42 (294 → 96) |
| Change the Simulator stake | 96 → 73 | 178 → 141 (276 → 181) |
| Expand a test | 41 → 44 | 37 → 43 (60 → 63) |
| Open a pick | 185 → 150 | 263 → 152 (293 → 199) |
| Switch the Analysis dimension | 61 → 73 | 99 → 127 (164 → 122) |
| Next page | 97 → 83 | 104 → 102 (156 → 133) |

Sizes: shell 318 KB → 322 KB transferred (the preload lines), feed 96 / 310 KB. Memory after every
route: JS heap 7 → 8 MB (1,500), 12 → 13 MB (5,000). Against section 2, after the work: every
interaction budget is met at 1,500 and 5,000 picks; the repeat open is met (content ≤ 1.1 s, live data
≤ 1.4 s; the longest task ≤ 300 ms on every route but one Decisiones run at 305 ms); the first open is
met on 3G (5.4–6.1 s) and on slow 4G for 14 of 16 routes, with the Explorer (4.07 s) and a decision page
(4.02 s) just over 4 s (before: 10 of 16 routes over 4 s, up to 4.8 s). At 5,000 picks the first open on slow 4G is about 5 s, over the 1,500-pick budget. Cells
under 100 ms, and the chip and dimension rows, moved within the lab's noise.

## 4. What changed

- **Start-up imports announced in the HTML** (`build-site.mjs`): `<link rel="modulepreload">` for the
  79 modules of the static import graph of `src/main.js` and `preload` for the 18 string files, so the
  browser fetches them at once instead of discovering one import level per round trip.
- **The feed starts with the strings** (`main.js`), not after the first render; the live fetch starts
  before the cached copy is read (`startFeed`).
- **Same answer, no work**: a fetched feed with the sheet-read time of the one on screen is not rebuilt
  or redrawn (`sameFeed`); only the sync stamp moves.
- **A new feed is built in a module worker** (`src/data/normalize-worker.js`) while the cached data
  stays on screen and usable. The cached copy itself is built on the main thread: going through the
  worker made the first paint slower (two structured clones), measured and reverted.
- **The cache is written after the new data is painted** (it clones the whole feed on the main thread).
- **Facet counts** (`facetCounts`): a filter that is not set is not "left out" by another pass over every
  pick; the full result is reused. About 35 passes became 2–5. `applyFilters` no longer scans for the
  last slate on every pass and folds each pick's search text once.
- **Results that survive a remount** (`src/data/memo.js` `memoLast`): the Explorer's list, summary and
  curve and the filter panel's options and counts (opening a pick or the sheet remounts them); the
  Simulator's list and count are keyed on the filters, so a stake change does not filter again.
- **Formatted dates cached** (`formatDate`): the same few hundred dates were formatted with Intl
  thousands of times per render.

No result changed: `tests/unit/slow-phone.test.mjs` hashes the filter and facet outputs of 34 filter
states on 5,000 picks and compares them with the digest taken from the code before the work; the
worker's dataset must deep-equal the main thread's; the existing unit tests (including the 5,000-pick
budgets of `polish-perf.test.mjs`) pass unchanged.

## 5. What a real slow phone could still do differently

- **Thermal throttling and big.LITTLE cores**: CPU throttling slows one fast core evenly; a warm phone
  or a task landing on a little core can be slower than 6x for seconds.
- **Memory**: an old phone with 2–3 GB may evict the app in the background; then every open is a
  repeat open that must rebuild everything (about 1–1.5 s here at 4x).
- **GPU, fonts and layout**: style and layout are a large share of every interaction here and depend
  on the screen's pixel density and the phone's fonts; the lab's DPR is 2, many phones are 2.6–3.
- **Real networks**: radio wake-up, packet loss and Apps Script's own time to answer (often 1–3 s,
  more on a cold script) are not emulated; the feed request also follows a redirect to
  googleusercontent.com, one more round trip.
- **HTTP/1.1**: over plain HTTP/1.1 (6 connections) the ~116 requests of a cold open queue: the first
  lab run measured 15–17 s on 3G at 6x. GitHub Pages serves HTTP/2 and HTTP/3, so the lab uses HTTP/2.
- **Cold long tasks grew**: because the data now arrives sooner, building it and the first full render
  now fall together in one task on a first open (up to about 0.6 s at 4x, 1.3 s at 6x with 5,000 picks).
  The page is already painted with its skeleton by then; splitting the first render (list first,
  figures after) is the next step if this is felt.
- **Next candidates**: draw the Explorer's summary strip after the list; build the cached copy in the
  worker once the shell has painted; cache the normalized dataset instead of the raw feed.

Run it yourself: `npm run perf:phone` (about 25 minutes; `--picks 1500 --cpu 4 --net slow4g` for one
combination, `--only interactions`, `--routes all`, `--same-feed`, `--http1`, `--json out.json`).
