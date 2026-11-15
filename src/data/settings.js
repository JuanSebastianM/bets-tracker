// Settings kept in this browser's localStorage. Nothing here is ever sent anywhere.
//
//   const s = useSettings();          // { theme, bankroll, unitValue, currency, defaultStake, presets }
//   updateSettings({ theme: 'dark' });
//   toMoney(2.5)                      // units -> money with the user's unit value, or null when unset

import { createStore, useStore } from '../lib/store.js';
import { readJSON, writeJSON, removeKey } from '../lib/storage.js';

/**
 * @typedef {object} SavedPreset
 * @property {string} id
 * @property {string} name
 * @property {string} query  filter query string (src/data/filters.js toQueryString)
 */

/**
 * @typedef {object} Settings
 * @property {'auto' | 'light' | 'dark'} theme
 * @property {number | null} bankroll    the user's bankroll in money (their own figure)
 * @property {number | null} unitValue   money per unit (their own figure)
 * @property {string} currency           label shown next to money ("COP", "$"…), typed by the user
 * @property {number} defaultStake       units per pick in the Simulator
 * @property {SavedPreset[]} presets
 * @property {string | null} lastVisit   ISO instant of the previous visit ("what changed")
 */

const KEY = 'settings';

/** @type {Settings} */
export const DEFAULT_SETTINGS = {
  theme: 'auto',
  bankroll: null,
  unitValue: null,
  currency: '',
  defaultStake: 1,
  presets: [],
  lastVisit: null,
};

const THEMES = ['auto', 'light', 'dark'];

/** Keep only valid fields. @param {any} raw @returns {Settings} */
export function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const pos = (/** @type {any} */ v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  return {
    theme: THEMES.includes(r.theme) ? r.theme : 'auto',
    bankroll: pos(r.bankroll),
    unitValue: pos(r.unitValue),
    currency: typeof r.currency === 'string' ? r.currency.slice(0, 8) : '',
    defaultStake: pos(r.defaultStake) ?? 1,
    presets: Array.isArray(r.presets)
      ? r.presets.filter((p) => p && typeof p.name === 'string' && typeof p.query === 'string').map((p) => ({ id: String(p.id || p.name), name: p.name.slice(0, 40), query: p.query }))
      : [],
    lastVisit: typeof r.lastVisit === 'string' ? r.lastVisit : null,
  };
}

export const settingsStore = createStore(sanitize(readJSON(KEY, DEFAULT_SETTINGS)));

/** @param {Partial<Settings>} patch */
export function updateSettings(patch) {
  const next = sanitize({ ...settingsStore.get(), ...patch });
  writeJSON(KEY, next);
  settingsStore.set(next);
  if ('theme' in patch) applyTheme(next.theme);
}

/** Forget the money settings (bankroll, unit value, currency). */
export function clearMoney() {
  updateSettings({ bankroll: null, unitValue: null, currency: '' });
}

/** Remove every setting (tests). */
export function resetSettings() {
  removeKey(KEY);
  settingsStore.set({ ...DEFAULT_SETTINGS });
}

/** @returns {Settings} */
export function useSettings() {
  return useStore(settingsStore);
}

/** Bankroll in units (bankroll / unit value), or null when either is unset. @param {Settings} [s] */
export function bankrollUnits(s = settingsStore.get()) {
  return s.bankroll && s.unitValue ? s.bankroll / s.unitValue : null;
}

/** Units -> money with the user's unit value, or null when unset. @param {number} units @param {Settings} [s] */
export function toMoney(units, s = settingsStore.get()) {
  return s.unitValue ? units * s.unitValue : null;
}

/** @param {string} name @param {string} query */
export function savePreset(name, query) {
  const s = settingsStore.get();
  const id = `${Date.now().toString(36)}`;
  updateSettings({ presets: [...s.presets.filter((p) => p.name !== name), { id, name, query }] });
}

/** @param {string} id */
export function deletePreset(id) {
  updateSettings({ presets: settingsStore.get().presets.filter((p) => p.id !== id) });
}

/**
 * Apply a theme to <html> (data-theme light|dark, data-mode auto|light|dark) and the theme-color meta.
 * src/lib/theme-boot.js does the same before first paint.
 * @param {Settings['theme']} theme
 */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const dark = theme === 'dark' || (theme === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.setAttribute('data-mode', theme);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  const bg = getComputedStyle(root).getPropertyValue('--c-bg').trim();
  if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}

/** Follow the system scheme while the theme is 'auto'. */
export function watchSystemTheme() {
  if (typeof matchMedia === 'undefined') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settingsStore.get().theme === 'auto') applyTheme('auto');
  });
}
