// Price preset and band labels say exactly what they include. The expected label of each preset is
// derived here from how applyFilters treats its two bounds (probed with prices on and next to them),
// not from the label function itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRICE_PRESETS, applyFilters, defaultFilters, priceRangeLabel } from '../../src/data/filters.js';
import { PRICE_BANDS, priceBand } from '../../src/data/stats.js';
import { mkPick } from './helpers/picks.mjs';

const passes = (id, price) => applyFilters([mkPick({ price })], { ...defaultFilters(), pricePreset: id }, { today: '2026-11-15' }).length === 1;
const two = (v) => v.toFixed(2);

/** Label form from the observed behaviour at the bounds. */
function expectedLabel(p) {
  const loInc = p.min == null ? null : passes(p.id, p.min);
  const hiInc = p.max == null ? null : passes(p.id, p.max);
  if (p.min == null) return `${hiInc ? '≤' : '<'} ${two(p.max)}`;
  if (p.max == null) return `${loInc ? '≥' : '>'} ${two(p.min)}`;
  if (loInc && hiInc) return `${two(p.min)}–${two(p.max)}`;
  return `${loInc ? '≥' : '>'} ${two(p.min)}, ${hiInc ? '≤' : '<'} ${two(p.max)}`;
}

test('every price preset label matches what the preset includes at each end', () => {
  for (const p of PRICE_PRESETS) {
    assert.equal(p.label, expectedLabel(p), p.id);
    // just inside the range passes, just outside does not
    if (p.min != null) assert.equal(passes(p.id, p.min + 0.001), true, `${p.id} just above min`), assert.equal(passes(p.id, p.min - 0.001), false, `${p.id} below min`);
    if (p.max != null) assert.equal(passes(p.id, p.max - 0.001), true, `${p.id} just below max`), assert.equal(passes(p.id, p.max + 0.001), false, `${p.id} above max`);
  }
});

test('the presets Juan asked for keep their meaning', () => {
  const at = (id) => [1.7, 1.99, 2.0, 2.01, 2.5, 2.51].filter((v) => passes(id, v));
  assert.deepEqual(at('le200'), [1.7, 1.99, 2.0]);
  assert.deepEqual(at('lt200'), [1.7, 1.99]);
  assert.deepEqual(at('le250'), [1.7, 1.99, 2.0, 2.01, 2.5]);
  assert.equal(PRICE_PRESETS.find((p) => p.id === 'le200').label, '≤ 2.00');
  assert.equal(PRICE_PRESETS.find((p) => p.id === 'lt200').label, '< 2.00');
  assert.equal(PRICE_PRESETS.find((p) => p.id === 'le250').label, '≤ 2.50');
});

test('each breakdown band is labelled by the preset of the same id and holds the same prices', () => {
  const probe = [1.5, 1.699, 1.7, 1.701, 1.999, 2.0, 2.001, 2.499, 2.5, 2.501, 3.999, 4.0, 4.001, 12];
  for (const b of PRICE_BANDS) {
    const preset = PRICE_PRESETS.find((p) => p.id === b.id);
    assert.ok(preset, `band ${b.id} has a preset`);
    for (const v of probe) assert.equal(priceBand(v) === b.id, passes(b.id, v), `${b.id} at ${v}`);
  }
  assert.equal(PRICE_PRESETS.find((p) => p.id === '200_250').label, '> 2.00, ≤ 2.50');
  assert.equal(PRICE_PRESETS.find((p) => p.id === '170_200').label, '1.70–2.00');
});

test('priceRangeLabel covers the four mixes of open and closed ends', () => {
  assert.equal(priceRangeLabel({ min: 1.7, max: 2, minInc: true, maxExc: true }), '≥ 1.70, < 2.00');
  assert.equal(priceRangeLabel({ min: 1.7, max: 2, maxExc: true }), '> 1.70, < 2.00');
  assert.equal(priceRangeLabel({ min: 1.7, max: null, minInc: true }), '≥ 1.70');
  assert.equal(priceRangeLabel({ min: null, max: null }), '');
});
