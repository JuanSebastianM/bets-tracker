// Accessibility pass: spoken forms, the lang of sheet text, and the contrast of the colour tokens
// computed from src/styles/tokens.css itself (so a token change that breaks AA fails here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadAllStrings } from './helpers/strings.mjs';
import { setLocale } from '../../src/lib/i18n.js';
import { spokenRecord, sheetLang } from '../../src/lib/spoken.js';

loadAllStrings('es');

test('spokenRecord says each part with its noun and leaves out the zeros', () => {
  setLocale('es');
  assert.equal(spokenRecord({ won: 7, lost: 10, void: 2 }), '7 ganadas, 10 perdidas, 2 nulas');
  assert.equal(spokenRecord({ won: 15, lost: 19, void: 0, halfWon: 1, halfLost: 0 }), '15 ganadas, 19 perdidas, 1 media');
  assert.equal(spokenRecord({ won: 1, lost: 0, void: 0 }), '1 ganada, 0 perdidas');
  assert.equal(spokenRecord({ won: 0, lost: 0, void: 0 }), 'sin picks calificados');
  setLocale('en');
  assert.equal(spokenRecord({ won: 6, lost: 12, void: 2, halfWon: 1, halfLost: 1 }), '6 won, 12 lost, 2 void, 2 half results');
  setLocale('es');
});

test('sheet text is marked Spanish only when the UI is not', () => {
  assert.equal(sheetLang('es'), undefined);
  assert.equal(sheetLang('en'), 'es');
});

// ---- token contrast
const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
/** @param {string} selector */
function tokens(selector) {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of body.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[m[1]] = m[2];
  return out;
}
const light = tokens(':root');
const dark = { ...light, ...tokens("[data-theme='dark']") };
const rgb = (/** @type {string} */ h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (/** @type {string} */ h) => {
  const [r, g, b] = rgb(h).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (/** @type {string} */ a, /** @type {string} */ b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const SURFACES = ['bg', 'surface', 'surface-2', 'raised'];
/** Text tokens on every surface, 4.5:1. */
const TEXT = ['ink', 'ink-2', 'muted', 'accent', 'won', 'lost', 'void', 'pending', 'info'];
/** Text on its own soft fill (chips and badges), 4.5:1. */
const ON_SOFT = [['won', 'won-soft'], ['lost', 'lost-soft'], ['void', 'void-soft'], ['pending', 'pending-soft'], ['info', 'info-soft'], ['accent', 'accent-soft'], ['accent-ink', 'accent'], ['muted', 'surface-2'], ['ink-2', 'accent-soft']];
/** Boundaries and the focus ring, 3:1 against every surface. */
const UI = ['control-line', 'focus', 'accent', 'won', 'lost'];

for (const [name, theme] of [['light', light], ['dark', dark]]) {
  test(`${name} theme: text tokens reach 4.5:1 and control boundaries 3:1 on every surface`, () => {
    const fails = [];
    for (const s of SURFACES) {
      for (const c of TEXT) {
        const r = contrast(theme[c], theme[s]);
        if (r < 4.5) fails.push(`--c-${c} ${theme[c]} on --c-${s} ${theme[s]}: ${r.toFixed(2)}`);
      }
      for (const c of UI) {
        const r = contrast(theme[c], theme[s]);
        if (r < 3) fails.push(`--c-${c} ${theme[c]} on --c-${s} ${theme[s]}: ${r.toFixed(2)} (needs 3)`);
      }
    }
    for (const [c, s] of ON_SOFT) {
      const r = contrast(theme[c], theme[s]);
      if (r < 4.5) fails.push(`--c-${c} ${theme[c]} on --c-${s} ${theme[s]}: ${r.toFixed(2)}`);
    }
    assert.deepEqual(fails, []);
  });
}
