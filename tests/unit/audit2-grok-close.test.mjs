// Audit 2 (18 Nov 2026): Grok's measures against the close. Synthetic rows in the real note shapes.
// 1. Three-way corner and card markets need the draw and the other team to be de-vigged.
// 2. Grok's G is Grok's quote: the fair-close EV and CLV use the book's own opening in the notes
//    (review.py v1.1 load_grok), never G against that book's close, and never the bet365 feed close.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFeed } from '../../src/data/normalize.js';
import { outcomesNeeded } from '../../src/data/notes.js';

const COLS = ['row', 'date', 'time', 'league', 'match', 'market', 'selection', 'price', 'minPrice', 'stakeU', 'reason', 'verdict', 'status', 'result', 'notes'];
function grokPick(o) {
  const row = { row: 2, date: '2026-11-01', time: '10:00', league: 'Liga Uno', match: 'Uno vs Dos', market: 'Córners equipo', selection: 'Uno córners Under 4.5', price: 2.1, minPrice: null, stakeU: 0.5, reason: 'Automático', verdict: 'Cotizado: modelo 55% vs mercado 45% → SKIP: F-gap', status: 'Ganada', result: null, notes: '', ...o };
  const feed = { schema: 1, generatedAt: '2026-11-18T12:00:00Z', timeZone: 'America/Los_Angeles', meta: { rows: {}, redactions: 0, missingHeaders: [] },
    tabs: { grok: { columns: COLS, rows: [COLS.map((c) => row[c])] }, rules: [] } };
  return normalizeFeed(feed).picks.find((p) => p.source === 'grok');
}
const near = (a, b, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} vs ${b}`);

test('three-way corner and card markets need two other outcomes', () => {
  for (const m of ['Córners 1X2', 'Más córners (equipo)', 'Más córners 2.º tiempo', 'Tarjetas 1X2', 'Más tarjetas (3 vías)']) assert.equal(outcomesNeeded(m), 2, m);
  assert.equal(outcomesNeeded('Córners equipo'), 1);
  assert.equal(outcomesNeeded('Córners totales'), 1);
  assert.equal(outcomesNeeded('Tarjetas totales'), 1);
});

test('a three-way corners close is de-vigged with the draw and the other team', () => {
  const p = grokPick({ market: 'Córners 1X2', selection: 'Uno con más córners', price: 4.2,
    notes: 'Betano 5.50 (X 9.00, Dos 1.20) | Kambi 4.20 (X 9.0, Dos 1.22) | Cierre Betano 5.50 (X 9.00, Dos 1.20); 01 nov 09:50 10 min antes | CLV 0% vs Betano | EV justa -14.00%' });
  const q = 1 / 5.5, s = q + 1 / 9 + 1 / 1.2;
  near(p.fairCloseEv, 5.5 * (q / s) - 1);
  near(p.clv, 0);
  assert.ok(p.fairCloseEv < 0);
});

test('Grok price that is not the book price: the book opening is used, not G', () => {
  const p = grokPick({ price: 2.14, notes: 'Cierre Stake 1.90 (O4.5 1.80); Betsson 1.75 (O4.5 1.95); 29 oct 18:10 20 min antes | CLV -2.63% vs Stake (apertura Stake 1.85, col. K) | EV justa -10.00%',
    verdict: 'Cotizado: modelo 60% vs mercado 50% (mejor precio Stake 1.85) → SKIP: F-gap' });
  near(p.clv, 1.85 / 1.9 - 1);
  const pu = (1 / 1.9) / (1 / 1.9 + 1 / 1.8);
  near(p.fairCloseEv, 1.85 * pu - 1);
  assert.equal(p.closeSource, 'same_book');
  assert.equal(p.price, 2.14); // G is still shown as the price taken
});

test('when G is the book price, G is the opening', () => {
  const p = grokPick({ price: 2.6, notes: 'G = cuota dada por Grok | Betano 2.60 (O4.5 1.50) | Betsson 2.50 (1.52) | Cierre Betano 2.40 (O4.5 1.60); 1 nov 9:50 10 min antes | CLV +8.33% vs Betano | EV justa +4.00%' });
  near(p.clv, 2.6 / 2.4 - 1);
  near(p.fairCloseEv, 2.6 * ((1 / 2.4) / (1 / 2.4 + 1 / 1.6)) - 1);
});

test('no book opening, an opening 30% away from the close, or only a feed close: no measure', () => {
  assert.equal(grokPick({ notes: 'Cierre Betano 2.00 (O4.5 1.80); 1 nov 9:50 | CLV n/a' }).fairCloseEv, null);
  assert.equal(grokPick({ notes: 'Betano 3.10 (O4.5 1.30) | Cierre Betano 2.00 (O4.5 1.80); 1 nov 9:50' }).fairCloseEv, null);
  const f = grokPick({ market: '1X2', selection: 'Dos gana', price: 9.4, notes: 'Stake 9.40 (1.29, 6.20) | cierre feed: Sofascore/bet365 7.50 (1 1.36 / X 5.25 / 2 7.50)' });
  assert.equal(f.fairCloseEv, null);
  assert.equal(f.clv, null);
});

test('audit 3: Grok books are only books whose own price equals G (no CLV-book fallback)', () => {
  const kambi = grokPick({ market: 'Córners 1X2', selection: 'Uno con más córners', price: 4.2,
    notes: 'Betano 5.50 (X 9.00, Dos 1.20) | Kambi 4.20 (X 9.0, Dos 1.22) | Cierre Betano 5.50 (X 9.00, Dos 1.20); 01 nov 09:50 10 min antes | CLV 0% vs Betano | EV justa -14.00%' });
  assert.deepEqual(kambi.books, []);
  assert.equal(kambi.parsed.priceSource, null);
  assert.equal(kambi.extra.grokBook, 'Betano'); // the close is still measured at Betano, on Betano's opening
  const stake = grokPick({ price: 2.14, notes: 'Cierre Stake 1.90 (O4.5 1.80); 29 oct 18:10 | CLV -2.63% vs Stake (apertura Stake 1.85, col. K)',
    verdict: 'Cotizado: modelo 60% vs mercado 50% (mejor precio Stake 1.85) → SKIP: F-gap' });
  assert.deepEqual(stake.books, []);
  const same = grokPick({ price: 2.6, notes: 'Betano 2.60 (O4.5 1.50) | Betsson 2.50 (1.52) | Cierre Betano 2.40 (O4.5 1.60); 1 nov 9:50 | CLV +8.33% vs Betano' });
  assert.deepEqual(same.books, ['Betano']);
  const fromVerdict = grokPick({ price: 1.9, notes: '', verdict: 'Cotizado: … mejor precio Stake 1.90 (Betsson 1.88)' });
  assert.deepEqual(fromVerdict.books, ['Stake']);
});
