// notes.js: every note format of the sheet (synthetic numbers) and the closing-price measures,
// checked against hand-computed values (review.py's definitions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNotes, measure, devig, powerProb, closeProb, outcomesNeeded, parseLogger, parseFeed } from '../../src/data/notes.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const row = (notes, extra = {}) => ({ notes, reason: '', market: 'Córners totales', selection: 'Under 10.5', price: 1.82, tag: 'shadow_rule30', ...extra });

test('feed price, feed opening (also flipped), reference, sample, model and AI means', () => {
  const p = parseNotes(row('X 5-1 Y; córners 12 (4-8); Sofascore | Betano 1.82 | Betsson 1.78 (over 1.9) | feed 1.8 | ref feed | media modelo 9.83 | IA media 9 | apertura feed 1.800 (otro lado 1.909)'));
  assert.equal(p.feedPrice, 1.8);
  assert.equal(p.feedOpen, 1.8);
  assert.equal(p.feedOpenOther, 1.909);
  assert.equal(p.feedOpenFlipped, false);
  assert.equal(p.ref, 'feed');
  assert.equal(p.modelMean, 9.83);
  assert.equal(p.aiMean, 9);
  assert.equal(p.priceSource, 'Betano');
  assert.deepEqual(p.bookPrices.map((b) => [b.book, b.price, b.other]), [['Betano', 1.82, null], ['Betsson', 1.78, 'over 1.9']]);
  const f = parseNotes(row('feed 1.727 | apertura feed 2.100 (otro lado 1.667; invertida?)'));
  assert.equal(f.feedOpenFlipped, true);
  assert.equal(f.feedPrice, 1.727, '"apertura feed" is not the logged feed price');
  assert.equal(parseNotes(row('ref 2 casas (Stake, Betsson) | muestra 10+')).ref, 'books');
  assert.deepEqual(parseNotes(row('ref 2 casas (Stake, Betsson)')).refBooks, ['Stake', 'Betsson']);
  assert.equal(parseNotes(row('ref 1 casa (Betano)')).ref, 'one_book');
  assert.equal(parseNotes(row('ref consenso 3 fuentes (bet365, Betano, Betsson)')).refCount, 3);
  assert.equal(parseNotes(row('muestra 6–9')).sample, '6-9');
  assert.equal(parseNotes(row('muestra 10+')).sample, '10+');
  assert.equal(parseNotes(row('Stake sin línea | Betano sin córners')).bookPrices[0].unavailable, 'sin línea');
});

test('FUERZA, Pinnacle, opening 1X2, single source, closes missing', () => {
  const p = parseNotes(row('FUERZA: esperado 3.11, prob 37.1%, RECHAZA (1X2 1.22/6.50/12.00, goles 2.5 1.53/2.40) | 1X2 apertura feed 2.57/3.40/2.35'));
  assert.equal(p.fuerza, 'rejects');
  assert.equal(p.fuerzaExpected, 3.11);
  near(p.fuerzaProb, 0.371);
  assert.deepEqual(p.open1x2, { home: 2.57, draw: 3.4, away: 2.35 });
  assert.equal(parseNotes(row('FUERZA: esperado 21.76, prob 62.2%, MANTIENE (1X2 …)')).fuerza, 'keeps');
  assert.equal(parseNotes(row('FUERZA: n/a (feed sin 1X2) | 1X2 apertura feed n/a')).fuerza, 'na');
  assert.equal(parseNotes(row('1X2 apertura feed n/a')).open1x2, 'n/a');
  const pin = parseNotes(row('feed 2.32 | pin 2.45/3.16/3.21 (2026-11-12T22:14:20Z) | pin id fed29050dc7e99c7dd6b3b4580f142b7')).pin;
  assert.deepEqual(pin, { home: 2.45, draw: 3.16, away: 3.21, readUtc: '2026-11-12T22:14:20Z', id: 'fed29050dc7e99c7dd6b3b4580f142b7' });
  assert.equal(parseNotes(row('pin n/d (sin partido)')).pinMissing, 'sin partido');
  assert.ok(parseNotes(row('X 1-1 Y; una sola fuente: besoccer.com')).singleSource);
  assert.match(parseNotes(row('cierre feed: sin línea 4.5 (feed sin mercado de tarjetas)')).closeMissing, /4\.5/);
});

test('bet365 feed closes: two-way, three-way, with the 1X2 for double chance', () => {
  const two = parseFeed('feed 1.8 | cierre: Sofascore/bet365 1.80 (otro lado 1.91)');
  assert.equal(two.feedClose, 1.8);
  assert.deepEqual(two.feedOthers, [1.91]);
  const three = parseFeed('cierre: Sofascore/bet365 1.68 (1 4.75 / X 3.70 / 2 1.68)', 2);
  assert.deepEqual(three.feedOthers, [4.75, 3.7]);
  const dc = parseFeed('cierre: Sofascore/bet365 1.95 (1X2 2.10/3.40/3.50)', 'dc');
  assert.deepEqual(dc.feedTriple, [2.1, 3.4, 3.5]);
  const one = parseFeed('cierre: Sofascore/bet365 2.75');
  assert.equal(one.feedClose, 2.75);
  assert.deepEqual(one.feedOthers, []);
});

test('clv-logger segments: closes per book, CLV and EV justa, other-book flag', () => {
  const lg = parseLogger('Betano 2.47 | Cierre Betano 2.42 (X 3.2, 2 3.0); Betsson 2.32 (X 3.0, 2 3.05); Stake 2.3 (X 3.0, 2 3.25); 13 nov 14:23 6 min antes | CLV +2.07% vs Betano | EV justa -3.63%', 2);
  assert.deepEqual(lg.books.Betano, { close: 2.42, others: [3.2, 3.0], triple: null });
  assert.deepEqual(lg.books.Stake.others, [3.0, 3.25]);
  near(lg.clvText, 0.0207);
  assert.equal(lg.clvBook, 'Betano');
  near(lg.evText, -0.0363);
  const other = parseLogger('Cierre Betano 2.10 (solo over); Betsson 1.85 (U5.5 1.82) | CLV -1.43% vs Betano | EV justa -3.89% (otro lado de Betsson)');
  assert.deepEqual(other.books.Betano.others, [], '"solo over" has no other side');
  assert.equal(other.evOtherBook, 'Betsson');
  assert.equal(parseLogger('Cierre Betano 2.50 (solo over) | CLV +4.00% vs Cuota (Betano)').clvBook, 'Betano', 'Grok notes');
});

test('de-vig: proportional, power method, double chance, outcomes needed', () => {
  const [p, m] = devig(1.8, [1.91]);
  near(p, (1 / 1.8) / (1 / 1.8 + 1 / 1.91));
  near(m, 1 / 1.8 + 1 / 1.91 - 1);
  const q = powerProb(1.8, [1.91]);
  assert.ok(q > 0 && q < 1);
  const qs = [1 / 1.8, 1 / 1.91];
  const k = Math.log(q) / Math.log(qs[0]);
  near(qs[0] ** k + qs[1] ** k, 1, 1e-6);
  assert.equal(outcomesNeeded('1X2'), 2);
  assert.equal(outcomesNeeded('1X2 1er tiempo'), 2);
  assert.equal(outcomesNeeded('Doble oportunidad'), 'dc');
  assert.equal(outcomesNeeded('Goles'), 1);
  const [dc] = closeProb(null, [], [2.1, 3.4, 3.5], 'dc', '1X (A o empate)');
  const inv = 1 / 2.1 + 1 / 3.4 + 1 / 3.5;
  near(dc, (1 / 2.1 + 1 / 3.4) / inv);
  assert.equal(closeProb(1.8, [], null, 1, ''), null, 'one-sided close cannot be de-vigged');
});

test('measures: own-book close first, then the bet365 feed; raw CLV same source only', () => {
  // Book-priced row with a two-sided close at the same book and a feed close: same book wins.
  const notes = 'Betano 2.47 | feed 2.32 | Cierre Betano 2.42 (X 3.2, 2 3.0); 13 nov | CLV +2.07% vs Betano | cierre: Sofascore/bet365 2.20 (1 2.20 / X 3.10 / 2 3.40)';
  const r = row(notes, { market: '1X2', selection: 'A gana', price: 2.47, tag: 'value' });
  const p = parseNotes(r);
  const m = measure(r, p);
  const own = (1 / 2.42) / (1 / 2.42 + 1 / 3.2 + 1 / 3.0);
  near(m.fairCloseEv, 2.47 * own - 1);
  assert.equal(m.closeSource, 'same_book');
  near(m.clv, 2.47 / 2.42 - 1);
  assert.equal(m.clvSource, 'own');
  const feedP = (1 / 2.2) / (1 / 2.2 + 1 / 3.1 + 1 / 3.4);
  near(m.evVsFeed, 2.47 * feedP - 1);

  // Book-priced row with only the feed close: fair-close EV from the feed, CLV from "feed X".
  const r2 = row('Betano 1.87 | feed 1.833 | ref feed | cierre: Sofascore/bet365 1.83 (otro lado 1.83)', { price: 1.87, selection: 'Over 8.5' });
  const m2 = measure(r2, parseNotes(r2));
  near(m2.fairCloseEv, 1.87 * 0.5 - 1);
  assert.equal(m2.closeSource, 'feed');
  near(m2.clv, 1.833 / 1.83 - 1);
  assert.equal(m2.clvSource, 'feed');
  near(m2.openingFairEv, 1.833 * 0.5 - 1);

  // One-sided close: CLV yes, fair-close EV no.
  const r3 = row('Precio feed Sofascore (bet365). | cierre: Sofascore/bet365 7', { market: 'Empate no apuesta', price: 4.333 });
  const m3 = measure(r3, parseNotes(r3));
  assert.equal(m3.fairCloseEv, null);
  assert.equal(m3.hasTwoSidedClose, false);
  near(m3.clv, 4.333 / 7 - 1);

  // No close at all.
  const r4 = row('Betano 1.75 | ref 1 casa (Betano)', { price: 1.75 });
  const m4 = measure(r4, parseNotes(r4));
  assert.equal(m4.fairCloseEv, null);
  assert.equal(m4.clv, null);

  // Sheet close column G used as the feed close when the note lacks it (raw CLV only).
  const r5 = { ...row('Precio feed Sofascore (bet365).', { price: 2.5 }), closePriceColumn: 2.7 };
  near(measure(r5, parseNotes(r5)).clv, 2.5 / 2.7 - 1);

  // On every row fair-close EV never exceeds raw CLV at the same source (review.py's sanity check).
  assert.ok(m.openingFairEv <= m.clv + 1e-9 && m2.openingFairEv <= m2.clv + 1e-9);
});

test('the logger EV justa equals the recalculation', () => {
  const r = row('Betsson 1.85 | Cierre Betsson 1.85 (O2.5 1.9); Betano 1.82 (O2.5 2.0) | CLV 0% vs Betsson | EV justa -6.27%', { market: 'Goles', selection: 'Under 2.5', price: 1.85 });
  const p = parseNotes(r);
  const m = measure(r, p);
  assert.ok(Math.abs(m.openingFairEv - p.loggerEv) < 0.0006, `${m.openingFairEv} vs ${p.loggerEv}`);
});
