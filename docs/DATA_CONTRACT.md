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
| `Reglas` | partly | only the numbered rule lines, and never rule 1 (it states the unit value and the bank) |
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
4. After the JSON is built the script searches the whole string for `COP` and `$`; a hit means a bug:
   the cell is scrubbed and counted in `meta.redactions`.
5. Units are fine (`Stake (u)`, `Ganancia (u)`, `Stake máx. (u)`): they say nothing about the bankroll.
6. The repository holds no sheet data. Fixtures are synthetic: invented teams and results, real formats.
7. `tests/unit/privacy.test.mjs` runs the scrubber on a fixture that has money in every shape above, in
   headers and in text, and fails if any of it survives. It also greps the repo for money patterns (the made-up examples in this file are the only allowed ones).

Scrubbing free text is best effort: a sentence such as "tengo cuatro millones" would pass. The audit step
reads the live feed for that; the durable fix is to not write balances in notes.

## 3. Feed JSON (schema 1)

`GET <web app URL>` returns `application/json`:

```jsonc
{
  "schema": 1,
  "generatedAt": "2026-11-15T16:00:00Z",
  "meta": { "rows": { "apuestas": 19, "sombra": 700, "grok": 160, "decisiones": 124, "pinnacle": 240 },
            "redactions": 0, "missingHeaders": [] },
  "tabs": {
    "apuestas":   { "columns": ["id", "fecha", ...], "rows": [[1, "2026-10-02", ...], ...] },
    "sombra":     { "columns": [...], "rows": [...] },
    "grok":       { "columns": [...], "rows": [...] },
    "decisiones": { "columns": [...], "rows": [...] },
    "pinnacle":   { "columns": [...], "rows": [...] },
    "reglas":     ["2. Stake entre 0,25u y 2u por apuesta.", "..."]
  }
}
```

Value rules: dates `YYYY-MM-DD` (sheet time zone), times `HH:mm`, percentages as fractions (`0.597`),
prices and units as numbers, empty cells `null`, text trimmed. Each row also carries `row` (the sheet row
number) as its first column, so the app can say "Sombra fila 412" the way `Decisiones` does.

Whitelist (header in the sheet → key in the feed):

**Apuestas**: ID→`id`, Fecha→`fecha`, Liga→`liga`, Partido→`partido`, Tipo→`tipo`, Mercado→`mercado`,
Pick→`pick`, Cuota→`cuota`, Stake (u)→`stakeU`, Casa→`casa`, Prob. modelo→`probModelo`, Cuota
justa→`cuotaJusta`, EV→`ev`, Confianza→`confianza`, Estado→`estado`, Resultado partido→`resultado`,
Ganancia (u)→`gananciaU`, Notas/lección→`notas`, Cuota cierre→`cuotaCierre`, CLV→`clv`, Excepción
favoritos→`excepcion`, Stake máx. (u)→`stakeMaxU`, Prob. blend→`probBlend`, Prob. modelo últ.
5→`probUlt5`, Prob. IA Sofascore→`probIA`.
Never: `Stake (COP)`, `Ganancia (COP)`, `Bank acumulado (COP)`.

**Sombra**: Fecha→`fecha`, Liga→`liga`, Partido→`partido`, Mercado→`mercado`, Selección→`seleccion`,
Cuota→`cuota`, Cuota cierre→`cuotaCierre`, Prob. modelo→`probModelo`, Prob. blend→`probBlend`, EV
blend→`evBlend`, Cuota justa→`cuotaJusta`, Motivo de descarte→`motivo`, Estado→`estado`, Notas→`notas`,
Prob. IA Sofascore→`probIA`.

**Grok**: Fecha→`fecha`, Hora→`hora`, Liga→`liga`, Partido→`partido`, Mercado→`mercado`,
Selección→`seleccion`, Cuota→`cuota`, Cuota mín. Grok→`cuotaMin`, Stake Grok (u)→`stakeU`, Motivo
Grok→`motivo`, Nuestro veredicto→`veredicto`, Estado→`estado`, Resultado→`resultado`, Notas→`notas`.

**Decisiones**: Fecha→`fecha`, Tema→`tema`, Decisión→`decision`, Motivo y evidencia→`motivo`, Cómo y
cuándo se revisa→`revision`, Estado→`estado`.

**Pinnacle**: `id`, `sport_key`, `league`, `kickoff_utc`, `kickoff_bogota`, `home`, `away`, `open_1`,
`open_x`, `open_2`, `open_read_utc`, `last_1`, `last_x`, `last_2`, `last_read_utc`,
`mins_before_kickoff`, `api_last_update` (same keys). Never the status cells to the right (credits, last run).

A whitelisted header that is missing from the sheet is listed in `meta.missingHeaders` and its key is
`null` in every row; the app shows a banner instead of failing.

## 4. The unified `Pick`

`normalize.js` turns the three bet tabs into one array. Every feature works on `Pick[]`.

```ts
type Source = 'apuestas' | 'sombra' | 'grok';
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
  books: string[];        // books named for the taken price; Apuestas: [casa]
  stakeU: number | null;  // real stake (apuestas), Grok's suggested stake (grok), null (sombra)
  profitU: number | null; // apuestas: the sheet's Ganancia (u); others: null (computed by simulate.js)
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

Status mapping: `Ganada`→won, `Perdida`→lost, `Nula`/`Push`/`Devuelta`→void, `Media ganada`→half_won,
`Media perdida`→half_lost, `Pendiente` or empty→pending, anything else→other (shown, never counted).
The foundation task lists every distinct `Estado` in the three tabs and extends this table if needed.

## 5. Tags

The category of a row. For `Sombra` it is read from the start of `Motivo de descarte`; first match wins,
in this order:

| TagId | Starts with / contains | Meaning in one line |
|---|---|---|
| `publicada_apostada` | `PUBLICADA Y APOSTADA` | published pick Juan did bet (also in Apuestas; left out of Sombra stats) |
| `publicada` | `PUBLICADA, NO APOSTADA` | published pick he did not bet |
| `valor_prop_casi` | `VALOR PROP CASI` | corners/cards total 0–3% over the consensus fair price |
| `valor_prop` | `VALOR PROP` | corners/cards total 3%+ over the consensus fair price, no model |
| `valor_casi` | `VALOR CASI` | result/goals 0–3% over the fair price |
| `valor` | `VALOR` | result/goals 3%+ over the fair price |
| `tarjetas_under` | `TARJETAS UNDER` | model card-under test |
| `corners_equipo` | `CÓRNERS EQUIPO` | team-corners test |
| `corners_rechazo` | `CÓRNERS RECHAZO` | corner rejects priced 1.70–2.0 |
| `modelo_solo_tiros` | `MODELO SOLO` | model-only shots pick |
| `shadow_r30` | `SHADOW (pasó todos los filtros, regla 30)` | passed every filter, held by the rule 30 pause |
| `shadow` | `SHADOW` | other shadow picks (new market, short sample) |
| `ia_watch` | `IA-WATCH` | Sofascore AI watch rows (stopped) |
| `filtro` | anything else | rejected by a filter (Filtro 4/5, regla 23, brecha, ratio, muestra, razor…) |

`filtro` rows also get `parsed.filters: string[]` (`filtro4`, `filtro5`, `regla23`, `brecha`, `ratio`,
`muestra`, `razor`, …) so the Explorer can filter by reason. `Apuestas` rows get tag `apuesta`; `Grok`
rows get `grok_cotizado` / `grok_no_cotizado` from `Nuestro veredicto`.

The parser must classify every real row: the foundation task reads `Sombra!L:L` (read only) and checks
that nothing unexpected lands in `filtro`. `betting-review`'s `review.py` is the reference for how reviews
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
| `fuerza` (`mantiene` / `rechaza` / `na`), `fuerzaExpected`, `fuerzaProb` | `FUERZA: esperado 3.11, prob 37.1%, RECHAZA (…)` |
| `pin` (`{home, draw, away, readUtc, id}`) or `pinMissing` | `pin 3.54/3.76/2.00 (2026-11-13T22:05:00Z) \| pin id 0380…`, `pin n/d (sin partido)` |
| `open1x2` | `1X2 apertura feed 1.80/3.50/4.20` |
| `close` (`{price, source, book, other}`) | `cierre: Sofascore/bet365 1.83`, plus the other side's close when logged |
| `bookPrices` (`{book, price, other}[]`) | each book's price for the line, when written |

`fairCloseEv` uses the same-book close when the row has one and the bet365 feed close otherwise, de-vigged
with both sides, exactly as `milestone-reviewer` describes. A row without both sides has `null`.

## 7. Formulas (single source: `src/data/stats.js`)

- Flat profit of a graded pick at stake `s`: won `s × (price − 1)`, lost `−s`, void `0`,
  half_won `s × (price − 1) / 2`, half_lost `−s / 2`.
- Yield = total profit / total staked, over graded picks (won, lost, void, halves). Voids count as staked.
- Hit rate = won / (won + lost); halves count 0.5.
- Break-even hit rate at average price `p`: `1 / p`.
- CLV = `price / closePrice − 1`. Fair-close EV as above. Means are reported with `n` and ± 2 standard errors.
- Drawdown: peak-to-trough of the cumulative curve, in units and as % of the bankroll in Settings.
- Real bets (`Apuestas`): profit is the sheet's `Ganancia (u)` (it knows about free bets and odd
  settlements); the app only recomputes it in the Simulator.
- Never show a rate over fewer than 5 graded picks without its `n` next to it.
