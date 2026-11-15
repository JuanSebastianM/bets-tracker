// Audit: early Grok verdict shapes in the real sheet (Oct 2026) that the classifiers left as "other".
// Synthetic texts with the same shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGrok } from '../../src/data/tags.js';
import { grokVerdict } from '../../src/data/analysis.js';

test('audit: "Mercado primero" verdicts are rule-29 pricings', () => {
  const a = 'Mercado primero (regla 29): justa 50.0% (Betano O1.80/U1.95), cuota justa 2.00 → valor -11.0% a 1.78. Modelo 52.0% (contexto)';
  const b = 'Mercado primero: justa 46.0% (Betano O1.70/U2.10), cuota justa 2.17 → valor -9.0% a 1.97. Modelo 47.0% (contexto)';
  for (const t of [a, b]) {
    assert.equal(classifyGrok(t), 'grok_priced');
    const v = grokVerdict(t);
    assert.equal(v.kind, 'priced_rule29');
    assert.equal(v.why, 'no_value');
  }
});

test('audit: "<market> no cotizado; …" is not priced', () => {
  const t = 'Marcador exacto no cotizado; estimado modelo ~25% vs mercado ~15% → F-gap';
  assert.equal(classifyGrok(t), 'grok_not_priced');
  assert.equal(grokVerdict(t).kind, 'not_priced');
});

test('audit: the usual shapes keep their class', () => {
  assert.equal(classifyGrok('Cotizado: modelo 50.0% vs mercado 40.0% → SKIP: F-gap'), 'grok_priced');
  assert.equal(classifyGrok('No cotizado: sin referencia'), 'grok_not_priced');
  assert.equal(classifyGrok(''), 'grok_other');
  assert.equal(classifyGrok('Pendiente de revisar'), 'grok_other');
  assert.equal(grokVerdict('Cotizado (regla 29): consenso justo 9.0% → SKIP regla 29: valor Stake 9.40 -7.9%, necesita 3%').why, 'skip');
  assert.equal(grokVerdict('Cotizado: modelo 55% vs mercado 50% → valor +4%').why, 'value');
});
