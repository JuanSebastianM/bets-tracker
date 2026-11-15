// decisions.js: status kinds, themes, the cross-reference tokenizer, highlight, citation graph,
// filters and their URL state. Synthetic text in the sheet's real shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decisionStatusKind, decisionTheme, THEME_IDS, tokenizeRefs, refsIn, highlightSegments, decisionGraph, fold,
  decisionFiltersFromQuery, decisionFiltersToQuery, filterDecisions, newestFirst, groupByMonth, groupByTheme,
  decisionCounts, decisionMatches, parseSheetRule, defaultDecisionFilters,
} from '../../src/data/decisions.js';

const ROWS = Array.from({ length: 124 }, (_, i) => i + 2);
const RULES = Array.from({ length: 36 }, (_, i) => i + 1);
const K = { decisionRows: ROWS, ruleNumbers: RULES };
const links = (text) => tokenizeRefs(text, K).filter((x) => x.type !== 'text').map((x) => (x.type === 'decision' ? `d${x.row}` : `r${x.n}`));

test('status kinds: the four sheet words, accents and case ignored; anything else is other', () => {
  assert.equal(decisionStatusKind('Vigente'), 'in_force');
  assert.equal(decisionStatusKind('provisional'), 'provisional');
  assert.equal(decisionStatusKind('Abierta'), 'open');
  assert.equal(decisionStatusKind('Reemplazada'), 'replaced');
  assert.equal(decisionStatusKind('Vigente (nota)'), 'other');
  assert.equal(decisionStatusKind(''), 'other');
});

test('themes: first match on the topic in the documented order, then the decision text, else workflow', () => {
  const cases = [
    ['Revisión Sombra 150 filas', 'reviews'],
    ['Revisiones: córners de equipo aparte', 'reviews'],
    ['Revisión Grok 30 filas', 'reviews'],
    ['Pestaña Grok', 'grok'],
    ['Apuestas gratis (freebet)', 'staking'],
    ['Excepción: un DNB bajo la mínima', 'staking'],
    ['Escala de stakes por confianza', 'staking'],
    ['Regla 24 (filtro 5: árbitro)', 'filters'],
    ['Regla 23 (brecha modelo vs mercado)', 'filters'],
    ['Cuota de cierre (CLV)', 'measures'],
    ['Puerta de EV justo en líneas que no se mueven', 'measures'],
    ['Stake: página propia primero en el escaneo de valor', 'data'],
    ['Seguimiento en la sombra (Sombra)', 'shadow'],
    ['VALOR PROP: precio primero', 'shadow'],
    ['Tarjetas under del modelo', 'shadow'],
    ['Backtest del modelo vs mercado', 'model'],
    ['IA de Sofascore (regla 16)', 'model'],
    ['Tarjetas de fstats: la roja cuenta 1', 'data'],
    ['Revisar las tres casas siempre', 'data'],
    ['Tareas programadas', 'workflow'],
    ['Mensaje del slate: sin la tabla por partido', 'workflow'],
  ];
  for (const [topic, theme] of cases) assert.equal(decisionTheme({ topic }), theme, topic);
  // Falls back to the decision text.
  assert.equal(decisionTheme({ topic: 'Slate del 9 oct', decision: 'Cayó por el filtro 4.' }), 'filters');
  assert.equal(decisionTheme({ topic: 'Varios', decision: 'Nada en particular.' }), 'workflow');
  assert.deepEqual(new Set(THEME_IDS).size, THEME_IDS.length);
});

test('tokenizer: decision rows, ranges and lists, each number its own link', () => {
  assert.deepEqual(links('ver la fila 110'), ['d110']);
  assert.deepEqual(links('`Decisiones` row 98 y Decisiones rows 63–64'), ['d98', 'd63', 'd64']);
  assert.deepEqual(links('las filas 84-85, 93, 96 y 97 siguen'), ['d84', 'd85', 'd93', 'd96', 'd97']);
  assert.deepEqual(links('reemplaza la fila 22'), ['d22']);
  const t = tokenizeRefs('Decisiones row 110.', K);
  assert.equal(t[0].type, 'decision');
  assert.equal(t[0].text, 'Decisiones row 110');
  assert.equal(t.map((x) => x.text).join(''), 'Decisiones row 110.');
});

test('tokenizer: rows of other tabs, unknown rows and partial groups stay plain', () => {
  assert.deepEqual(links('Sombra fila 412 y `Grok` rows 2–4'), []);
  assert.deepEqual(links('(fila 17 de Apuestas)'), []);
  assert.deepEqual(links('automáticos 4 (filas 125, 127, 128, 143 de Grok)'), []);
  assert.deepEqual(links('las filas 2-515 sin la 508'), []);
  assert.deepEqual(links('fórmulas hasta la fila 301'), []);
  assert.deepEqual(links('150 filas calificadas'), []);
});

test('tokenizer: rules, rule letters, lists; the Reglas tab is not a skill rule', () => {
  assert.deepEqual(links('regla 30 y rule 34e'), ['r30', 'r34']);
  assert.deepEqual(links('reglas 29 y 30; rules 18–20'), ['r29', 'r30', 'r18', 'r20']);
  assert.deepEqual(links('(Reglas rule 4)'), []);
  assert.deepEqual(links('regla 99'), []);
  assert.deepEqual(refsIn('fila 7, regla 28 y otra vez fila 7', K), { rows: [7], rules: [28] });
});

test('tokenizer: text is preserved exactly and nothing becomes markup', () => {
  const src = '<b>fila 7</b> & regla 3 "x"';
  const tokens = tokenizeRefs(src, K);
  assert.equal(tokens.map((x) => x.text).join(''), src);
  assert.ok(tokens.every((x) => typeof x.text === 'string'));
  assert.deepEqual(tokenizeRefs('', K), []);
});

test('highlight: accent- and case-insensitive, offsets on the original text', () => {
  assert.deepEqual(highlightSegments('Revisión Sombra', 'REVISION'), [{ text: 'Revisión', hit: true }, { text: ' Sombra', hit: false }]);
  assert.deepEqual(highlightSegments('córners y CÓRNERS', 'corners').filter((s) => s.hit).map((s) => s.text), ['córners', 'CÓRNERS']);
  assert.deepEqual(highlightSegments('abc', ''), [{ text: 'abc', hit: false }]);
  assert.equal(fold('Ñandú Ó'), 'nandu o');
});

const D = [
  { row: 2, date: '2026-10-09', topic: 'Seguimiento en la sombra (Sombra)', decision: 'Se registra en Sombra.', evidence: 'Larga evidencia con córners.', review: '', status: 'Vigente' },
  { row: 3, date: '2026-10-09', topic: 'Regla 24 (filtro 5)', decision: 'Ver fila 2.', evidence: '', review: 'A las 30 filas.', status: 'Provisional' },
  { row: 4, date: '2026-10-20', topic: 'Revisión Sombra 30 filas', decision: 'Sin cambios (filas 2-3, regla 30).', evidence: '', review: '', status: 'Reemplazada' },
  { row: 5, date: '2026-11-02', topic: 'Pestaña Grok', decision: 'Reemplaza la fila 4.', evidence: 'Fila 5 se cita a sí misma: fila 5.', review: '', status: 'Abierta' },
];

test('graph: cites, cited by and rules; self-references dropped', () => {
  const g = decisionGraph(D, RULES);
  assert.deepEqual(g.get(3).cites, [2]);
  assert.deepEqual(g.get(4).cites, [2, 3]);
  assert.deepEqual(g.get(4).rules, [30]);
  assert.deepEqual(g.get(2).citedBy, [3, 4]);
  assert.deepEqual(g.get(5).cites, [4]);
  assert.deepEqual(g.get(4).citedBy, [5]);
});

test('filters: text over every column (accents ignored), row number, status, theme, dates, in-force view', () => {
  const f = defaultDecisionFilters();
  assert.equal(filterDecisions(D, { ...f, q: 'CORNERS' }).length, 1);
  assert.ok(filterDecisions(D, { ...f, q: '4' }).some((d) => d.row === 4)); // the row number matches too
  assert.deepEqual(filterDecisions(D, { ...f, statuses: ['provisional', 'open'] }).map((d) => d.row), [3, 5]);
  assert.deepEqual(filterDecisions(D, { ...f, themes: ['reviews'] }).map((d) => d.row), [4]);
  assert.deepEqual(filterDecisions(D, { ...f, from: '2026-10-10', to: '2026-10-31' }).map((d) => d.row), [4]);
  assert.deepEqual(filterDecisions(D, { ...f, view: 'now' }).map((d) => d.row), [2, 3]);
  assert.ok(decisionMatches(D[1], 'a las 30'));
});

test('query state round-trips and ignores junk', () => {
  const f = { ...defaultDecisionFilters(), q: 'córners', statuses: ['open'], themes: ['grok', 'model'], from: '2026-10-01', to: '', view: 'now', page: 3 };
  const qs = decisionFiltersToQuery(/** @type {any} */ (f));
  assert.deepEqual(decisionFiltersFromQuery(Object.fromEntries(new URLSearchParams(qs))), f);
  assert.equal(decisionFiltersToQuery(defaultDecisionFilters()), '');
  const junk = decisionFiltersFromQuery({ st: 'nope,open', th: 'x', from: '2026-1-1', page: '-2', view: 'z' });
  assert.deepEqual([junk.statuses, junk.themes, junk.from, junk.page, junk.view], [['open'], [], '', 1, 'timeline']);
});

test('ordering, grouping and counts', () => {
  assert.deepEqual(newestFirst(D).map((d) => d.row), [5, 4, 3, 2]);
  assert.deepEqual(groupByMonth(newestFirst(D)).map((g) => [g.month, g.items.length]), [['2026-11', 1], ['2026-10', 3]]);
  assert.deepEqual(groupByTheme(D).map((g) => g.theme), ['reviews', 'grok', 'filters', 'shadow']);
  assert.deepEqual(decisionCounts(D), { total: 4, inForceNow: 2, byStatus: { in_force: 1, provisional: 1, open: 1, replaced: 1, other: 0 } });
});

test('sheet rule lines split into number and text', () => {
  assert.deepEqual(parseSheetRule('8. Stake máximo: el menor entre 2u y 1/4 de Kelly.'), { n: 8, text: 'Stake máximo: el menor entre 2u y 1/4 de Kelly.' });
  assert.deepEqual(parseSheetRule('Sin número'), { n: null, text: 'Sin número' });
});
