// tags.js: every reason format seen in the sheet (synthetic numbers, real shapes) lands in the
// intended tag, in review.py's order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyShadow, classifyGrok, marketFamily, reviewClass, sideOf, filterReasons, booksInReason, isModelTag, tagLabel, passedAll } from '../../src/data/tags.js';

const CASES = [
  ['PUBLICADA Y APOSTADA (Apuestas ID 9)', 'published_bet'],
  ['PUBLICADA, NO APOSTADA (top #3, 0.5u)', 'published'],
  ['VALOR PROP CASI: Stake 1.94 vs justa 1.91 (+1.6%)', 'prop_near_value'],
  ['VALOR PROP: Betsson 2.40 vs justa 2.18 (+10.1%)', 'prop_value'],
  ['VALOR CASI: Betsson 2.06 vs justa 2.02 (+2.0%)', 'near_value'],
  ['VALOR CASI: Stake 1.77 vs justa 1.74 (+1.7%, bajo el 3%); relleno (c) de prueba', 'near_value'],
  ['VALOR: Stake/Betano 1.98 vs justa 1.90 (+4.2%)', 'value'],
  ['TARJETAS UNDER (modelo): rule 3 razor; F-gap: modelo 57.3% vs mercado 46.2% (media 3.88, línea 4.5)', 'cards_under'],
  ['CÓRNERS EQUIPO: modelo 48.1% vs mercado 33.0% (media 5.41)', 'team_corners'],
  ['CÓRNERS EQUIPO (SHADOW, pasó todos los filtros): modelo 51.7% vs mercado 41.9% (media 5.73)', 'team_corners'],
  ['CÓRNERS RECHAZO ≤2.0: F-gap: modelo 62.8% vs mercado 52.4% (media 8.94, línea 9.5)', 'corner_rejects'],
  ['MODELO SOLO (tiros): modelo 71.9% vs mercado 58.2% (media 18.31, línea 22.5)', 'model_only_shots'],
  ['SHADOW (pasó todos los filtros, regla 30): modelo 56.2% vs mercado 55.1% (media 4.71)', 'shadow_rule30'],
  ['SHADOW: tarjetas/córners en pausa (regla 30); pasó todos los filtros, EV blend +1.4%', 'shadow_rule30'],
  ['SHADOW: córners pausados (regla 30)', 'shadow_rule30'],
  ['SHADOW: tarjetas, 7 PJ (regla 18)', 'shadow'],
  ['SHADOW: SoT/tiros (regla 25), 9 partidos', 'shadow'],
  ['SHADOW: short sample: 8 games (count stats need 6); market not reviewed yet (SoT): shadow only', 'shadow'],
  ['IA-WATCH: IA media 11 vs línea 9.5 (IA 63.4% vs línea 49.8%)', 'ai_watch'],
  ['Pasó todos los filtros; edge <4% (EV +3.1%), stake máx 0.25u. Fuera del slate.', 'low_edge'],
  ['Stake < 0.25u (EV blend +1.1%); SHADOW: mercado sin historia', 'low_edge'],
  ['F-ratio; F-gap', 'filter_reject'],
  ['F-ratio + F-gap (modelo 63.9% vs mercado 41.4%); muestra 7 partidos; SHADOW: mercado sin historia', 'filter_reject'],
  ['Muestra (6); brecha >10 pts; ratio 1.47x', 'filter_reject'],
  ['Filtro 4 (últimos 5): EV blend baja a -0.4%', 'filter_reject'],
  ['Regla 1: media modelo 8.62 bajo la línea 9.5', 'filter_reject'],
  ['SKIP (relleno): razor, F-gap: modelo 55.6% vs mercado 44.9%', 'filter_reject'],
  ['Salto: solo filtro 5 (árbitro 4.86/p, EV blend -1.3%)', 'filter_reject'],
  ['rule 3 razor: line 10.5 within 0.5 of model mean 10.21', 'filter_reject'],
  ['', 'filter_reject'],
];

test('Sombra reasons map to the intended tag', () => {
  for (const [reason, tag] of CASES) assert.equal(classifyShadow(reason), tag, reason);
});

test('Grok verdicts', () => {
  assert.equal(classifyGrok('Cotizado: modelo 49.2% vs mercado 36.7% → SKIP: F-ratio'), 'grok_priced');
  assert.equal(classifyGrok('Cotizado (regla 29): consenso justo 6.1%'), 'grok_priced');
  assert.equal(classifyGrok('No cotizado: el modelo no cubre este mercado'), 'grok_not_priced');
  assert.equal(classifyGrok(''), 'grok_other');
});

test('market families and review classes', () => {
  const fam = {
    '1X2': 'result', '1X2 1er tiempo': 'result', '1X2 2.º tiempo': 'result', 'Doble oportunidad': 'result', 'Empate no apuesta': 'result',
    'Hándicap asiático': 'result', '1X2 (pago anticipado 2 goles)': 'result', Goles: 'goals', 'Goles totales': 'goals', BTTS: 'goals',
    'Ambos marcan': 'goals', 'Ambos anotan': 'goals', 'Goles (asiático)': 'goals', 'Goles equipo': 'goals', 'Goles 1er tiempo': 'goals',
    'Córners totales': 'corners_total', 'Córners equipo': 'corners_team', 'Córners 1X2': 'corners_team', 'Más córners (equipo)': 'corners_team',
    'Más córners 2.º tiempo': 'corners_team', 'Tarjetas totales': 'cards_total', 'Tarjetas equipo': 'cards_team', 'Tarjetas 1X2': 'cards_team',
    'Más tarjetas (3 vías)': 'cards_team', 'Tiros (equipo)': 'shots', 'Tiros al arco (total)': 'shots', 'Tiros totales': 'shots',
    'Tiros al arco equipo': 'shots', 'Goles + córners': 'combo', 'Marcador correcto': 'other', 'Primer goleador': 'other', '': 'other',
  };
  for (const [raw, f] of Object.entries(fam)) assert.equal(marketFamily(raw), f, raw);
  assert.equal(reviewClass('Córners equipo'), 'team_corners');
  assert.equal(reviewClass('Córners totales'), 'corners');
  assert.equal(reviewClass('Tarjetas totales'), 'cards');
  assert.equal(reviewClass('Tiros equipo'), 'shots');
  assert.equal(reviewClass('Ambos marcan'), 'goals');
  assert.equal(reviewClass('Doble oportunidad'), 'result');
});

test('side, books in reason, model tags, labels, passed-all', () => {
  assert.equal(sideOf('Under 4.5'), 'under');
  assert.equal(sideOf('Club Norte tiros Over 11.5'), 'over');
  assert.equal(sideOf('X2 (visitante o empate)'), '');
  assert.deepEqual(booksInReason('VALOR: Betsson/Stake 2.32 vs justa 2.21 (+5.0%)'), ['Betsson', 'Stake']);
  assert.deepEqual(booksInReason('F-gap'), []);
  assert.ok(isModelTag('filter_reject') && isModelTag('cards_under') && !isModelTag('value') && !isModelTag('ai_watch'));
  assert.equal(tagLabel('near_value'), 'VALOR CASI');
  assert.ok(passedAll('CÓRNERS EQUIPO: x', 'SHADOW: pasó todos los filtros'));
});

test('rejection reasons follow review.py, including tags kept in the notes', () => {
  assert.deepEqual(filterReasons('filter_reject', 'Muestra (8 partidos); ratio modelo/mercado 1.29x', ''), ['ratio', 'sample', 'rule18']);
  assert.deepEqual(filterReasons('filter_reject', 'Brecha >10 pts', ''), ['gap']);
  assert.deepEqual(filterReasons('cards_under', 'TARJETAS UNDER (modelo): rule 3 razor; F-gap: modelo 1% vs mercado 2%', ''), ['gap', 'razor']);
  assert.deepEqual(filterReasons('filter_reject', 'Regla 1 (media 11.04 sobre 10.5)', ''), ['rule1']);
  assert.deepEqual(filterReasons('filter_reject', 'Stake < 0.25u (EV +0.8%)', ''), ['low_stake']);
  assert.deepEqual(filterReasons('shadow', 'SHADOW: 8 partidos (regla 18)', 'Stake 2.05 | también F-gap; filtro 5'), ['gap', 'filter5', 'rule18']);
  assert.deepEqual(filterReasons('value', 'VALOR: Stake 2.1 vs justa 2 (+5%)', 'F-gap'), []);
  assert.deepEqual(filterReasons('model_only_shots', 'MODELO SOLO (tiros): F-gap', ''), []);
});
