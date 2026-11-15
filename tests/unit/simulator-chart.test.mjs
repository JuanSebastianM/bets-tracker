// MultiLineChart's shared y range (src/lib/charts, added with the Simulator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seriesExtent } from '../../src/lib/charts/index.js';

test('seriesExtent covers every series and the zero line', () => {
  assert.deepEqual(seriesExtent([{ values: [1, 3] }, { values: [-2, 0.5] }]), [-2, 3]);
  assert.deepEqual(seriesExtent([{ values: [2, 4] }]), [0, 4]);
  assert.deepEqual(seriesExtent([{ values: [0, 0] }]), [0, 1]);
  assert.equal(seriesExtent([{ values: [] }]), null);
  assert.deepEqual(seriesExtent([{ values: [NaN, 1] }]), [0, 1]);
});
