// Writes tests/fixtures/feed.json: a synthetic feed (schema 1) with invented teams, leagues and
// results, in the real formats of the sheet's tags and notes. Deterministic (seeded PRNG), so the
// file only changes when this script changes. Never put real sheet rows here.
//   node scripts/make-fixture.mjs
// To extend: add a template to SHADOW_TEMPLATES (or the bets / grok builders) and re-run.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');

// Column keys come from Feed.gs itself, so the fixture always matches the script.
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'apps-script/Feed.gs'), 'utf8'), ctx);
const TABS = vm.runInContext('BT_FEED_TABS', ctx);
const keys = (tab) => TABS[tab].columns.map((c) => c[1]);

// ---------------------------------------------------------------- seeded randomness
let seed = 20261115;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + rand() * (b - a);
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const r4 = (x) => Math.round(x * 10000) / 10000;
const chance = (p) => rand() < p;

const LEAGUES = ['Liga Austral', 'Primera Boreal', 'Segunda Litoral', 'Copa Meridiano', 'Liga Femenil Delta', 'Superliga Andina'];
const TEAMS = [
  'Atlético Brisa', 'Deportivo Faro', 'Real Nébula', 'Club Ciruelo', 'Unión Granito', 'Sporting Vela', 'Racing Coral',
  'Independiente Ámbar', 'Olímpico Sauce', 'Estrella Polar', 'Juventud Arena', 'Ciudad Cobre', 'Rayo Índigo',
  'Defensores del Valle', 'Club Lince', 'Halcones FC', 'Marea Roja', 'Tormenta SC', 'Puerto Alto', 'Montaña Azul',
];
const BOOKS = ['Betano', 'Betsson', 'Stake'];

/** Dates from 2026-10-02 to 2026-11-15. */
const DAYS = [];
for (let d = new Date(Date.UTC(2026, 9, 2)); d <= new Date(Date.UTC(2026, 10, 15)); d.setUTCDate(d.getUTCDate() + 1)) {
  DAYS.push(d.toISOString().slice(0, 10));
}
const LAST = '2026-11-15';

function match() {
  const a = pick(TEAMS);
  let b = pick(TEAMS);
  while (b === a) b = pick(TEAMS);
  return { home: a, away: b, name: `${a} vs ${b}` };
}

/** Status: mostly graded; the last day pending. */
function status(date, pWin) {
  if (date >= LAST) return 'Pendiente';
  const u = rand();
  if (u < 0.03) return 'Nula';
  return rand() < pWin ? 'Ganada' : 'Perdida';
}
const other = (price) => r2(1 / Math.max(0.05, 1.06 - 1 / price));

// ---------------------------------------------------------------- Sombra
/**
 * Each template returns { market, selection, price, reason, notes(ctx) } and how many rows to make.
 * ctx gives the close: notes builders append the grading note when the row is graded.
 */
const SHADOW_TEMPLATES = [
  { n: 22, kind: 'value', since: '2026-10-10' },
  { n: 18, kind: 'near_value', since: '2026-10-20' },
  { n: 10, kind: 'prop_value', since: '2026-11-06' },
  { n: 8, kind: 'prop_near_value', since: '2026-11-06' },
  { n: 16, kind: 'cards_under', since: '2026-11-01' },
  { n: 16, kind: 'team_corners', since: '2026-10-15' },
  { n: 8, kind: 'corner_rejects', since: '2026-11-09' },
  { n: 10, kind: 'model_only_shots', since: '2026-10-25' },
  { n: 18, kind: 'shadow_rule30', since: '2026-10-13' },
  { n: 12, kind: 'shadow', since: '2026-10-05' },
  { n: 10, kind: 'ai_watch', since: '2026-10-12', until: '2026-11-01' },
  { n: 6, kind: 'published', since: '2026-10-11' },
  { n: 2, kind: 'published_bet', since: '2026-10-11' },
  { n: 3, kind: 'low_edge', since: '2026-10-02', until: '2026-10-12' },
  { n: 26, kind: 'filter_reject', since: '2026-10-02' },
];

function feedClose(price, sel, threeWay) {
  const close = r2(price * between(0.9, 1.08));
  if (threeWay) {
    // the other two outcomes share what is left of a ~106% book
    const rest = Math.max(0.2, between(1.05, 1.08) - 1 / close);
    const share = between(0.35, 0.6);
    const b = r2(1 / (rest * share));
    const a = r2(1 / (rest * (1 - share)));
    return { close, text: `cierre: Sofascore/bet365 ${close.toFixed(2)} (1 ${close.toFixed(2)} / X ${b.toFixed(2)} / 2 ${a.toFixed(2)})` };
  }
  return { close, text: `cierre: Sofascore/bet365 ${close.toFixed(2)} (otro lado ${other(close).toFixed(2)})` };
}

function loggerClose(book, price, lineTag) {
  const close = r2(price * between(0.9, 1.06));
  const oth = other(close);
  const clv = (price / close - 1) * 100;
  const p = (1 / close) / (1 / close + 1 / oth);
  const ev = (price * p - 1) * 100;
  return {
    close,
    text: `Cierre ${book} ${close.toFixed(2)} (${lineTag} ${oth.toFixed(2)}); ${pick(BOOKS.filter((b) => b !== book))} sin línea; 14 nov 18:52 7 min antes | CLV ${clv >= 0 ? '+' : ''}${clv.toFixed(2)}% vs ${book} | EV justa ${ev >= 0 ? '+' : ''}${ev.toFixed(2)}%`,
  };
}

function shadowRow(kind, date) {
  const m = match();
  const league = pick(LEAGUES);
  const book = pick(BOOKS);
  const books2 = BOOKS.filter((b) => b !== book);
  let market, selection, price, probModel = null, probBlend, evBlend, fairOdds, reason, notes = [], probAI = null;
  let threeWay = false;
  let closeKind = pick(['feed', 'feed', 'feed', 'logger', 'none', 'one_sided']);
  const line = pick([8.5, 9.5, 10.5]);
  const cardLine = pick([3.5, 4.5, 5.5]);
  const sideOU = pick(['Over', 'Under']);
  const feedP = () => r3(price * between(0.93, 1.0));

  switch (kind) {
    case 'value':
    case 'near_value': {
      const one = chance(0.6);
      market = one ? '1X2' : pick(['Goles', 'Doble oportunidad', 'Ambos marcan']);
      threeWay = market === '1X2';
      selection = market === '1X2' ? `${m.home} gana` : market === 'Goles' ? `${sideOU} 2.5` : market === 'Ambos marcan' ? 'Sí' : `1X (${m.home} o empate)`;
      price = r2(between(1.7, kind === 'value' ? 5.5 : 3.2));
      if (chance(0.15)) price = r3(price + 0.003);
      const edge = kind === 'value' ? between(0.03, 0.09) : between(0.002, 0.029);
      fairOdds = r3(price / (1 + edge));
      probBlend = r4(1 / fairOdds);
      probModel = r4(probBlend * between(0.8, 1.25));
      evBlend = r4(edge);
      const tag = kind === 'value' ? 'VALOR' : 'VALOR CASI';
      const twoBooks = kind === 'value' && chance(0.15) ? `${book}/${books2[0]}` : book;
      reason = `${tag}: ${twoBooks} ${price.toFixed(2)} vs justa ${fairOdds.toFixed(3)} (+${(edge * 100).toFixed(1)}%)`;
      notes.push(`${book} ${price.toFixed(2)}`, `${books2[0]} ${r2(price * 0.97).toFixed(2)}`, `${books2[1]} ${r2(price * 0.96).toFixed(2)}`, `feed ${feedP()}`);
      if (threeWay) notes.push(chance(0.7) ? `pin ${r2(price * 0.98)}/${r2(between(3, 4))}/${r2(between(2, 5))} (${date}T22:14:20Z) | pin id ${hex()}` : 'pin n/d (sin partido)');
      if (market === 'Doble oportunidad') closeKind = 'dc';
      probAI = chance(0.5) ? r4(probBlend * between(0.9, 1.1)) : null;
      break;
    }
    case 'prop_value':
    case 'prop_near_value': {
      const cards = chance(0.5);
      market = cards ? 'Tarjetas totales' : 'Córners totales';
      selection = `${sideOU} ${cards ? cardLine : line}`;
      price = r2(between(1.75, 2.6));
      const edge = kind === 'prop_value' ? between(0.03, 0.1) : between(0.005, 0.029);
      fairOdds = r3(price / (1 + edge));
      probBlend = r4(1 / fairOdds);
      evBlend = r4(edge);
      reason = `${kind === 'prop_value' ? 'VALOR PROP' : 'VALOR PROP CASI'}: ${book} ${price.toFixed(2)} vs justa ${fairOdds.toFixed(3)} (+${(edge * 100).toFixed(1)}%)`;
      const fo = feedP();
      notes.push(`feed ${fo} (${sideOU === 'Over' ? 'U' : 'O'}${cards ? cardLine : line} ${other(fo)})`, `${book} ${price.toFixed(2)} (${sideOU === 'Over' ? 'U' : 'O'}${cards ? cardLine : line} ${other(price)})`, `ref consenso 3 fuentes (bet365, ${book}, ${books2[0]})`);
      notes.push(chance(0.2) ? `apertura feed ${r3(fo * 1.05)} (otro lado ${r3(other(fo) * 0.95)}; invertida?)` : `apertura feed ${fo.toFixed(3)} (otro lado ${other(fo).toFixed(3)})`);
      closeKind = chance(0.8) ? 'feed' : 'missing';
      break;
    }
    case 'cards_under':
    case 'corner_rejects':
    case 'shadow_rule30': {
      const cards = kind === 'cards_under' || (kind === 'shadow_rule30' && chance(0.4));
      market = cards ? 'Tarjetas totales' : 'Córners totales';
      const sel = kind === 'cards_under' ? 'Under' : sideOU;
      const ln = cards ? (kind === 'cards_under' && chance(0.4) ? 4.5 : cardLine) : line;
      selection = `${sel} ${ln}`;
      price = r2(between(1.7, kind === 'corner_rejects' ? 2.0 : 2.6));
      probModel = r4(between(0.52, 0.7));
      probBlend = r4(probModel * 0.92);
      evBlend = r4(price * probBlend - 1);
      fairOdds = r3(1 / probBlend);
      const mean = r2(ln + (sel === 'Under' ? -between(0.3, 1.2) : between(0.3, 1.2)));
      const filt = pick(['razor', 'F-gap', 'F-gap, F-ratio', 'rule 3 razor; F-gap']);
      reason =
        kind === 'cards_under'
          ? `TARJETAS UNDER (modelo): ${filt}: modelo ${(probModel * 100).toFixed(1)}% vs mercado ${(probBlend * 90).toFixed(1)}% (media ${mean}, línea ${ln})`
          : kind === 'corner_rejects'
            ? `CÓRNERS RECHAZO ≤2.0: ${filt}: modelo ${(probModel * 100).toFixed(1)}% vs mercado ${(probBlend * 90).toFixed(1)}% (media ${mean}, línea ${ln})`
            : `SHADOW (pasó todos los filtros, regla 30): modelo ${(probModel * 100).toFixed(1)}% vs mercado ${(probBlend * 90).toFixed(1)}% (media ${mean}, línea ${ln})`;
      const fo = feedP();
      const refTag = pick(['ref feed', `ref 2 casas (${book}, ${books2[0]})`, `ref 1 casa (${book})`]);
      notes.push(`${book} ${price.toFixed(2)} (${sel === 'Over' ? 'under' : 'over'} ${other(price)})`, `${books2[0]} sin línea`);
      if (refTag === 'ref feed') notes.push(`feed ${fo}`);
      notes.push(refTag, `media modelo ${mean}`, `IA media ${Math.round(mean)}`);
      if (date >= '2026-11-09') notes.push(`apertura feed ${fo.toFixed(3)} (otro lado ${other(fo).toFixed(3)})`);
      if (cards) probAI = chance(0.4) ? r4(probModel * 0.95) : null;
      if (refTag !== 'ref feed') closeKind = pick(['logger', 'missing', 'none']);
      break;
    }
    case 'team_corners': {
      market = 'Córners equipo';
      const ln = pick([3.5, 4.5, 5.5]);
      selection = `${m.away} córners ${sideOU} ${ln}`;
      price = r2(between(1.75, 2.5));
      probModel = r4(between(0.48, 0.66));
      probBlend = r4(probModel * 0.9);
      evBlend = r4(price * probBlend - 1);
      fairOdds = r3(1 / probBlend);
      const passed = date >= '2026-11-03' || chance(0.4);
      reason = `CÓRNERS EQUIPO: modelo ${(probModel * 100).toFixed(1)}% vs mercado ${(probBlend * 85).toFixed(1)}% (media ${r2(ln + 0.6)})${passed ? ' | SHADOW: pasó todos los filtros' : ' | razor, F-gap'}`;
      notes.push(`${book} ${price.toFixed(2)} (${sideOU === 'Over' ? 'under' : 'over'} ${other(price)})`, `${books2[0]} ${r2(price * 0.95)} (solo over)`, `ref 2 casas (${book}, ${books2[1]})`);
      notes.push(chance(0.75) ? 'muestra 10+' : 'muestra 6–9');
      notes.push(chance(0.85) ? `1X2 apertura feed ${r2(between(1.5, 3))}/${r2(between(3, 4))}/${r2(between(2, 6))}` : '1X2 apertura feed n/a');
      if (date >= '2026-11-06') notes.push(fuerza());
      closeKind = pick(['logger', 'logger', 'none']);
      break;
    }
    case 'model_only_shots': {
      market = pick(['Tiros equipo', 'Tiros al arco equipo']);
      const ln = market === 'Tiros equipo' ? pick([9.5, 11.5, 20.5]) : pick([3.5, 4.5]);
      selection = `${m.home} tiros ${sideOU} ${ln}`;
      price = chance(0.15) ? 1.4 : r2(between(1.7, 2.2));
      probModel = r4(between(0.65, 0.88));
      probBlend = r4(probModel * 0.85);
      evBlend = r4(price * probBlend - 1);
      fairOdds = r3(1 / probBlend);
      reason = `MODELO SOLO (tiros): modelo ${(probModel * 100).toFixed(1)}% vs mercado ${(probBlend * 80).toFixed(1)}% (media ${r2(ln + 3)}, línea ${ln})`;
      notes.push(`${book} ${price.toFixed(2)} (${sideOU === 'Over' ? 'U' : 'O'}${ln} ${other(price)})`, `${books2[0]} sin tiros`, `ref 1 casa (${book})`, 'muestra 10+');
      if (date >= '2026-11-06') notes.push(fuerza());
      closeKind = pick(['logger', 'logger', 'none']);
      break;
    }
    case 'shadow': {
      const shots = chance(0.6);
      market = shots ? pick(['Tiros (total)', 'Tiros al arco (total)']) : 'Córners totales';
      selection = `${sideOU} ${shots ? pick([24.5, 26.5, 9.5]) : line}`;
      price = r2(between(1.7, 2.3));
      probModel = r4(between(0.52, 0.65));
      probBlend = r4(probModel * 0.93);
      evBlend = r4(price * probBlend - 1);
      fairOdds = r3(1 / probBlend);
      reason = shots ? `SHADOW: tiros (regla 25): modelo ${(probModel * 100).toFixed(1)}% vs mercado ${(probBlend * 95).toFixed(1)}%` : `SHADOW: ${pick([7, 8, 9])} partidos (regla 18)`;
      notes.push(`${book} ${price.toFixed(2)}`, shots ? `ref 1 casa (${book})` : 'ref feed');
      if (!shots) notes.push(`feed ${feedP()}`);
      closeKind = shots ? pick(['logger', 'none']) : 'feed';
      break;
    }
    case 'ai_watch': {
      market = pick(['Tarjetas totales', 'Córners totales']);
      const ln = market === 'Tarjetas totales' ? cardLine : line;
      selection = `${sideOU} ${ln}`;
      price = r3(between(1.7, 2.3));
      probAI = r4(between(0.55, 0.8));
      probModel = probAI;
      probBlend = r4(between(0.42, 0.56));
      evBlend = r4(probAI * price - 1);
      fairOdds = r3(1 / probAI);
      reason = `IA-WATCH: IA media ${Math.round(ln + 1)} vs línea ${ln} (IA ${(probAI * 100).toFixed(1)}% vs línea ${(probBlend * 100).toFixed(1)}%)`;
      notes.push('bet365 feed', `${book} ${r2(price * 1.02)}`);
      closeKind = 'feed';
      break;
    }
    case 'published':
    case 'published_bet': {
      market = '1X2';
      threeWay = true;
      selection = `${m.away} gana`;
      price = r2(between(1.8, 3.4));
      probModel = r4(1 / price + 0.05);
      probBlend = r4(1 / price + 0.04);
      evBlend = r4(price * probBlend - 1);
      fairOdds = r3(1 / probBlend);
      reason = kind === 'published' ? `PUBLICADA, NO APOSTADA (top #${pick([1, 2])}, ${pick(['0.5', '1', '1.25'])}u)` : `PUBLICADA Y APOSTADA (Apuestas ID ${pick([3, 7, 12])})`;
      notes.push(`Precio ${book}`, `feed ${feedP()}`);
      break;
    }
    case 'low_edge': {
      market = '1X2';
      threeWay = true;
      selection = `${m.home} gana`;
      price = r2(between(1.8, 2.6));
      probModel = r4(1 / price + 0.02);
      probBlend = r4(1 / price + 0.01);
      evBlend = r4(price * probBlend - 1);
      fairOdds = r3(1 / probBlend);
      reason = chance(0.5) ? `Pasó todos los filtros; edge <4% (EV +${(evBlend * 100).toFixed(1)}%), stake máx 0.25u. No se mostró en el slate.` : `Stake < 0.25u (EV blend +${(evBlend * 100).toFixed(1)}%); muestra 9 partidos`;
      notes.push(`Precio feed Sofascore (bet365)`);
      break;
    }
    default: {
      // filter_reject: every reason shape seen in the sheet
      market = pick(['1X2', 'Empate no apuesta', 'Goles', 'Córners totales', 'Tarjetas totales', 'Hándicap asiático', '1X2 1er tiempo']);
      threeWay = market.startsWith('1X2');
      selection = market === 'Empate no apuesta' ? `${m.away} DNB` : market === 'Hándicap asiático' ? `${m.home} +0.25` : market.startsWith('1X2') ? `${m.away} gana` : `${sideOU} ${market === 'Goles' ? 2.5 : line}`;
      price = chance(0.1) ? r2(between(10, 21)) : r2(between(1.7, 6));
      if (chance(0.2)) price = r3(price + 0.333);
      probModel = r4(between(0.2, 0.7));
      probBlend = r4(probModel * 0.9);
      evBlend = r4(price * probBlend - 1);
      fairOdds = r3(1 / probBlend);
      reason = pick([
        'F-gap; F-ratio',
        'F-sample (5 PJ); F-gap; F-ratio',
        'razor (media 9.17); muestra relajada (7 PJ)',
        'filtro 4 (últ. 5 baja EV a -3.8%)',
        'filtro 5 (árbitro: EV -4.3%)',
        'Regla 1 (media 10.22 sobre 9.5); muestra 9 partidos',
        'Muestra (7); brecha >10 pts; ratio 1.54x',
        'SKIP (relleno): razor, F-gap: modelo 58.4% vs mercado 46.3% (media 10.02, línea 10.5)',
        'Salto: solo filtro 5 (árbitro 5.41/p, EV blend -0.9%)',
        'regla 23; F-gap',
        'rule 3 razor: line 9.5 within 0.5 of model mean 9.16',
      ]);
      notes.push(chance(0.5) ? 'Precio feed Sofascore (bet365/RushBet). Muestra 4-5 PJ: modelo poco fiable.' : `${book} ${price.toFixed(2)}`);
      if (chance(0.3)) notes.push('también F-gap; filtro 5');
      closeKind = pick(['plain', 'feed', 'none']);
    }
  }
  const st = status(date, Math.min(0.9, 1 / price + 0.02));
  let closePrice = null;
  if (st !== 'Pendiente') {
    const score = `${m.home} ${Math.floor(rand() * 4)}-${Math.floor(rand() * 4)} ${m.away}${chance(0.1) ? '; una sola fuente: ficticia.com' : '; Sofascore'}`;
    notes.unshift(score);
    if (closeKind === 'feed' || closeKind === 'dc') {
      const c = feedClose(price, selection, threeWay);
      closePrice = c.close;
      if (closeKind === 'dc') {
        // a 1X2 consistent with the double chance close (1X = home + draw), ~106% book
        const q = Math.min(0.9, 1 / c.close);
        const h = q * between(0.55, 0.7);
        notes.push(`cierre: Sofascore/bet365 ${c.close.toFixed(2)} (1X2 ${r2(1 / h)}/${r2(1 / (q - h))}/${r2(1 / Math.max(0.1, 1.06 - q))})`);
      } else notes.push(c.text);
    } else if (closeKind === 'logger') {
      const lt = `${sideOU === 'Over' ? 'U' : 'O'}${line}`;
      const c = loggerClose(book, price, lt);
      notes.push(c.text);
      if (chance(0.3)) notes[notes.length - 1] = notes[notes.length - 1].replace(/EV justa ([^|]*)$/, (_, ev) => `EV justa ${ev} (otro lado de Betsson)`);
    } else if (closeKind === 'one_sided' || closeKind === 'plain') {
      closePrice = r2(price * between(0.92, 1.06));
      notes.push(`cierre: Sofascore/bet365 ${closePrice}`);
    } else if (closeKind === 'missing') {
      notes.push(`cierre feed: sin línea ${selection.split(' ').pop()} (feed sin mercado de ${market.startsWith('Tarjetas') ? 'tarjetas' : 'córners'})`);
    }
  }
  return {
    date, league, match: m.name, market, selection, price, closePrice, probModel, probBlend, evBlend, fairOdds,
    reason, status: st, notes: notes.join(' | '), probAI,
  };
}

function fuerza() {
  if (chance(0.15)) return 'FUERZA: n/a (feed sin 1X2)';
  const keeps = chance(0.6);
  return `FUERZA: esperado ${r2(between(3, 15))}, prob ${(between(0.35, 0.75) * 100).toFixed(1)}%, ${keeps ? 'MANTIENE' : 'RECHAZA'} (1X2 ${r2(between(1.2, 3))}/${r2(between(3, 6))}/${r2(between(2, 12))}, goles 2.5 ${r2(between(1.5, 2.2))}/${r2(between(1.6, 2.5))})`;
}

function hex() {
  let s = '';
  for (let i = 0; i < 32; i++) s += '0123456789abcdef'[Math.floor(rand() * 16)];
  return s;
}

const shadowRows = [];
for (const tpl of SHADOW_TEMPLATES) {
  const days = DAYS.filter((d) => d >= tpl.since && (!tpl.until || d <= tpl.until));
  for (let i = 0; i < tpl.n; i++) {
    const date = i === 0 ? days[days.length - 1] : pick(days);
    shadowRows.push(shadowRow(tpl.kind, tpl.kind === 'ai_watch' && i === 0 ? days[0] : date));
  }
}
shadowRows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

// ---------------------------------------------------------------- Apuestas
const BET_MARKETS = [
  ['Sencilla', '1X2', (m) => `${m.away} gana`],
  ['Sencilla', 'Córners totales', () => 'Under 9.5'],
  ['Sencilla', 'Empate no apuesta', (m) => `${m.home} DNB`],
  ['Sencilla', 'Hándicap asiático', (m) => `${m.home} +0.25`],
  ['Sencilla', 'Doble oportunidad', (m) => `X2 (${m.away} o empate)`],
  ['Doble', 'Goles', () => 'Under 3.5 × Under 3.5'],
  ['Crear apuesta', 'Goles + córners', (m) => `Under 3.5 goles + ${m.away} córners Under 6.5`],
  ['En vivo', 'Córners totales', () => 'Over 12.5 (tomada al descanso con 8)'],
  ['Sencilla', 'Tarjetas totales', () => 'Under 4.5'],
  ['Sencilla', 'Goles (asiático)', () => 'Under 3 asiático'],
];
const betRows = [];
for (let i = 0; i < 22; i++) {
  const date = DAYS[Math.min(DAYS.length - 1, Math.floor(i * 2.05))];
  const m = match();
  const [type, market, sel] = BET_MARKETS[i % BET_MARKETS.length];
  const price = r2(between(1.7, 3.3));
  const stake = pick([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]);
  let st = date >= LAST ? 'Pendiente' : i === 15 ? 'Medio ganada' : i === 9 ? 'Medio perdida' : status(date, 1 / price + 0.03);
  const free = i === 17;
  let profit = null;
  if (st === 'Ganada') profit = r2(stake * (price - 1));
  else if (st === 'Perdida') profit = free ? 0 : -stake;
  else if (st === 'Nula') profit = 0;
  else if (st === 'Medio ganada') profit = r2((stake * (price - 1)) / 2);
  else if (st === 'Medio perdida') profit = -stake / 2;
  const prob = chance(0.8) ? r4(1 / price + between(0.02, 0.08)) : null;
  const sameBook = chance(0.4);
  const close = st === 'Pendiente' ? null : r2(price * between(0.9, 1.06));
  let notes = `Colocada ${date} ~22:15 en ${pick(BOOKS)}. Mín. ${r2(price * 0.95)}.`;
  if (free) notes = 'APUESTA GRATIS (freebet, cuota mín. 3.00). Stake no se devuelve: pierde 0. Ganancia (R) con fórmula propia de freebet en esta fila.';
  if (close && !sameBook) notes += ` | cierre: Sofascore/bet365 ${close}`;
  betRows.push({
    id: i + 1, date, league: type === 'Doble' ? `Doble (${pick(LEAGUES)} + ${pick(LEAGUES)})` : pick(LEAGUES), match: m.name, type, market,
    selection: sel(m), price, stakeU: stake, book: pick(BOOKS), probModel: prob, fairOdds: prob ? r2(1 / prob) : null,
    ev: prob ? r4(price * prob - 1) : null, confidence: pick(['Alta', 'Media', 'Baja', null]), status: st,
    result: st === 'Pendiente' ? null : `${m.home} ${Math.floor(rand() * 4)}-${Math.floor(rand() * 4)} ${m.away}. Fuente: ficticia`,
    profitU: profit, notes, closePrice: close, clv: close ? r4(price / close - 1) : null,
    favoritesException: i === 6 ? 'Sí' : 'No', maxStakeU: chance(0.7) ? 2 : null, probBlend: prob ? r4(prob * 0.97) : null,
    probLast5: chance(0.5) && prob ? r4(prob * 1.03) : null, probAI: chance(0.5) && prob ? r4(prob * 0.95) : null,
  });
}

// ---------------------------------------------------------------- Grok
const grokRows = [];
for (let i = 0; i < 40; i++) {
  const date = pick(DAYS);
  const m = match();
  const teamCorners = i % 3 === 0 || date >= '2026-11-10';
  const market = teamCorners ? 'Córners equipo' : pick(['1X2', 'Goles', 'Córners 1X2', 'Hándicap asiático', 'Goles equipo', 'Tarjetas totales', 'Más tarjetas (3 vías)']);
  const ln = pick([3.5, 4.5, 5.5]);
  const selection = teamCorners ? `${m.home} córners ${pick(['Over', 'Under'])} ${ln}` : market === '1X2' ? `${m.away} gana` : market === 'Hándicap asiático' ? `${m.home} -0.25` : `${pick(['Over', 'Under'])} ${pick([2.5, 3.5, 4.5])}`;
  const price = chance(0.08) ? null : r2(between(1.7, 4.5));
  const book = pick(BOOKS);
  const priced = chance(0.55);
  let st = date >= LAST ? 'Pendiente' : i === 5 ? 'Medio perdida' : status(date, price ? 1 / price : 0.4);
  const notes = [];
  if (price) notes.push(`${book} ${price.toFixed(2)} (${teamCorners ? `U${ln}` : 'otro lado'} ${other(price).toFixed(2)})`, `${pick(BOOKS.filter((b) => b !== book))} sin línea`, 'BetPlay/Kambi 1.98 (otro lado no dado)');
  if (st !== 'Pendiente' && price && chance(0.7)) {
    const c = loggerClose(book, price, teamCorners ? `U${ln}` : 'X');
    notes.push(c.text.replace(`vs ${book}`, `vs Cuota (${book})`));
  }
  if (chance(0.15)) notes.push('sin marca automático/manual');
  grokRows.push({
    date, time: `${pick(['9', '14', '17', '19'])}:${pick(['00', '30'])}`, league: pick(LEAGUES), match: m.name, market, selection, price,
    minPrice: i === 3 ? null : price ? r2(price * 0.93) : null, stakeU: pick([0.25, 0.5, 1]),
    reason: `${pick(['Automático', 'Manual'])}: Prob ${(between(0.3, 0.7) * 100).toFixed(1)}%, EV +${(between(2, 20)).toFixed(1)}%; razón inventada`,
    verdict: i === 7 ? '' : priced ? `Cotizado: modelo ${(between(0.4, 0.7) * 100).toFixed(1)}% vs mercado ${(between(0.3, 0.55) * 100).toFixed(1)}% → SKIP: F-gap` : i === 7 ? '' : 'No cotizado: mercado no modelado por el script',
    status: st, result: st === 'Pendiente' ? null : `${m.home} ${Math.floor(rand() * 4)}-${Math.floor(rand() * 4)} ${m.away}. Sofascore`,
    notes: notes.join(' | '),
  });
}
grokRows.sort((a, b) => (a.date < b.date ? -1 : 1));

// ---------------------------------------------------------------- Decisiones, Pinnacle, Reglas
const decisionRows = [
  ['2026-10-09', 'Escala de stakes por confianza', 'Stake entre 0.25u y 2u según la confianza del modelo (texto de ejemplo).', 'Evidencia inventada para el fixture.', 'Se revisa a las 30 apuestas.', 'Vigente'],
  ['2026-10-12', 'Córners y tarjetas en pausa (regla 30)', 'Solo se registran en Sombra hasta la revisión.', 'Backtest ficticio del 12 oct.', 'Revisión Sombra 150 filas.', 'Vigente'],
  ['2026-10-20', 'Revisión Sombra 150 filas', 'Se mantiene el umbral de valor en 3%.', 'VALOR 20-15 en el ejemplo; EV contra el cierre +1.2% (n 18).', 'Próxima revisión a las 300 filas.', 'Vigente'],
  ['2026-10-22', 'VALOR CASI como relleno', 'Rellenar con picks entre 0% y 3% sobre la justa.', 'Texto de ejemplo.', 'Se revisa con VALOR.', 'Vigente'],
  ['2026-10-24', 'Tiros modelo solo', 'Una fila por slate.', 'Ejemplo.', 'A las 100 filas calificadas.', 'Provisional'],
  ['2026-10-31', 'Tarjetas under del modelo', 'Hasta 8 por slate, fuera del tope.', 'Ejemplo con 34 filas.', 'Prueba congelada (fila 111).', 'Vigente'],
  ['2026-11-01', 'Revisión Sombra 450 filas', 'Sin cambios de reglas.', 'Ejemplo.', 'Próxima revisión a las 600 filas.', 'Reemplazada'],
  ['2026-11-06', 'VALOR PROP', 'Prueba por precio en córners y tarjetas totales.', 'Ejemplo con consenso de casas.', 'A las 100 filas con cierre.', 'Vigente'],
  ['2026-11-08', 'Revisión Sombra 650 filas', 'Se congelan las pruebas del modelo.', 'Ejemplo de evidencia.', 'Próxima revisión: 14 días y 150 filas nuevas.', 'Vigente'],
  ['2026-11-09', 'Pruebas congeladas', 'Una decisión por prueba a las 100 filas, 50 con cierre.', 'Ejemplo.', 'Por prueba.', 'Vigente'],
  ['2026-11-10', 'Grok solo córners de equipo', 'Desde el slate del 10 nov solo se registran sus córners de equipo.', 'Ejemplo.', 'Revisión Grok 200 filas.', 'Abierta'],
  ['2026-11-14', 'Filas de Sombra por script', 'Las filas las escribe un script guardado.', 'Ejemplo.', 'Señal: el recibo imprime OK.', 'Provisional'],
];
const pinRows = [];
for (let i = 0; i < 12; i++) {
  const m = match();
  const d = DAYS[DAYS.length - 1 - (i % 5)];
  const o = [r2(between(1.6, 3.5)), r2(between(3, 4.2)), r2(between(2, 5))];
  pinRows.push({
    id: hex(), sport_key: 'soccer_ficticia', league: pick(LEAGUES), kickoff_utc: `${d}T19:30:00Z`, kickoff_bogota: `${d} 14:30`,
    home: m.home, away: m.away, open_1: o[0], open_x: o[1], open_2: o[2], open_read_utc: `${d}T02:14:20Z`,
    last_1: r2(o[0] * 0.98), last_x: o[1], last_2: r2(o[2] * 1.02), last_read_utc: `${d}T19:20:00Z`, mins_before_kickoff: 10,
    api_last_update: `${d}T19:19:58Z`,
  });
}
const rules = [
  '2. Stake entre 0,25u y 2u por apuesta.',
  '3. Sencillas: solo cuota ≥ 1,70 y EV ≥ 4% frente al modelo conservador.',
  '4. Dobles: cada selección con probabilidad estimada ≥ 80%.',
  '5. En vivo: prohibido perseguir pérdidas.',
  '6. No apostar líneas finas (sin margen frente a la línea justa).',
  '7. Solo ligas favoritas.',
  '8. Stake máximo: el menor entre 2u y 1/4 de Kelly (columna Stake máx.).',
  '9. Registrar la cuota de cierre y seguir el CLV (cuota tomada / cuota de cierre − 1).',
];

// ---------------------------------------------------------------- assemble
function tab(name, rows, missing = []) {
  const cols = keys(name);
  let rowNo = 1;
  return {
    columns: ['row', ...cols],
    rows: rows.map((r) => [++rowNo, ...cols.map((k) => (missing.includes(k) ? null : r[k] ?? null))]),
  };
}

// Edge case: the Grok tab lost its "Cuota mín. Grok" header (listed in missingHeaders, key null).
const feed = {
  schema: 1,
  generatedAt: '2026-11-15T16:00:00Z',
  timeZone: 'America/Los_Angeles',
  meta: { rows: {}, redactions: 0, missingHeaders: ['Grok!Cuota mín. Grok'], cached: false, cacheTtlSeconds: 300 },
  tabs: {
    bets: tab('bets', betRows),
    shadow: tab('shadow', shadowRows),
    grok: tab('grok', grokRows, ['minPrice']),
    decisions: tab('decisions', decisionRows.map(([date, topic, decision, evidence, review, status]) => ({ date, topic, decision, evidence, review, status }))),
    pinnacle: tab('pinnacle', pinRows),
    rules,
  },
};
for (const k of ['bets', 'shadow', 'grok', 'decisions', 'pinnacle']) feed.meta.rows[k] = feed.tabs[k].rows.length;
feed.meta.rows.rules = rules.length;

const out = join(root, 'tests/fixtures/feed.json');
/** One row per line keeps diffs readable. */
function pretty(f) {
  const tabs = Object.entries(f.tabs).map(([k, t]) =>
    Array.isArray(t)
      ? `  ${JSON.stringify(k)}: [\n${t.map((x) => `   ${JSON.stringify(x)}`).join(',\n')}\n  ]`
      : `  ${JSON.stringify(k)}: {\n   "columns": ${JSON.stringify(t.columns)},\n   "rows": [\n${t.rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n   ]\n  }`,
  );
  const head = JSON.stringify({ schema: f.schema, generatedAt: f.generatedAt, timeZone: f.timeZone, meta: f.meta }, null, 1).slice(0, -2);
  return `${head},\n "tabs": {\n${tabs.join(',\n')}\n }\n}\n`;
}
writeFileSync(out, pretty(feed));
JSON.parse(pretty(feed));
const total = feed.meta.rows.bets + feed.meta.rows.shadow + feed.meta.rows.grok;
console.log(`wrote ${out}: ${total} picks (${JSON.stringify(feed.meta.rows)})`);
