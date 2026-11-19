// Audit 2 (18 Nov 2026): singular summary sentences and rule texts that the skill changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, describeSampleSize } from '../../src/data/summaries.js';
import { summarize } from '../../src/data/stats.js';
import { setLocale } from '../../src/lib/i18n.js';
import { loadAllStrings } from './helpers/strings.mjs';
import { mkPick } from './helpers/picks.mjs';

test('one graded pick reads in the singular in Spanish; two in the plural', async () => {
  loadAllStrings('es');
  setLocale('es');
  const one = describe('Sombra', summarize([mkPick({ price: 2.0, status: 'won' })]));
  assert.match(one, /en 1 calificada\./);
  assert.match(describeSampleSize(1), /^Con 1 calificada todavía/);
  assert.match(describeSampleSize(2), /^Con 2 calificadas todavía/);
  assert.doesNotMatch(one, /1 calificadas/);
  const two = describe('Sombra', summarize([mkPick({ price: 2.0, status: 'won' }), mkPick({ price: 2.0, status: 'lost', row: 9, uid: 'shadow:9' })]));
  assert.match(two, /en 2 calificadas\./);
  loadAllStrings('en');
  setLocale('en');
  assert.match(describe('Shadow', summarize([mkPick({ price: 2.0, status: 'won' })])), /over 1 graded\./);
  assert.match(describeSampleSize(1), /^With 1 graded/);
  setLocale('es');
});

test('rule 16 says the Sofascore AI is read for shortlisted picks only (lean run, 15 Nov 2026), in both languages', () => {
  const rule = (l) => JSON.parse(readFileSync(new URL(`../../src/content/rules.${l}.json`, import.meta.url), 'utf8')).rules.find((r) => r.n === 16);
  const es = rule('es');
  const en = rule('en');
  assert.match(es.says, /lista corta/);
  assert.match(es.says, /15 nov 2026/);
  assert.doesNotMatch(es.says, /En cada slate se abre/);
  assert.match(en.says, /shortlisted/);
  assert.match(en.says, /15 Nov 2026/);
  assert.ok(es.decisions.includes(125) && en.decisions.includes(125));
});
