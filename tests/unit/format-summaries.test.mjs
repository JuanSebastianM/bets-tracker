import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, formatUnits, formatPct, formatRecord, formatMoney, formatDate, todayIn } from '../../src/lib/format.js';
import { describe, describeRecord, describeCloseEv, describeHitRate } from '../../src/data/summaries.js';
import { summarize } from '../../src/data/stats.js';
import { setLocale } from '../../src/lib/i18n.js';
import { loadAllStrings } from './helpers/strings.mjs';
import { mkPick } from './helpers/picks.mjs';

loadAllStrings('es');

test('prices keep 3 decimals only when the sheet has them; averages get 2', () => {
  assert.equal(formatPrice(1.8), '1.80');
  assert.equal(formatPrice(4.333), '4.333');
  assert.equal(formatPrice(1.909), '1.909');
  assert.equal(formatPrice(2.625, { average: true }), '2.63');
  assert.equal(formatPrice(null), '–');
});

test('units, percentages, record', () => {
  assert.equal(formatUnits(2.744), '+2.74u');
  assert.equal(formatUnits(-1), '−1.00u');
  assert.equal(formatUnits(0), '0.00u');
  assert.equal(formatUnits(3, { sign: false }), '3.00u');
  assert.equal(formatPct(0.0312), '+3.1%');
  assert.equal(formatPct(-0.052), '−5.2%');
  assert.equal(formatPct(0.55, { sign: false }), '55.0%');
  assert.equal(formatRecord({ won: 31, lost: 22, void: 3 }), '31-22-3');
  assert.equal(formatRecord({ won: 3, lost: 2, void: 0, halfWon: 1, halfLost: 1 }), '3-2 (+2½)');
});

test('money only with the user unit value', () => {
  assert.equal(formatMoney(2, { unitValue: null, currency: 'X' }), '');
  assert.match(formatMoney(2, { unitValue: 5, currency: 'X' }), /^\+10 X$/);
  assert.match(formatMoney(-1, { unitValue: 5, currency: '' }), /^−5$/);
});

test('dates: 15 nov 2026 in Spanish, Nov 15, 2026 in English; today in a time zone', () => {
  assert.equal(formatDate('2026-11-15'), '15 nov 2026');
  assert.equal(formatDate('2026-11-15', 'short'), '15 nov');
  setLocale('en');
  assert.equal(formatDate('2026-11-15'), 'Nov 15, 2026');
  setLocale('es');
  assert.equal(todayIn('America/Bogota', new Date('2026-11-16T03:00:00Z')), '2026-11-15');
});

test('summaries in both languages', () => {
  const ps = [mkPick({ status: 'won', price: 2.1, fairCloseEv: 0.02, match: 'a' }), mkPick({ status: 'lost', price: 2.1, fairCloseEv: -0.01, match: 'b' }), mkPick({ status: 'pending' })];
  const s = summarize(ps);
  assert.equal(describeRecord('VALOR', s), 'VALOR: 1-1 a cuota media 2.10, +0.10u (+5.0%) en 2 calificadas. 1 pendiente.');
  assert.match(describeCloseEv(s), /Contra el cierre sin margen: \+0\.5% de media \(n 2\)/);
  assert.equal(describeHitRate(s), '', 'no rate under 5 graded picks');
  assert.match(describe('VALOR', s), /Muestra pequeña \(n 2\)/);
  setLocale('en');
  assert.equal(describeRecord('VALOR', s), 'VALOR: 1-1 at an average price of 2.10, +0.10u (+5.0%) over 2 graded. 1 pending.');
  assert.equal(describeRecord('Grok', summarize([])), 'Grok: no graded picks yet.');
  setLocale('es');
  const many = summarize(Array.from({ length: 10 }, (_, i) => mkPick({ status: i < 6 ? 'won' : 'lost', price: 2 })));
  assert.equal(describeHitRate(many), 'Acierta 60.0%, por encima del 50.0% que necesita para no perder.');
});
