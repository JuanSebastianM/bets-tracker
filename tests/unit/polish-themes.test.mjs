// Decision themes on synthetic topics with the shapes of the real Decisiones topics (read only on
// 15 Nov 2026, nothing copied): few topics may reach the catch-all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionTheme, decisionThemeMatch, THEME_IDS } from '../../src/data/decisions.js';

const CASES = [
  // Narrow shapes checked first.
  ['Tareas de cierre (clv-scheduler): solo filas de prueba', 'workflow'],
  ['Script de la nota X fuera del skill: otro skill con hash', 'workflow'],
  ['Auditoría del 2 dic: cambios por fases; fase 2', 'workflow'],
  ['Los comandos buscan en dos carpetas', 'workflow'],
  ['slate.json lo arma un script guardado (v2.0)', 'workflow'],
  ['Ventana del slate: de las 05:00 a las 04:59', 'workflow'],
  ['Auditoría de CLV (Sombra, Grok): CLV bruto vs EV justo', 'measures'],
  ['Cierres del feed: una línea sin cotizar no se reintenta', 'measures'],
  ['CLV: medida principal con dos lados', 'measures'],
  ['IA de Sofascore vs bet365 en tiros: muestra ampliada', 'model'],
  ['Backtest de calibración de goles (cierra la fila 40)', 'model'],
  ['Escaneo de valor en ligas chicas; muestras cortas', 'data'],
  ['Árbitros: campo nuevo y endpoint confirmados', 'data'],
  ['OddAlerts evaluado frente a otra fuente', 'data'],
  ['Regla 25 (tiros de equipo)', 'shadow'],
  ['Prueba MOV: otra anotación en N', 'shadow'],
  ['Pruebas del modelo congeladas: una decisión por prueba, por precio contra el cierre', 'shadow'],
  // Broad patterns.
  ['Revisión Sombra 700 filas', 'reviews'],
  ['Revisiones: valor con corte en cuota 2.5 (tras la revisión de 700 filas)', 'reviews'],
  ['Pestaña Grok: solo córners de equipo', 'grok'],
  ['Al volver el dinero real a un mercado', 'staking'],
  ['F-gap en tiros (regla 36)', 'filters'],
  ['Media de tarjetas del árbitro', 'filters'],
  ['Puerta de EV justo en líneas que no se mueven', 'measures'],
  ['VALOR: sin veredicto a cuota mayor de 5.0', 'shadow'],
  ['Tarjetas under del modelo: línea de control', 'shadow'],
  ['Minutos de goles de fstats fallaron', 'data'],
  // How runs work (these used to reach the catch-all).
  ['Slate del 3 nov: sin apuesta', 'workflow'],
  ['Skill: liga nueva y logo vacío', 'workflow'],
  ['Calificación sin navegador', 'workflow'],
  ['Corrección del registro del 2 nov', 'workflow'],
  ['Escritura en la hoja: siempre con append', 'workflow'],
  ['Lecturas de la hoja y tamaño de los skills', 'workflow'],
  ['Slates grandes: lectura por subagentes', 'workflow'],
  ['Mensaje del slate: más corto', 'workflow'],
];

test('themes: synthetic topics of the real shapes land where they belong, by the topic itself', () => {
  for (const [topic, theme] of CASES) {
    const m = decisionThemeMatch({ topic });
    assert.equal(m.theme, theme, topic);
    assert.equal(m.by, 'topic', `${topic} should be decided by its topic`);
    assert.equal(decisionTheme({ topic }), theme);
  }
});

test('themes: the catch-all is only for text that matches nothing', () => {
  assert.deepEqual(decisionThemeMatch({ topic: 'Varios', decision: 'Nada en particular.' }), { theme: 'workflow', by: 'fallback' });
  assert.deepEqual(decisionThemeMatch({ topic: 'Varios', decision: 'Cayó por el filtro 4.' }), { theme: 'filters', by: 'decision' });
  const fallback = CASES.filter(([topic]) => decisionThemeMatch({ topic }).by === 'fallback');
  assert.equal(fallback.length, 0);
});

test('themes: display order is fixed and every theme is used', () => {
  assert.deepEqual(THEME_IDS, ['reviews', 'grok', 'staking', 'filters', 'measures', 'data', 'shadow', 'model', 'workflow']);
  const used = new Set(CASES.map(([, th]) => th));
  for (const id of THEME_IDS) assert.ok(used.has(id), id);
});

// Staking rule lines of the Reglas tab: synthetic lines with the shapes of the real ones (read only,
// rows 8-40, never rows 1-7), matched by number and keyword.
import { sheetRuleSlug, SHEET_RULE_BY_N, SHEET_RULE_SLUGS } from '../../src/lib/glossary-links.js';
import { readFileSync } from 'node:fs';

test('staking rules: number plus keyword, keyword list as the fallback, every slug exists', () => {
  const lines = [
    ['2. Stake entre 0,5u y 3u por apuesta.', 'stake'],
    ['3. Sencillas: solo cuota ≥ 1,80 y EV ≥ 5%.', 'minimum-price'],
    ['4. Dobles: cada selección con probabilidad ≥ 85%.', 'double-bet'],
    ['5. En vivo: nada de perseguir.', 'live-bet'],
    ['6. No apostar líneas finas.', 'fair-price'],
    ['7. Solo ligas favoritas de la app.', 'favorites'],
    ['8. Stake máximo: el menor entre 3u y 1/4 de Kelly.', 'kelly'],
    ['9. Registrar la cuota de cierre y seguir el CLV.', 'clv'],
    ['10. Marcar Sí en Excepción favoritos fuera de las ligas.', 'favorites'],
    ['11. Calibración (Brier score) con 30 o más apuestas.', 'calibration'],
  ];
  for (const [line, slug] of lines) assert.equal(sheetRuleSlug(line), slug, line);
  // The caller may pass the text and the number apart (the Decisions screen does).
  assert.equal(sheetRuleSlug('Calibración con 30 apuestas.', 11), 'calibration');
  // A renumbered line keeps its meaning through the keywords, not the number.
  assert.equal(sheetRuleSlug('8. Registrar la cuota de cierre y el CLV.'), 'clv');
  assert.equal(sheetRuleSlug('12. Algo nuevo'), 'sheet-rules');
  const g = JSON.parse(readFileSync(new URL('../../src/content/glossary.es.json', import.meta.url), 'utf8'));
  const slugs = new Set(g.entries.map((e) => e.slug));
  for (const [, slug] of [...Object.values(SHEET_RULE_BY_N), ...SHEET_RULE_SLUGS]) assert.ok(slugs.has(slug), slug);
});
