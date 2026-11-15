# Data contract

How data gets from the Google Sheet to the screen, and what is never allowed through.

```
Google Sheet ──(Apps Script web app, read only, whitelist + scrub)──▶ feed JSON
feed JSON ──(src/data/feed.js: fetch, validate, cache in IndexedDB)──▶ raw tabs
raw tabs ──(src/data/normalize.js + src/data/tags.js + src/data/notes.js)──▶ Pick[]
Pick[] ──(src/data/filters.js, src/data/stats.js, src/data/simulate.js)──▶ features
```

## 1. Source: the sheet

Spreadsheet "Bets Tracker with Claude". Tabs and what the app does with them:

| Tab | Used | Notes |
|---|---|---|
| `Apuestas` | yes | real bets, one row per bet; formulas pre-filled to row 301, so rows with an empty `Partido` are skipped |
| `Sombra` | yes | shadow picks (nothing staked); the tag is the start of `Motivo de descarte` |
| `Grok` | yes | Grok's picks and our verdict on each |
| `Decisiones` | yes | decision log |
| `Reglas` | partly | only the numbered lines below the cell `Reglas` in column A, and never rule 1 (it states the unit value and the bank); nothing above that header (the money block `A1:B7`) is published |
| `Pinnacle` | yes | columns A–Q only (Pinnacle 1X2 open and last price per match) |
| `Bank`, `Resumen mensual`, `Por mercado`, `Por liga` | **never** | money tabs and summaries; the app recomputes every summary from `Apuestas` in units |

Columns are found **by header text, never by position**, so a moved column cannot leak or shift data.

## 2. Privacy rules (hard)

1. The feed is built from a whitelist: a column that is not listed in section 3 is not read.
2. Any header that contains `COP`, `Bank` or `$` is refused even if someone adds it to the whitelist.
3. Free text (notes, reasons, decisions, rules) is scrubbed cell by cell. These are replaced by `[oculto]`:
   - `$` followed by a number, a number followed or preceded by `COP` or `pesos` (any case), `mil`/`k`
     forms included (`99 mil pesos`, `77k COP`);
   - any number with two or more thousand groups (`1.234.567`, `9,876,543`): no price or stat looks like that.
   Prices keep three decimals in notes (`feed 4.333`, `apertura feed 1.833`), so a single thousand group
   is **not** scrubbed on its own.
4. After the JSON is built the script searches the whole string for `COP` and for a `$` next to a number;
   a hit means a bug: the whole cell is replaced and counted in `meta.redactions`. A `$` with no number
   beside it is not money (one decision quotes a `$(…)` template placeholder) and stays readable.
5. Units are fine (`Stake (u)`, `Ganancia (u)`, `Stake máx. (u)`): they say nothing about the bankroll in
   money. `Stake máx. (u)` is ¼ Kelly × the bank in units, so a reader can estimate the bank **in units**,
   never in money (the unit value is not in the feed).
6. The repository holds no sheet data. Fixtures are synthetic: invented teams and results, real formats.
7. `tests/unit/privacy.test.mjs` runs the scrubber on a fixture that has money in every shape above, in
   headers and in text, and fails if any of it survives. It also greps the repo for money patterns (the made-up examples in this file are the only allowed ones).

Scrubbing free text is best effort: a sentence such as "tengo cuatro millones" would pass. The audit step
reads the live feed for that; the durable fix is to not write balances in notes.

Added by the audit (15 Nov 2026; every shape has a made-up case in `tests/fixtures/privacy-money.json`,
`auditTexts`, checked with its exact scrubbed output by `tests/unit/audit-feed.test.mjs`):

- more text shapes: millions in words or slang after a number (`millones`, `millón`, `mill.`, `MM`, `palos`,
  `lucas`), a capital `M` after a number, `mil` after a number unless a count of things follows
  (`caracteres`, `tokens`, `filas`, `partidos`…), thousands written with spaces (also no-break and thin
  spaces), other currencies before or after a number (`€`, `£`, `euros`, `libras`, `dólares`, `USD`, `EUR`,
  `GBP`), a colon or a dot between `COP`/`pesos` and the number, a number followed by `$`, a money-sized
  number (a thousand group, four or more digits, or a `k`/`mil`/`M` suffix) within 25 characters after a
  money word (`bank`, `banca`, `saldo`, `freebet`, `apuesta gratis`, `bono`, `depósito`, `retiro`, `unidad`,
  `gané`, `perdí`, `aposté`, `apuesta de`, `pagó`, `cobré`, `1u =`), and a bare integer of five or more
  digits (`id 12345678` stays). Still missed, on purpose or by limit: amounts in words (`cuarenta mil
  pesos`) and a single thousand group with no money word next to it (`80.000 en Betano`).
- numeric cells outside plausible bounds are dropped and counted as redactions: `int` above 10,000,
  `price` and `units` above 1,000 in absolute value, `prob` above 1 (after the `59.7` → 0.597 rule), `frac`
  above 100. Pinnacle's `mins_before_kickoff` has its own kind (`minutes`) without a bound.
- a whitelisted header that appears twice in a tab is ambiguous: neither column is read and the header
  is listed in `meta.missingHeaders`.

On the real sheet (read 15 Nov 2026) the first scrubber hid 3 amounts (one Apuestas note, one decision)
and the extended one hides 1 more cell part (a third-party subscription price in a decision); nothing
else changed. Units remain public by design; note that `Stake máx. (u)` (¼ Kelly × the bank in units)
lets a reader estimate the bank **in units**, never in money.

## 3. Feed JSON (schema 1)

`GET <web app URL>` returns `application/json` (row counts in the example are the real ones of 15 Nov 2026,
as the audit read them; Settings shows the live counts):

```jsonc
{
  "schema": 1,
  "generatedAt": "2026-11-15T16:00:00Z",   // when the script read the sheet
  "timeZone": "America/Los_Angeles",       // the spreadsheet's time zone (dates are formatted in it)
  "meta": { "rows": { "bets": 19, "shadow": 710, "grok": 153, "decisions": 123, "pinnacle": 24, "rules": 10 },
            "redactions": 0, "missingHeaders": [],
            "cached": false,                // true when this JSON came from the script's response cache
            "cacheTtlSeconds": 300 },       // how long a read of the sheet is reused
  "tabs": {
    "bets":      { "columns": ["row", "id", "date", ...], "rows": [[2, 1, "2026-10-02", ...], ...] },
    "shadow":    { "columns": [...], "rows": [...] },
    "grok":      { "columns": [...], "rows": [...] },
    "decisions": { "columns": [...], "rows": [...] },
    "pinnacle":  { "columns": [...], "rows": [...] },
    "rules":     ["2. <rule text>", "..."]
  }
}
```

Value rules: dates `YYYY-MM-DD` (sheet time zone), times `HH:mm`, percentages as fractions (`0.597`),
prices and units as numbers, empty cells `null`, text trimmed. Each row also carries `row` (the sheet row
number) as its first column, so the app can say "Sombra fila 412" the way `Decisiones` does.

Whitelist (header in the sheet → key in the feed). Keys are English; the sheet's headers and text stay
as they are:

**Apuestas** (`bets`): ID→`id`, Fecha→`date`, Liga→`league`, Partido→`match`, Tipo→`type`,
Mercado→`market`, Pick→`selection`, Cuota→`price`, Stake (u)→`stakeU`, Casa→`book`, Prob.
modelo→`probModel`, Cuota justa→`fairOdds`, EV→`ev`, Confianza→`confidence`, Estado→`status`, Resultado
partido→`result`, Ganancia (u)→`profitU`, Notas/lección→`notes`, Cuota cierre→`closePrice`, CLV→`clv`,
Excepción favoritos→`favoritesException`, Stake máx. (u)→`maxStakeU`, Prob. blend→`probBlend`, Prob.
modelo últ. 5→`probLast5`, Prob. IA Sofascore→`probAI`.
Never: `Stake (COP)`, `Ganancia (COP)`, `Bank acumulado (COP)`.

**Sombra** (`shadow`): Fecha→`date`, Liga→`league`, Partido→`match`, Mercado→`market`,
Selección→`selection`, Cuota→`price`, Cuota cierre→`closePrice`, Prob. modelo→`probModel`, Prob.
blend→`probBlend`, EV blend→`evBlend`, Cuota justa→`fairOdds`, Motivo de descarte→`reason`,
Estado→`status`, Notas→`notes`, Prob. IA Sofascore→`probAI`.

**Grok** (`grok`): Fecha→`date`, Hora→`time`, Liga→`league`, Partido→`match`, Mercado→`market`,
Selección→`selection`, Cuota→`price`, Cuota mín. Grok→`minPrice`, Stake Grok (u)→`stakeU`, Motivo
Grok→`reason`, Nuestro veredicto→`verdict`, Estado→`status`, Resultado→`result`, Notas→`notes`.

**Decisiones** (`decisions`): Fecha→`date`, Tema→`topic`, Decisión→`decision`, Motivo y
evidencia→`evidence`, Cómo y cuándo se revisa→`review`, Estado→`status`.

**Pinnacle** (`pinnacle`): `id`, `sport_key`, `league`, `kickoff_utc`, `kickoff_bogota`, `home`, `away`,
`open_1`, `open_x`, `open_2`, `open_read_utc`, `last_1`, `last_x`, `last_2`, `last_read_utc`,
`mins_before_kickoff`, `api_last_update` (same keys). Never the status cells to the right (credits, last run).

**Reglas** (`rules`): the numbered rule lines as an array of strings, without rule 1.

A whitelisted header that is missing from the sheet is listed in `meta.missingHeaders` (as
`Tab!Header`; a missing tab as `Tab`) and its key is `null` in every row; the app shows a banner instead of
failing. A script error is answered as `{ "schema": 1, "error": "…" }` and the app shows it.

Value conversion details (Apps Script `getValues()` types): `Date` cells are formatted in the spreadsheet
time zone; time-only cells (Grok `Hora`) arrive as 1899 dates and become `HH:mm`; date serials and
`d/m/Y` text become `YYYY-MM-DD`; percentage cells arrive as fractions; numbers stored as text are parsed
(`"+2.74"` → 2.74, `"59.70%"` → 0.597, `"1,91"` → 1.91); a probability written as `59.7` becomes 0.597; a
numeric cell holding money text (`$…`, `COP`, `pesos`) becomes `null` and counts as a redaction.
Pinnacle's `*_utc` cells stay ISO text (a `Date` becomes ISO UTC) and `kickoff_bogota` stays `YYYY-MM-DD HH:mm`.

### Abuse and limits

The web app URL is public ("anyone can access") and every call runs under the owner's Apps Script quota
(about 30 simultaneous executions per user, plus a daily total runtime). To keep a burst of requests from
reading the sheet over and over:

- `doGet` answers from `CacheService` for `cacheTtlSeconds` (300 s) and reads the sheet only on a miss. The
  JSON is stored in chunks (30,000 characters each, under the 100 KB value limit) with an index entry; a
  missing chunk is a miss; the cache keys carry the schema number. On a miss a script lock (`tryLock`,
  3 s) lets one call build while the others wait and re-check the cache; a caller without the lock builds
  anyway. Any cache or lock failure falls through to a fresh build.
- No request parameter bypasses the cache: `doGet` ignores them. So the app's refresh can return data up
  to 5 minutes old; the shell shows "sheet read at" (`generatedAt`) next to "last synced". The owner can
  force a fresh read by running `btFeedClearCache()` in the editor.
- Kill switch: Deploy → Manage deployments → archive the deployment (the URL stops at once), create a new
  deployment, put the new URL in `src/config.js`, push. The installed app keeps showing its cached copy
  meanwhile.

## 4. The unified `Pick`

`normalize.js` turns the three bet tabs into one array. Every feature works on `Pick[]`.

```ts
type Source = 'bets' | 'shadow' | 'grok';   // tabs Apuestas, Sombra, Grok
type Status = 'won' | 'lost' | 'void' | 'half_won' | 'half_lost' | 'pending' | 'other';

interface Pick {
  uid: string;            // `${source}:${row}`
  source: Source;
  row: number;            // sheet row
  date: string;           // YYYY-MM-DD, the match (slate) date
  time: string | null;    // Grok only
  league: string;
  match: string;
  marketRaw: string;      // as written
  market: MarketFamily;   // normalized, see below
  selection: string;
  price: number | null;
  closePrice: number | null;
  status: Status;
  statusRaw: string;
  tag: TagId;             // category, section 5
  tagRaw: string;         // the text the tag was read from
  books: string[];        // books named for the taken price; bets: [book]
  stakeU: number | null;  // real stake (bets), Grok's suggested stake (grok), null (shadow)
  profitU: number | null; // bets: the sheet's Ganancia (u); others: null (computed by simulate.js)
  probModel: number | null;
  probBlend: number | null;  // for VALOR rows this column holds the consensus fair probability
  probAI: number | null;
  ev: number | null;         // the EV the row was logged with
  fairOdds: number | null;
  clv: number | null;        // price / closePrice − 1 when both exist
  fairCloseEv: number | null;// price × de-vigged closing probability − 1, when the close has both sides
  closeSource: 'same_book' | 'feed' | null;
  notes: string;
  parsed: ParsedNotes;       // section 6
}
```

`MarketFamily`: `result` (1X2, doble oportunidad, DNB, hándicap, 1er tiempo), `goals` (totales, BTTS,
goles equipo), `corners_total`, `corners_team`, `cards_total`, `cards_team`, `shots` (tiros, tiros al
arco, equipo o partido), `combo` (dobles, builders), `other`. The raw text is always kept and shown.

Status mapping: `Ganada`→won, `Perdida`→lost, `Nula`/`Push`/`Devuelta`/`Anulada`→void, `Medio ganada`
(also `Media ganada`)→half_won, `Medio perdida` (also `Media perdida`)→half_lost, `Pendiente` or
empty→pending, anything else→other (shown, never counted). The sheet writes **Medio** ganada/perdida
(betting-analyst, Grading; review.py), not *Media*.

Fields added to the Pick by the foundation (see `src/data/types.d.ts`): `reviewClass` (review.py's market
groups: result, goals, corners, team_corners, cards, shots — the frozen tests use these, not
`MarketFamily`), `side` (over / under / ''), `extra` (source-specific fields: Apuestas `type`, `confidence`,
`result`, `freeBet`…; Grok `verdict`, `reason`, `minPrice`, `result`) and the measures `clvSource`,
`openingFairEv`, `closeMargin`, `evVsFeed`, `need`, `hasTwoSidedClose` (section 6).

Fields added with the line filter (`src/data/lines.js`, called from `normalize.js`):

- `line: number | null`: the line of the selection (4.5, 9.5, 2.75; signed for Asian handicaps: 0.25, −1).
- `lineKey: string | null`: `<scope>:<over|under>:<value>` for totals (`cards:under:4.5`,
  `corners_team:over:5.5`, `goals:under:2.75`) and `ah:<signed value>` for Asian handicaps (`ah:+0.25`,
  `ah:-1`, `ah:0`). The scope keeps the same words apart when they are different bets ("Under 4.5" cards
  vs team corners): `cards`, `cards_team`, `corners`, `corners_team`, `goals`, `goals_team`, `goals_1h`,
  `shots`, `shots_team`, `sot`, `sot_team`, `ah`. It comes from the market family and the raw market
  (`Tiros al arco …` → `sot`, `… equipo` → `_team`, `Goles 1er tiempo` → `goals_1h`).
- Read from the selection: the first `Over|Under|Más de|Menos de <number>` (any case, comma decimals),
  so `Fürth over 4.5`, `Club X córners Over 5.5`, `Over 13.5 (tomada al descanso con 9)`, `Under 3 asiático`
  and `X Over 0.5 goles` all parse; for `Hándicap asiático`, the last signed number (`Vélez +0.25`).
- No line (`null`): result markets other than the handicap (1X2, doble oportunidad — `Tucumán X2 (+0.5)`
  included —, DNB, 1er/2.º tiempo), BTTS, correct score, scorers, `Más córners`/`Córners 1X2`/`Tarjetas
  1X2`/`Más tarjetas` (three-way, no line), combos (Apuestas `Doble` / `Crear apuesta`, markets with
  `+`/`×`, selections with `×` or ` + `).
- `side` is unchanged: review.py's `side()` on the selection (over / under / ''), which the frozen tests
  use. On every total it agrees with the kind in `lineKey`; a handicap has side '' and kind `ah`. Known
  quirk kept for review.py parity: `X con más córners` (Grok, `Córners 1X2`) has side `over`.
- Labels are built with `t()` (`lineLabel(key)` → "Under 4.5", "Hándicap +0.25"; `{ scope: true }` →
  "Tarjetas: Under 4.5").

Shapes of the real sheet (read only, `Sombra!D:E`, `Grok!E:F`, `Apuestas!F:G`, 15 Nov 2026): every
selection in a totals, team-totals or handicap market has one of the shapes above, so none failed to give
a line; every shape has a synthetic copy in `tests/unit/lines.test.mjs`.

Definitions that follow review.py rather than the first draft of this contract:

- `fairCloseEv` is review.py's *price-vs-close EV* (`pvc`): `price × p − 1` with p the proportionally
  de-vigged close at the row's own book when the notes have a two-sided clv-logger close there, otherwise
  the two-sided bet365 feed close. This is the measure of the frozen tests.
- `clv` is raw CLV at the **same source** (opening / close − 1): own book first, then the feed ("feed X" or
  the price itself when it is the feed's, against G or the noted feed close), then the IA-WATCH book
  opening. A book price is never compared with the bet365 close. Apuestas: only a close at the bet's book
  counts; rows whose close is noted "cierre: Sofascore/bet365" are cross-source (`extra.clvCrossSource`)
  and get `clv: null`.
- `closePrice`: Sombra G, else the own-book close in the notes; Apuestas V; Grok the own-book close, else
  the feed close.
- Grok `books`: the book whose price equals `Cuota` in the notes (review.py's price_source).

`MarketFamily` mapping of the raw `Mercado` values seen in the three tabs (15 Nov 2026): result = `1X2`,
`1X2 1er tiempo`, `1X2 2.º tiempo` / `1X2 2º tiempo`, `1X2 (pago anticipado 2 goles)`, `Doble
oportunidad`, `Empate no apuesta`, `Hándicap asiático`; goals = `Goles`, `Goles totales`, `Goles
(asiático)`, `Goles equipo`, `Goles 1er tiempo`, `BTTS`, `Ambos marcan`, `Ambos anotan`; corners_total =
`Córners totales`; corners_team = `Córners equipo`, `Córners 1X2`, `Más córners (equipo)`, `Más córners
2.º tiempo`; cards_total = `Tarjetas totales`; cards_team = `Tarjetas equipo`, `Tarjetas 1X2`, `Más
tarjetas (3 vías)`; shots = `Tiros (equipo)`, `Tiros al arco (equipo)`, `Tiros (total)`, `Tiros totales`,
`Tiros equipo`, `Tiros al arco equipo`, `Tiros al arco (total)`, `Tiros al arco totales`; combo = Apuestas
rows of type `Doble` or `Crear apuesta`, and markets joined with `+`/`×` (`Goles + córners`); other =
`Marcador correcto`, `Primer goleador` and anything unknown.

## 5. Tags

Tag ids are English; the text they are matched against is the sheet's Spanish. The UI shows the sheet's
own label (VALOR CASI, TARJETAS UNDER…) because that is what Juan reads every day.

The category of a row. For `Sombra` it is read from the start of `Motivo de descarte`; first match wins,
in this order:

| TagId | Starts with / contains | Meaning in one line |
|---|---|---|
| `published_bet` | `PUBLICADA Y APOSTADA` | published pick Juan did bet (also in Apuestas; left out of Sombra stats) |
| `published` | `PUBLICADA, NO APOSTADA` | published pick he did not bet |
| `prop_near_value` | `VALOR PROP CASI` | corners/cards total 0–3% over the consensus fair price |
| `prop_value` | `VALOR PROP` | corners/cards total 3%+ over the consensus fair price, no model |
| `near_value` | `VALOR CASI` | result/goals 0–3% over the fair price |
| `value` | `VALOR` | result/goals 3%+ over the fair price |
| `cards_under` | `TARJETAS UNDER` | model card-under test |
| `team_corners` | `CÓRNERS EQUIPO` | team-corners test |
| `corner_rejects` | `CÓRNERS RECHAZO` | corner rejects priced 1.70–2.0 |
| `model_only_shots` | `MODELO SOLO` | model-only shots pick |
| `shadow_rule30` | `SHADOW` and (`regla 30` or `pasó todos los filtros`) | passed every filter, held by the rule 30 pause (also the early forms `SHADOW: córners pausados (regla 30)`) |
| `shadow` | `SHADOW` | other shadow picks (new market, short sample) |
| `ai_watch` | `IA-WATCH` | Sofascore AI watch rows (stopped) |
| `low_edge` | `Pasó todos los filtros` / `Stake <` | passed the filters but the stake fell under the 0.25u minimum (early rows; 4 on 15 Nov 2026) |
| `filter_reject` | anything else | rejected by a filter (Filtro 4/5, regla 23, brecha, ratio, muestra, razor, `SKIP`, `Salto`…) |

Matching is on the start of the text, upper-cased (as review.py does): a row whose reason starts with the
filters and mentions `SHADOW` later (an early format) is `filter_reject`. `VALOR:` needs the colon so that
`VALOR CASI` and `VALOR PROP` never land in `value`.

Every model row (review.py's `is_model`: not IA-WATCH, not price-first, not published; MODELO SOLO
excluded) gets `parsed.filters: string[]` from review.py's REASONS — `gap`, `ratio`, `sample`, `razor`,
`filter4`, `filter5`, `rule1`, `rule18`, `rule23` — plus `low_stake`; the reason text is joined with the
reason tags older rows kept in the notes (`también F-gap; filtro 5`). `Apuestas` rows get tag `bet`;
`Grok` rows get `grok_priced` / `grok_not_priced` from `Nuestro veredicto` (`Cotizado…` / `No
cotizado…`), and `grok_other` when it is empty.

**Inventory of the real sheet (read only, 15 Nov 2026; counts, no data).** Sombra rows 2–711 (710 rows;
Estado: Ganada, Perdida, Nula, Pendiente). Grok rows 2–154 (Estado: Ganada, Perdida, Nula, Medio perdida;
the verdict column starts `Cotizado`, `Cotizado (regla 29)` or `No cotizado`, except four October rows: three `Mercado primero (regla 29)…` / `Mercado primero: …`, classified as priced by rule 29, and one `Marcador exacto no cotizado; …`, classified as not priced; audit, 15 Nov 2026). Apuestas rows 2–20
(Estado: Ganada, Perdida, Nula). Decisiones rows 2–125 (123 decisions in the feed; Estado: Vigente,
Provisional, Abierta, Reemplazada). Pinnacle: 24 rows (columns A–Q; an earlier draft of the example
above said 240). Every one of the 710 `Motivo de descarte` values classifies as intended with the table
above; the prefixes found were the ones listed plus these filter-reject shapes: `F-gap…`, `F-sample…`,
`razor…`, `rule 3 razor…`, `Regla 1…`, `regla 1; …`, `Filtro 4…`/`filtro 4…`/`filter 4…`, `filtro 5…`,
`Muestra (…)`, `Brecha …`, `SKIP: …`, `SKIP (relleno): …`, `Salto: …`, and `CÓRNERS EQUIPO (SHADOW, pasó
todos los filtros)` (team corners). One early filter-reject row notes in its reason that Juan also bet it
(it is also in Apuestas); it is not tagged `published_bet`.

The parser must classify every real row: the foundation task reads `Sombra!L:L` (read only) and checks
that nothing unexpected lands in `filter_reject`. `betting-review`'s `review.py` is the reference for how reviews
group rows; where the two disagree, match `review.py` and note it here.

## 6. Parsed notes

`notes.js` reads these from `Notas` (all optional, `null` when absent). Formats come from the
betting-analyst skill:

| Field | Example in the sheet |
|---|---|
| `feedPrice` | `feed 1.83` |
| `feedOpen`, `feedOpenOther`, `feedOpenFlipped` | `apertura feed 1.833 (otro lado 1.950)`, `…; invertida?)` |
| `ref` (`feed` / `books` / `one_book` / `consensus`) and `refBooks` | `ref feed`, `ref 2 casas (Stake, Betsson)`, `ref 1 casa`, `ref consenso 3 fuentes` |
| `sample` (`10+` / `6-9`) | `muestra 10+`, `muestra 6–9` |
| `fuerza` (`keeps` / `rejects` / `na`; sheet words MANTIENE / RECHAZA), `fuerzaExpected`, `fuerzaProb` | `FUERZA: esperado 3.11, prob 37.1%, RECHAZA (…)` |
| `pin` (`{home, draw, away, readUtc, id}`) or `pinMissing` | `pin 3.54/3.76/2.00 (2026-11-13T22:05:00Z) \| pin id 0380…`, `pin n/d (sin partido)` |
| `open1x2` | `1X2 apertura feed 1.80/3.50/4.20` |
| `close` (`{price, source, book, others, triple}`) | `cierre: Sofascore/bet365 1.80 (otro lado 1.91)`; three-way `… 1.68 (1 4.75 / X 3.70 / 2 1.68)`; double chance `… (1X2 a/b/c)`; one-sided `cierre: Sofascore/bet365 7` (no fair-close EV) |
| `closeMissing` | `cierre feed: sin línea 4.5 (feed sin mercado de tarjetas)` |
| `bookCloses` (`{[book]: {close, others, triple}}`), `loggerClv`, `loggerClvBook`, `loggerEv`, `loggerEvOtherBook` | clv-logger: `Cierre Betano 2.42 (X 3.2, 2 3.0); Betsson …; 13 nov 14:23 6 min antes \| CLV +2.07% vs Betano \| EV justa -3.63%` (Grok writes `CLV … vs Cuota (Betano)`; `EV justa … (otro lado de Betsson)` is the lower-quality other-book figure) |
| `bookPrices` (`{book, price, other, unavailable}[]`) | `Betano 1.82 \| Betsson 1.78 (over 1.9) \| Stake sin línea`, before any close segment |
| `priceSource` | where the price came from: `feed` (`Precio feed Sofascore…`, `bet365 feed`, IA-WATCH) or a book (`Precio Betano`, the VALOR book, the book whose noted price equals F) |
| `modelMean`, `aiMean`, `singleSource` | `media modelo 9.83`, `IA media 9`, `una sola fuente` |
| `passedAll` | `pasó todos los filtros` in the reason or the notes (review.py's passed_all) |

`fairCloseEv` uses the same-book close when the row has one and the bet365 feed close otherwise, de-vigged
with both sides, exactly as `milestone-reviewer` describes. A row without both sides has `null`.

## 7. Formulas (single source: `src/data/stats.js`)

- Flat profit of a graded pick at stake `s`: won `s × (price − 1)`, lost `−s`, void `0`,
  half_won `s × (price − 1) / 2`, half_lost `−s / 2`.
- Yield = total profit / total staked, over graded picks (won, lost, void, halves). Voids count as staked.
  Graded picks without a price are left out (counted as `unpriced`); `PUBLICADA Y APOSTADA` rows are left
  out of every Sombra figure (they are in Apuestas).
- Hit rate = wins / (wins + losses) where a half win adds 0.5 to wins and a half loss 0.5 to losses.
- Break-even hit rate: the mean of `1 / price` over the graded picks (review.py), which equals `1 / p` when
  every price is the same.
- Means of per-row measures (CLV, fair-close EV) are reported with `n`, the SE **clustered by match**
  (rows with the same date + match form one cluster, milestone-reviewer's formula), ±2 SE and z. The flat
  yield's SE is the plain SD of per-pick profit / √n (review.py's plain_se).
- CLV = `price / closePrice − 1`. Fair-close EV as above. Means are reported with `n` and ± 2 standard errors.
- Drawdown: peak-to-trough of the cumulative curve, in units and as % of the bankroll in Settings.
- Real bets (`Apuestas`): profit is the sheet's `Ganancia (u)` (it knows about free bets and odd
  settlements); the app only recomputes it in the Simulator.
- Never show a rate over fewer than 5 graded picks without its `n` next to it.

### Deliberate differences from `review.py`

- **Market breakdowns include VALOR PROP rows.** The app's breakdowns by market (Overview "Sombra por
  mercado", Analysis and Simulator by market) group every row the filters let through, VALOR PROP and
  VALOR PROP CASI included. `review.py`'s "BY MARKET" block leaves both out (`not (is_vprop(r) or
  is_vprop_c(r))`), so the app's corners-total and cards-total rows can show a few more picks than the
  review. Filter out the two tags to get the review's numbers.
- **The real-bets yield counts a free bet's stake as staked.** `summarize(bets, { profit: 'sheet' })` takes
  the profit from the sheet's `Ganancia (u)` (which knows the free bet returns no stake) but adds the row's
  `Stake (u)` to the staked total like any other bet, so a free bet lowers the yield a little compared with
  a yield that leaves free-bet stakes out.

## 8. Derived data used by the screens (added with the integration pass)

- **Exact breakdown links** (`src/data/analysis.js`): `rowPatch(f, dim, key, ctx)` narrows a list field to
  the key or intersects a range (dates, model probability, logged EV, price) with the current filter;
  `exactRowFilter` / `exactCellFilter` add `exactSlice` (graded, no PUBLICADA Y APOSTADA, priced) and then
  check that the link's picks are exactly the row's counted picks, returning `null` otherwise (weekday;
  a second book or reason of a pick filtered by another one). The `line` dimension groups by `lineKey`
  in line order.
- **Decision themes** (`src/data/decisions.js` `decisionTheme`, `decisionThemeMatch`): narrow topic
  shapes first (scripts, audits, closing tasks, the Sofascore AI, backtests, the value scan, rule 25,
  topics that start with "Prueba"), then the broad patterns, then an explicit workflow pattern; the
  decision text only when the topic matches nothing, and the catch-all (`by: 'fallback'`) only when
  neither does. Checked on every real topic (`Decisiones!B:B`, read only, 15 Nov 2026: none reached the
  catch-all); unit tests use synthetic topics of the same shapes. `THEME_IDS` is a fixed display order.
- **Staking rules** (Reglas tab, numbered lines): `sheetRuleSlug(line, n)` links by rule number when the
  line still has that rule's keyword (`SHEET_RULE_BY_N`, from the real lines 2–11, read only from
  `Reglas!A8:A40` by the polish pass; the text is not copied. Any later read starts at row 10,
`Reglas!A10:A40`: rule 1, which states the unit value, sits above it), else by keyword, else the "Reglas (pestaña)" entry.
- **Rules content** (`src/content/rules.*.json`): every rule has `short`, one plain sentence without
  jargon ("En corto"), shown first; a unit test keeps it one sentence and free of jargon and money.
- **Inline term links** (`src/data/content.js` `buildTermIndex`, `linkTerms`): the glossary's terms and
  aliases (whole terms first, then "Term (other name)" parts and aliases; first entry in the file wins);
  capitalised sheet words (DNB, VALOR CASI) match as written, the rest without case or accents; common
  words are skipped (`TERM_SKIP`); the first occurrence per paragraph is linked. Tokens only.
