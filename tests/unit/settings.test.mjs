import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, bankrollUnits, toMoney, DEFAULT_SETTINGS, updateSettings, settingsStore, savePreset, deletePreset, resetSettings } from '../../src/data/settings.js';

test('sanitize keeps only valid values', () => {
  assert.deepEqual(sanitize(null), DEFAULT_SETTINGS);
  const s = sanitize({ theme: 'neon', bankroll: -5, unitValue: '7', currency: 'ABCDEFGHIJ', defaultStake: 0, presets: [{ name: 'x', query: 'tag=value' }, { bad: 1 }] });
  assert.equal(s.theme, 'auto');
  assert.equal(s.bankroll, null);
  assert.equal(s.unitValue, null);
  assert.equal(s.currency, 'ABCDEFGH');
  assert.equal(s.defaultStake, 1);
  assert.equal(s.presets.length, 1);
});

test('units and money conversions use only the user settings', () => {
  assert.equal(bankrollUnits({ ...DEFAULT_SETTINGS, bankroll: 500, unitValue: 5 }), 100);
  assert.equal(bankrollUnits(DEFAULT_SETTINGS), null);
  assert.equal(toMoney(2, { ...DEFAULT_SETTINGS, unitValue: 5 }), 10);
  assert.equal(toMoney(2, DEFAULT_SETTINGS), null);
});

test('update, presets, reset (no localStorage in Node: in memory only)', () => {
  updateSettings({ theme: 'dark', bankroll: 200 });
  assert.equal(settingsStore.get().theme, 'dark');
  savePreset('Valor ≤2', 'tag=value&price=le200');
  const id = settingsStore.get().presets[0].id;
  deletePreset(id);
  assert.equal(settingsStore.get().presets.length, 0);
  resetSettings();
  assert.equal(settingsStore.get().bankroll, null);
});
