// Audit 2 (18 Nov 2026): a double-chance feed close written as its three prices. The other sides are the
// two other double-chance prices, never the pick's own price (the pick sheet showed it as "otro lado").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, parseNotes } from '../../src/data/notes.js';

test('double-chance close with three prices: the other two are the other sides', () => {
  const n = 'Uno 2-1 Dos (1X gana). Fuente: ESPN | Betano 1.90 | feed 1.75 | cierre: Sofascore/bet365 1.70 (1X 1.70 / X2 1.45 / 12 1.30)';
  const fd = parseFeed(n, 'dc');
  assert.equal(fd.feedClose, 1.7);
  assert.deepEqual(fd.feedOthers, [1.45, 1.3]);
  const p = parseNotes({ notes: n, reason: 'VALOR CASI: Betano 1.90 vs justa 1.88 (+1.0%)', market: 'Doble oportunidad', selection: '1X (Uno o empate)', price: 1.9, tag: 'near_value' });
  assert.deepEqual(p.close.others, [1.45, 1.3]);
});

test('the 1X2 three-way shape keeps working', () => {
  const fd = parseFeed('cierre: Sofascore/bet365 2.40 (1 2.40 / X 3.30 / 2 3.00)', 2);
  assert.deepEqual(fd.feedOthers, [3.3, 3]);
});
