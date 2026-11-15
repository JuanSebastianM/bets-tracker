# Feature guide

How to build a section of Bets Tracker on top of the foundation. Written for someone who has only this
repository. Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/DATA_CONTRACT.md` first; this is the
practical companion.

## 0. Setup and checks

```sh
npm run dev                                   # http://127.0.0.1:5173/?feed=fixture  (synthetic data)
npm run check                                 # typecheck + unit + i18n parity + e2e (must pass before push)
npm test                                      # unit tests only (node --test)
npm run test:e2e -- tests/e2e/explorer.spec.js   # one spec
SCREENSHOT_DIR=/tmp/shots npm run screenshots # phone + desktop, light + dark, every route
npm run fixture                               # regenerate tests/fixtures/feed.json after editing the generator
```

The agent workspace has no npm registry: `scripts/bin.mjs` links `node_modules` to
`/opt/npm-tools/node_modules` on first use; never run `npm install` there. Local Playwright uses
`/usr/bin/google-chrome`; CI installs Chromium. Until `FEED_URL` in `src/config.js` is set, open the app
with `?feed=fixture` (the fixture is invented data in the real formats). The service worker is off on
localhost.

## 1. Files you may touch

On a `feat/<id>` branch, only:

- `src/features/<id>/**` (screens, components, `<id>.css`, `i18n/es.json`, `i18n/en.json`, helpers)
- `tests/unit/<id>*.test.mjs`, `tests/e2e/<id>*.spec.js`
- `src/content/**` (Glossary only: `glossary.{es,en}.json`, `rules.{es,en}.json`)
- `src/data/summaries.js` (Overview only, to add sentence builders) and their strings under `summaries`
- `docs/build-log/<id>.md` (your entry, in a new file; the orchestrator folds it into `docs/BUILD_LOG.md`, the one log)

Everything else is shared (`src/lib`, `src/data`, `src/styles`, `src/i18n`, `src/app.js`, `index.html`,
`sw.js`, workflows, `tests/e2e/helpers.js`, `tests/unit/helpers/*`, the fixture generator). If you need a
change there, keep it tiny and clearly necessary, test it, and call it out in your hand-off. A number
that is not in `src/data/` yet goes into `src/data/` (with a unit test), never computed inside a screen.

## 2. A section: folder, registry, routes

```
src/features/<id>/
  index.js            export const feature = { … }
  <id>-screen.js      the screen component(s)
  <id>.css            scoped under .<id> (already linked from index.html)
  i18n/es.json, en.json
```

```js
// src/features/explorer/index.js
import { ExplorerScreen } from './explorer-screen.js';
/** @type {import('../registry.js').Feature} */
export const feature = {
  id: 'explorer', titleKey: 'nav.explorer', icon: 'explorer', nav: 'tab', order: 2, i18n: true,
  routes: [{ path: '/explorer', component: ExplorerScreen }, { path: '/explorer/:uid', component: PickScreen, titleKey: 'explorer.pick' }],
};
```

- `nav: 'tab'` = bottom bar on phones (Resumen, Explorador, Simulador, Tests; "Más" is the fifth);
  `nav: 'more'` = listed on `#/more` with `descKey`. The side rail on wide screens shows all of them.
- Screens receive `{ params, query }` (hash routes: `#/glossary/near-value?x=1` → params `{ term }`,
  query `{ x: '1' }`). Link with `href('/explorer?src=shadow')` from `src/lib/router.js`; change the
  query in place with `navigate(path, { replace: true })`. The screen is keyed on the path, so changing
  only the query keeps its state.
- Wrap the screen in `<div class="<id> stack">` and scope all CSS under `.<id>`.
- The existing screen in your folder is a **stub**: replace it. Keep the `data-testid`s the foundation
  e2e uses (listed in `tests/e2e/helpers.js` `ROUTES`), or update `ROUTES` in the same change.

## 3. Data API (`src/data/`)

### Getting the data

```js
import { FeedGate } from '../../lib/ui/index.js';
import { useFeed, usePicks, useDataset, useDerived, refreshFeed } from '../../data/store.js';

export function MyScreen({ query }) {
  return html`<${FeedGate}>${(data) => html`<${My} data=${data} query=${query} />`}</${FeedGate}>`;
}
```

`FeedGate` renders the loading, "not configured" and error states for you; inside it you always have a
`Dataset`: `{ generatedAt, meta, picks, decisions, pinnacle, rules }`. `useFeed()` gives the whole state
(`status`, `fromCache`, `fetchedAt`, `refreshing`, `error`, `mode`, `version`). Memoise derived values with
`useMemo(() => …, [data, …])` or `useDerived((data) => …, [queryString])` (keyed on the dataset version).

### The Pick

One array for the three bet tabs; full type in `src/data/types.d.ts`. The fields you will use most:

| Field | Meaning |
|---|---|
| `uid`, `source`, `row` | `'shadow:412'`, `'bets' \| 'shadow' \| 'grok'`, the sheet row |
| `date`, `time` | match (slate) date `YYYY-MM-DD`; `time` Grok only |
| `league`, `match`, `selection`, `marketRaw` | as written in the sheet (show them as is, never translate) |
| `market` | family: `result, goals, corners_total, corners_team, cards_total, cards_team, shots, combo, other` |
| `reviewClass` | review.py's groups (`result, goals, corners, team_corners, cards, shots`) |
| `price`, `closePrice` | decimal odds |
| `status`, `statusRaw` | `won, lost, void, half_won, half_lost, pending, other` |
| `tag`, `tagRaw` | category id (section 5 of the contract) and the text it came from |
| `books` | Betano / Betsson / Stake named for the taken price |
| `stakeU`, `profitU` | real stake and the sheet's profit (Apuestas); Grok's stake; null otherwise |
| `probModel`, `probBlend`, `probAI`, `ev`, `fairOdds` | as logged (fractions) |
| `fairCloseEv`, `closeSource` | F × de-vigged close − 1 (own book first, else bet365 feed) |
| `clv`, `clvSource` | raw CLV at the same source |
| `hasTwoSidedClose` | a fair-close EV exists |
| `parsed` | the notes, parsed: `feedPrice`, `feedOpen`, `ref`, `sample`, `fuerza`, `pin`, `close`, `bookCloses`, `bookPrices`, `filters`, `passedAll`… |
| `extra` | source-specific: Apuestas `type`, `confidence`, `result`, `freeBet`; Grok `verdict`, `reason`, `minPrice`, `result` |

### Stats (`stats.js`) — the only place for formulas

```js
import { summarize, groupBy, measureStat, drawdown, streaks, calibration, brier, priceBand, monthOf, weekdayOf, flatProfit, sheetProfit, winsForZ, MIN_N_FOR_RATE } from '../../data/stats.js';

const s = summarize(picks);                      // 1u flat on each graded pick
const real = summarize(bets, { profit: 'sheet' }); // Apuestas: the sheet's own Ganancia (u) and stakes
s.n; s.won; s.lost; s.void; s.halfWon; s.halfLost; s.pending; s.unpriced;
s.staked; s.profit; s.yield; s.yieldSe; s.yieldZ; s.hitRate; s.avgPrice; s.breakEven;
s.fairCloseEv; // { n, mean, median, se (clustered by match), lo, hi (±2 SE), z, shareAbove }
s.clv;         // same shape
groupBy(picks, (p) => p.league);                 // [{ key, picks, summary }], largest first
groupBy(picks, (p) => p.books);                  // a key array puts a pick in several groups
groupBy(picks, (p) => priceBand(p.price));       // 'lt170' | '170_200' | '200_250' | '250_400' | 'gt400'
groupByLine(picks);                              // lines.js: [{ key: lineKey, picks, summary }], in line order
calibration(picks, (p) => p.probModel);          // [{ lo, hi, n, wins, meanProb, hitRate }]
```

Price bands are disjoint and each one is exactly the price preset of the same id: `lt170` (< 1.70),
`170_200` (1.70–2.00, both ends included), `200_250` (> 2.00, ≤ 2.50), `250_400` (> 2.50, ≤ 4.00), `gt400`.
Preset labels are built from the bounds by `priceRangeLabel` (filters.js); the Simulator and Analysis
label a band with the preset of the same id. To link a breakdown row to exactly
its picks use `exactSlice(picks, filters, patch, ctx)` (filters.js): it adds the graded statuses and,
only when they change the selection, leaves out PUBLICADA Y APOSTADA and unpriced rows (summarize and
simulate skip those); `priceBandPatch(band)` is the patch of a band. Lines: `lineLabel(key, { scope })`,
`lineAddsInfo(pick)` (show the label beside the selection only when it adds something),
`compareLineKeys`, `parseLineKey`, `LINE_SCOPES`.

Never show a rate over fewer than `MIN_N_FOR_RATE` (5) graded picks without its `n` beside it.
`summarize` leaves out `PUBLICADA Y APOSTADA` rows and unknown statuses.

### Simulator (`simulate.js`)

```js
import { simulate } from '../../data/simulate.js';
const r = simulate(picks, { mode: 'flat', stake: 1, bankroll: 100 });         // units
const c = simulate(picks, { mode: 'percent', percent: 2, bankroll: 100 });    // % of the current bankroll
r.points;   // [{ i, date, uid, stake, profit, cum, bank }]
r.totals;   // n, skipped, pending, staked, profit, yield, finalBank, roiOnBank, maxDrawdownU, maxDrawdownPct,
            // longestWin, longestLoss, won, lost, void, hitRate, avgPrice, breakEven, fairCloseEv
r.perMonth; // [{ month: 'YYYY-MM', n, won, lost, void, staked, profit, yield }]
```

Modes (added with the Simulator section): `mode: 'flat' | 'percent' | 'staked' | 'kelly'` with
`kellyFraction` (0.25) and `kellyCap` (2u). Percent and Kelly stake same-day picks on the bankroll at the
start of that day. `r.totals` also has `noStake`, `noProb`, `zeroStake`, `pendingStake`, `profitSe`,
`chanceLo/Hi` (± 2 SE of the summed profit), `maxDrawdownPctStart`, `bestDay`, `worstDay`, `underwater`
and `closeCheck` (`{ n, coverage, expected, se, lo, hi, actual }`: stake × fair-close EV over the picks with
a two-sided close); each point has `pick`, `dayBank`, `expected`, `expectedCum`. Helpers: `fairProbOf`,
`kellyFraction`, `kellyStake`, `dailySeries`, `alignDaily`, `breakdown`, `underwater`, `closeVerdictOf`,
`compareTotals`, and the URL state `stakingFromQuery` / `stakingToQuery`, `scenariosFromQuery`,
`simulatorQueryString` (scenario B lives in the `b` key as its own query string).

The Simulator works in units. Money only through `formatMoney(units, settings)`, and only when the user
typed a unit value in Settings (`bankrollUnits(settings)` gives the bankroll in units).

### Filters (`filters.js`) — shared by Explorer and Simulator

```js
import { defaultFilters, applyFilters, fromQuery, toQuery, toQueryString, filterOptions, countActive, PRICE_PRESETS, DATE_PRESETS, lastSlate } from '../../data/filters.js';

const f = fromQuery(query);                                  // state from the hash query
const list = applyFilters(data.picks, f, { today: todayIn(APP_TIMEZONE) });
navigate(`/explorer?${toQueryString({ ...f, tags: ['near_value'] })}`, { replace: true });
const opts = filterOptions(data.picks);                      // { tags: [{ value, count }], leagues, books, markets, … }
```

State fields: `sources, tags, markets, marketsRaw, leagues, books, statuses` (lists), `pricePreset`
(`le170, 170_200, lt200, le200, 200_250, le250, 250_400, le400, gt400`) or `price {min,max}`,
`datePreset` (`last_slate, 7d, 30d, this_month, since`) with `dateFrom/dateTo`, `slate`, `hasClose`,
`twoSidedClose`, `refs`, `samples`, `fuerza`, `reasons`, `ev {min,max}`, `prob {min,max}`, `q`. Added with the line filter:
`sides` (`over`, `under`: `Pick.side`; URL `side`), `lines` (lineKeys, `cards:under:4.5`; URL `line`) and
`passedAll` (`true`/`false`/`null`: `parsed.passedAll`; URL `pass`). Old URLs and saved presets parse as
before (the new fields stay at their defaults). `PRICE_PRESETS` has one hidden preset, `lt170` (< 1.70),
not offered as a chip: it exists so the `lt170` price band can be linked. The same
query string works on `#/explorer` and `#/simulator`, and saved presets (`savePreset(name, query)` in
`settings.js`) store it.

### Tags, notes, tests

```js
import { TAGS, tagLabel, classifyShadow, MARKET_FAMILIES, FILTER_REASONS, BOOKS } from '../../data/tags.js';
import { FROZEN_TESTS, FROZEN_RULE, frozenProgress, nextShadowReview, SHADOW_REVIEW } from '../../data/tests-config.js';
const p = frozenProgress(FROZEN_TESTS[0], data.picks); // { graded, withClose, ev, state: 'collecting'|'pass'|'stop', summary, … }
const r = nextShadowReview(data.decisions, data.picks, todayIn(APP_TIMEZONE)); // { dueDate, dueRows, daysLeft, rowsLeft, due }
```

Show the sheet's own label (`tagLabel(tag)` → "VALOR CASI"), never the id.

### Summaries (`summaries.js`)

`describe(label, summary)` returns a paragraph; `describeRecord`, `describeHitRate`, `describeCloseEv`,
`describeSampleWarning` the parts. Templates are in `src/i18n/*.json` under `summaries`. To add one: a
function in `summaries.js`, its templates in both languages, a unit test in
`tests/unit/format-summaries.test.mjs` style.

### Settings (`settings.js`)

`useSettings()` → `{ theme, bankroll, unitValue, currency, defaultStake, presets, lastVisit }`;
`updateSettings(patch)`, `savePreset(name, query)`, `deletePreset(id)`, `bankrollUnits()`, `toMoney()`.
Language is `setLocale('es' | 'en')` / `useLocale()` from `src/lib/i18n.js`.

## 4. UI kit (`src/lib/ui/index.js`)

```js
import { html, useState, useMemo } from '../../../vendor/preact.js';
import { Card, Stat, Scoreboard, StatusBadge, TagBadge, Banner, EmptyState, Skeleton, Disclosure, CountLabel,
  Button, IconButton, Chip, FilterChip, SegmentedControl, Select, NumberField, RangeInput, SearchInput, TextField,
  BottomSheet, Dialog, DataTable, Pagination, pageOf, PickCard, FeedGate, Icon, Toaster } from '../../lib/ui/index.js';
```

| Component | Props (main) | Use |
|---|---|---|
| `Card` | `title, subtitle, action, level, tone='plain'\|'accent', testId` | every block of content |
| `Stat` | `label, value, sub, tone='plain'\|'won'\|'lost'\|'pending'` | one figure; put `n` in `sub` |
| `Scoreboard` | `won, lost, void, halfWon, halfLost, size='lg'\|'md'` | the record, the app's signature element |
| `StatusBadge` | `status, raw` | result with icon + word (never colour alone) |
| `TagBadge` | `tag, href` | the sheet label; link it to `#/glossary/<slug>` |
| `Banner` | `tone='info'\|'warning'\|'error'\|'offline', title, action` | page-level messages |
| `EmptyState` | `icon, title, body, action` | say what is missing and what to do |
| `Skeleton`, `Disclosure`, `CountLabel` | `lines`; `summary, open`; `n, k` | loading; secondary content; "53 picks" |
| `Button`, `IconButton` | `variant='primary'\|'secondary'\|'ghost'\|'danger', icon, href`; `icon, label` | actions (44 px) |
| `Chip`, `FilterChip` | `tone`; `label, selected, onToggle, count, testId` | labels; filter toggles (aria-pressed) |
| `SegmentedControl`, `Select` | `label, value, options, onValue, hideLabel` | one choice of a few / many |
| `NumberField`, `RangeInput`, `TextField`, `SearchInput` | `label, value, onValue, unit, hint` | inputs; numbers accept `,` |
| `BottomSheet` (= `Dialog`) | `open, title, onClose, footer, size='md'\|'lg', testId` | modal: sheet on phones, dialog on wide screens |
| `DataTable` | `columns[{key,label,render,sortValue,num}], rows, caption, rowKey, onRowClick, empty` | tables (scroll sideways in their box) |
| `Pagination`, `pageOf(list, page, size)` | `page, pageCount, onPage, total` | 50 per page (`PAGE_SIZE`) |
| `PickCard` | `pick, onOpen, tagHref` | one pick |
| `Icon` | `name, size, label` | `ICON_NAMES`; add new icons in `icons.js` |

Toasts: `toast(t('…'), { tone: 'success' })` from `src/lib/toast.js`.

### Filter panel (`src/lib/ui/filter-panel.js`)

The shared panel over the filter state of `src/data/filters.js`, built with the Explorer and meant to be
dropped into the Simulator and Analysis as is. It is controlled: the screen owns the state (the hash
query) and passes `filters` + `onChange`; the panel never touches the URL. Styles live in
`src/styles/filter-panel.css`, strings under `filters.*` in `src/i18n/*.json`.

```js
import { FilterPanel, ActiveFilters, FilterButton, SavedFilters, BottomSheet, useMediaQuery } from '../../lib/ui/index.js';
import { fromQuery, toQueryString, countActive, applyFilters } from '../../data/filters.js';

const f = fromQuery(query);                                  // the screen's state
const set = (next) => navigate(`/simulator${toQueryString(next) ? `?${toQueryString(next)}` : ''}`, { replace: true });
const wide = useMediaQuery('(min-width: 1200px)');           // side column on wide screens, sheet on phones
const panel = html`<${FilterPanel} picks=${data.picks} filters=${f} onChange=${set} hide=${['q']} />`;

html`<${FilterButton} count=${countActive(f)} onClick=${() => setOpen(true)} />
  <${ActiveFilters} filters=${f} onChange=${set} />
  ${wide ? html`<aside>${panel}</aside>` : html`<${BottomSheet} open=${open} title=${t('filters.title')} onClose=${close}
     footer=${html`<${Button} variant="primary" onClick=${close}>${t('filters.showN', { count: n, n })}</${Button}>`}>
     <${SavedFilters} filters=${f} onApply=${set} />${panel}</${BottomSheet}>`}`;
```

- `FilterPanel` props: `picks` (all picks: options and the last slate come from them), `filters`,
  `onChange(next)`, `hide` (section ids from `FILTER_SECTIONS`: `q, source, tag, price, date, market,
  status, league, book, close, ref, sample, fuerza, reason, numbers`), `today` (defaults to Bogotá today).
  It shows a live count (`filter-live-count`) and, on every option, how many picks it would give with the
  other filters as they are (`facetCounts`); options at 0 are disabled, or hidden in the long lists
  (leagues, raw markets). Chip test ids: `fchip-<field>-<value>`, `fchip-price-<preset>`, `fchip-date-<preset>`.
- `ActiveFilters`: removable chips of what is on (`activeEntries` / `removeEntry`) plus "Quitar todos"
  (`clearAll=${false}` leaves the link out). Renders nothing when no filter is on.
- `FilterButton`: the "Filtros" button with the active count (`filter-button`).
- `SavedFilters`: the user's saved filters (`savePreset` / `deletePreset`; Settings lists them too),
  "save this filter", and the built-in starting points (`BUILTIN_PRESETS`), which only fill the panel.
- The "Línea" section (`line`, open by default, right after Market) shows Over / Under chips and the
  line chips that exist under the other filters ("Under 4.5 · 11"), grouped by kind of market (Tarjetas,
  Córners de equipo…) when they span several, sorted by line. It hides itself when no pick has a line.
  Chip test ids: `fchip-sides-under`, `fchip-lines-cards:under:4.5`; the section is `fp-lines`. "Pasó
  todos los filtros" (yes / no / any) sits in the Reason section. Built-in presets `cards_under_45`,
  `cards_under_55`, `corners_under_95` (a preset may carry `labelKey`).
- Data helpers added with it: `facetCounts`, `activeEntries`, `removeEntry`, `fromQueryString`,
  `BUILTIN_PRESETS`, `builtinPreset` (`filters.js`); `TAG_GROUPS`, `tagSlug` (`tags.js`); `sortPicks`,
  `SORT_KEYS`, `pinnacleFor`, `neighbours` (`explore.js`).

## 5. Charts (`src/lib/charts/index.js`)

```js
import { LineChart, BarChart, CalibrationChart, Sparkline, ChartFrame } from '../../lib/charts/index.js';
html`<${LineChart} values=${r.points.map((p) => p.cum)} labels=${r.points.map((p) => formatDate(p.date, 'short'))}
  shadeDrawdown yFormat=${(v) => formatUnits(v, { suffix: '' })} summary=${sentence} table=${{ columns, rows }} />`;
html`<${BarChart} bars=${[{ label: 'VALOR', sub: 'n 53', value: 0.081 }]} yFormat=${formatPct} summary=${…} table=${…} />`;
html`<${CalibrationChart} buckets=${calibration(picks)} summary=${…} table=${…} />`;
html`<${Sparkline} values=${cum} summary=${…} />`;
```

Every chart needs `summary` (the caption and the accessible name: say what it shows and the key number)
and, except sparklines, a `table` so "Ver como tabla" works. Colours come from tokens (`--c-chart-*`,
`--c-won`, `--c-lost`); never hard-code a colour.

## 6. Formatting and i18n

- Numbers: `formatPrice` (2 decimals, 3 when the sheet has 3; `{ average: true }` for means),
  `formatUnits` (`+2.74u`), `formatPct` (`+3.1%`; `{ sign: false }` for rates), `formatProb`,
  `formatRecord`, `formatDate(d, 'medium')` (`15 nov 2026`), `formatMonth('2026-11')`, `formatMoney(units,
  settings)`, `formatAgo(iso)`, `todayIn(APP_TIMEZONE)`. All in `src/lib/format.js`.
- Strings: every visible string goes through `t()`. Feature strings live in `src/features/<id>/i18n/es.json`
  and `en.json` and are used as `t('<id>.key')`. Plurals: `{ "one": "…", "other": "…" }` with
  `t(key, { count })`. Interpolation `{name}`. Shared keys you can reuse: `common.*`, `status.*`,
  `sources.*`, `markets.*`, `stats.*`, `filters.*`, `feed.*`, `chart.*`, `pager.*`, `pick.*`.
- Spanish is the default: natural Colombian Spanish (tú), sentence case, plain verbs; a button says what
  happens. English must be complete: `npm run check:i18n` fails on a key missing in either language.
- Sheet text (leagues, teams, notes, decisions, tags) is shown as written, never translated.

## 7. Design rules

- Tokens only (`src/styles/tokens.css`): `--c-bg, --c-surface, --c-ink, --c-muted, --c-line, --c-accent`;
  results `--c-won`, `--c-lost`, `--c-void`; attention `--c-pending`. No hex in feature CSS, no
  `prefers-color-scheme` (the user picks the theme; tokens follow `[data-theme]`).
- One accent (floodlight teal). Green and red only for results; amber only for pending / attention.
- Mobile first at 390 px: no horizontal page scroll (the e2e checks it), 44 px targets, figures in
  `.num` (tabular). Wide screens get the side rail and up to 1040 px of content.
- Calm and dense, not a casino: no gradients, no confetti, no motion that is not a response to a tap.

## 8. Tests

- Unit (`node --test`): pure logic, in `tests/unit/<id>*.test.mjs`. Use `tests/unit/helpers/picks.mjs`
  (`mkPick({ … })`) for picks and `helpers/strings.mjs` (`loadAllStrings('es')`) when you call `t()`.
- E2E (Playwright): `tests/e2e/<id>.spec.js`, always on the fixture:

```js
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';
test('explorer filters by tag', async ({ page }) => {
  const { errors } = await openApp(page, '/explorer?tag=near_value');
  await expect(page.getByTestId('explorer-count')).toContainText('picks');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
```

  `openApp(page, path, { settings, locale, fixture })`. Prefer role and label locators; add
  `data-testid` only where text is ambiguous. Wait on conditions (`toBeVisible`, `expect.poll`), never
  on time. A flaky test is a bug.
- Need a new edge case in the data? Extend `scripts/make-fixture.mjs`, run `npm run fixture`, and assert
  the case exists in `tests/unit/normalize.test.mjs`. Never put real sheet rows in the repo.
- Screenshots: add your routes to `ROUTES` in `tests/e2e/helpers.js` if new, run `npm run screenshots`,
  and look at the PNGs (phone and desktop, light and dark) before you hand off.

## 9. Do and don't

- Do take every number from `src/data/`; don't re-derive yield, EV, drawdown or a hit rate in a screen.
- Do show `n` next to every rate and mean; don't show a rate on fewer than 5 graded picks without it.
- Do say "against the close without the margin" (fair-close EV) and keep raw CLV as context.
- Do keep money out: units everywhere; money only via `formatMoney` with the user's own Settings.
- Don't write to the sheet, call Google APIs, or add a CDN or a library (vendored libs go through the
  vendor workflow).
- Don't use colour alone for meaning; won/lost also differ by icon or sign.
- Do write your entry in `docs/build-log/<id>.md` (folded into `docs/BUILD_LOG.md` at merge): what you built, decisions and why, problems solved.

## 10. Linking to the Glossary and the Decisions

Every section links terms, tags and rules to the Glossary, and decision rows to the Decisions log, with
the helpers in `src/lib/glossary-links.js` (never build these URLs by hand):

```js
import { glossaryHref, tagSlug, ruleSlug, decisionHref, sheetRuleSlug } from '../../lib/glossary-links.js';
import { Term, RefText, TagBadge } from '../../lib/ui/index.js';

glossaryHref('fair-close-ev');                 // '#/glossary/fair-close-ev'
html`<${TagBadge} tag=${p.tag} href=${glossaryHref(tagSlug(p.tag))} />`;   // near_value -> #/glossary/near-value
html`<${Term} slug="clv">CLV</${Term}>`;        // inline link (dotted underline)
html`<a href=${glossaryHref(ruleSlug(29))}>regla 29</a>`;                   // #/glossary/rule-29
html`<a href=${decisionHref(110)}>fila 110</a>`;                            // #/decisions/110 (Decisiones sheet row)
html`<${RefText} text=${p.notes} known=${{ decisionRows, ruleNumbers }} q=${query} />`;
```

- Slugs are stable kebab-case English. Tag entries are the kebab-case of the TagId (`prop_near_value` →
  `prop-near-value`); the 36 betting-analyst rules are `rule-1` … `rule-36`; market families, statuses,
  filter reasons and note fields each have an entry (the `covers` field in `src/content/glossary.*.json`
  says which). Useful slugs: `fair-close-ev`, `clv`, `de-vig`, `yield`, `hit-rate`, `break-even`,
  `standard-error`, `two-se`, `brier`, `calibration`, `frozen-tests`, `gate`, `unit`, `stake`, `kelly`,
  `drawdown`, `blend`, `consensus`, `shadow-tab`, `bets-tab`, `grok-tab`, `decisions-tab`.
- More helpers in `glossary-links.js`: `tagHref(tag)`, `REASON_SLUGS` (filter reason → entry),
  `MARKET_SLUGS` (market family → entry), `SHEET_RULE_BY_N`. `tagSlug` lives only there (`tags.js`
  re-exports it). `tests/unit/polish-glossary-links.test.mjs` collects every slug written in `src/` (and
  the maps) and fails if one is missing from the glossary in either language.
- UI kit: `<DecisionLink row>` ("Decisiones fila 28 · <topic>", the topic from the feed),
  `<TagGlossaryLinks tags items label>` (a line of glossary links under a table whose rows link
  elsewhere: a link inside a row link is not allowed), `<VerdictChip v>` (the verdict word against the
  close, one chip for every section), `useGlossaryLinks()` → `{ terms, ruleNumbers }` and
  `termIndexOf(content)` for inline term links: `<RefText text terms=${terms} exclude=${[ownSlug]} />`.
- Elsewhere: `explorerHref(partialFilters)` and `SIDE_PANEL_QUERY` (`src/lib/links.js`), `signClass(v, eps)`
  (`format.js`).
- Long tables on wide screens: add `table-sticky` to the `.table-wrap` (the header row sticks under the
  app header; the wrapper clips instead of scrolling, so lay the table out to fit from 960 px). Tags in
  tables wrap between words only.
- `RefText` turns "fila N" / "Decisiones row N" into decision links and "regla N" / "rule N" into rule
  links, safely (tokens, never innerHTML), and highlights `q`. Pass the decision rows of the dataset
  (`data.decisions.map((d) => d.row)`) so rows of other tabs ("Sombra fila 412") stay plain text.
- The theme of a decision, its status kind, the citation graph and the Decisions URL state live in
  `src/data/decisions.js`; the glossary loader and search in `src/data/content.js`.
