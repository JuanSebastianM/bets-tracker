// Analysis section: URL view state (view.js), group labels, the plain sentences (text.js) and
// formatScore (added to format.js for Brier scores).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadAllStrings } from './helpers/strings.mjs';
import { mkPick } from './helpers/picks.mjs';
import { setLocale } from '../../src/lib/i18n.js';
import { formatScore } from '../../src/lib/format.js';
import { defaultFilters } from '../../src/data/filters.js';
import { normalizeFeed } from '../../src/data/normalize.js';
import { breakdown, calibrationReport, measureDistribution, pinnacleMoves, grokPricedSplit, grokTeamCorners, DIMENSION_IDS } from '../../src/data/analysis.js';
import { summarize } from '../../src/data/stats.js';
import { closeVerdict } from '../../src/data/overview.js';
import { viewOf, viewQuery, partOf, analysisPath, DEFAULT_VIEW } from '../../src/features/analysis/view.js';
import { groupLabel, dimLabel } from '../../src/features/analysis/labels.js';
import { breakdownText, calibrationText, closeText, clvText, pinnacleText, grokText } from '../../src/features/analysis/text.js';

loadAllStrings('es');
const fixture = normalizeFeed(JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8')));

test('formatScore: fixed decimals with a dot', () => {
  assert.equal(formatScore(0.24412), '0.244');
  assert.equal(formatScore(0.25, 2), '0.25');
  assert.equal(formatScore(null), '–');
});

test('view: defaults, validation and the round trip through the query', () => {
  assert.deepEqual(viewOf({}), DEFAULT_VIEW);
  const v = viewOf({ dim: 'priceBand', dim2: 'tag', sort: 'yield', measure: 'yield', minn: '25', small: 'hide', series: 'ai' });
  assert.deepEqual(v, { dim: 'priceBand', dim2: 'tag', sort: 'yield', dir: 'desc', measure: 'yield', minn: 25, small: 'hide', series: 'ai' });
  assert.equal(viewOf({ dim: 'nope' }).dim, 'tag');
  assert.equal(viewOf({ dim: 'tag', dim2: 'tag' }).dim2, '');
  assert.equal(viewOf({ minn: '500' }).minn, 50);
  assert.equal(viewOf({ minn: '0' }).minn, 0);
  assert.equal(viewOf({ minn: 'x' }).minn, DEFAULT_VIEW.minn);
  const f = { ...defaultFilters(), tags: ['value'] };
  const qs = viewQuery(f, v);
  const q = Object.fromEntries(new URLSearchParams(qs));
  assert.equal(q.tag, 'value');
  assert.deepEqual(viewOf(q), v);
  assert.equal(viewQuery(defaultFilters(), DEFAULT_VIEW), '');
  assert.equal(analysisPath('close', defaultFilters(), DEFAULT_VIEW), '/analysis/close');
  assert.equal(partOf(undefined), 'breakdown');
  assert.equal(partOf('grok'), 'grok');
  assert.equal(partOf('x'), 'breakdown');
});

test('labels: sheet tag labels, bands, weekdays, every dimension named', () => {
  assert.equal(groupLabel('tag', 'near_value'), 'VALOR CASI');
  assert.equal(groupLabel('market', 'corners_team'), 'Córners de equipo');
  assert.equal(groupLabel('priceBand', '170_200'), '1.70–2.00');
  assert.equal(groupLabel('probBand', '40_50'), '40% a 50%');
  assert.equal(groupLabel('probBand', 'lt30'), '< 30%');
  assert.equal(groupLabel('evBand', 'lt0'), '< 0%');
  assert.equal(groupLabel('evBand', 'ge20'), '≥ +20%');
  assert.equal(groupLabel('weekday', '7'), 'Domingo');
  assert.equal(groupLabel('sample', '6-9'), '6–9');
  for (const d of DIMENSION_IDS) assert.ok(!dimLabel(d).startsWith('analysis.'), d);
  setLocale('en');
  assert.equal(groupLabel('weekday', '1'), 'Monday');
  assert.equal(groupLabel('tag', 'near_value'), 'VALOR CASI');
  setLocale('es');
});

test('breakdownText names the best and worst with n, and the minimum', () => {
  const { rows } = breakdown(fixture.picks, 'tag');
  const s = breakdownText({ dim: 'Etiqueta', rows, minN: 10, measure: 'yield', labelOf: (k) => groupLabel('tag', k) });
  assert.match(s, /grupos de «Etiqueta» tienen al menos 10 calificadas/);
  assert.match(s, /Yield más alto: .+\(n \d+\); más bajo: .+\(n \d+\)/);
  const none = breakdownText({ dim: 'Etiqueta', rows, minN: 50, measure: 'ev', labelOf: (k) => k });
  assert.match(none, /Ningún grupo de «Etiqueta» llega todavía a 50/);
  assert.equal(breakdownText({ dim: 'x', rows: [], minN: 1, measure: 'ev', labelOf: (k) => k }), 'No hay picks con estos filtros.');
  const ev = breakdownText({ dim: 'Etiqueta', rows, minN: 5, measure: 'ev', labelOf: (k) => k });
  assert.match(ev, /cierres con los dos lados|con todo su rango/);
});

test('calibrationText: prediction, hit rate, Brier, the market and the small-n caution', () => {
  const r = calibrationReport(fixture.picks, 'model');
  const s = calibrationText('Prob. del modelo', r);
  assert.match(s, new RegExp(`acertó [\\d.]+% en ${r.n} picks \\(Brier 0\\.\\d{3}\\)`));
  assert.match(s, /calibra mejor|prácticamente igual/);
  const small = calibrationReport([mkPick({ probModel: 0.6, status: 'won' })], 'model');
  assert.match(calibrationText('X', small), /Ninguno tiene cierre.*Con n 1 es muy pronto/);
  assert.equal(calibrationText('X', calibrationReport([], 'ai')), 'X: no hay picks ganados o perdidos con esta probabilidad.');
});

test('close, CLV and Pinnacle sentences say n', () => {
  const d = measureDistribution(fixture.picks, (p) => p.fairCloseEv);
  assert.match(closeText(d.stat, closeVerdict(d.stat)), new RegExp(`de ${d.stat.n} picks le ganaron al cierre sin margen`));
  assert.equal(closeText(measureDistribution([], (p) => p.fairCloseEv).stat, 'none'), 'Ningún pick calificado con estos filtros tiene cierre con los dos lados.');
  assert.match(clvText(measureDistribution(fixture.picks, (p) => p.clv).stat), /CLV bruto .* en \d+ picks/);
  const pin = pinnacleMoves(fixture.picks, fixture.pinnacle);
  assert.match(pinnacleText(pin), /tienen id de Pinnacle; cruzados con la pestaña Pinnacle: 1\..*hacia el pick en 1.*muy pocos/);
  assert.match(pinnacleText(pinnacleMoves([], [])), /Ningún pick de resultado/);
});

test('grokText compares on n and stays even-handed', () => {
  const picks = fixture.picks;
  const all = summarize(picks.filter((p) => p.source === 'grok'));
  const s = grokText({ all, split: grokPricedSplit(picks), tc: grokTeamCorners(picks) });
  assert.match(s, /^Grok va .*n \d+/);
  assert.match(s, /Los que nuestro script cotizó van .*\(n \d+\); los que no pudo cotizar, .*\(n \d+\)/);
  assert.match(s, /Todavía no coinciden en ningún partido/);
  assert.match(s, /muestras pequeñas/);
  assert.equal(grokText({ all: summarize([]), split: grokPricedSplit([]), tc: grokTeamCorners([]) }), 'No hay picks de Grok con estos filtros.');
});

test('analysisPath keeps the bare /analysis path when asked', () => {
  assert.equal(analysisPath('breakdown', { ...defaultFilters(), sources: ['shadow'] }, DEFAULT_VIEW, true), '/analysis?src=shadow');
  assert.equal(analysisPath('breakdown', { ...defaultFilters(), sources: ['shadow'] }, DEFAULT_VIEW), '/analysis/breakdown?src=shadow');
});
