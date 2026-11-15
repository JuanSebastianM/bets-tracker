// tags.js: every reason format seen in the sheet (synthetic numbers, real shapes) lands in the
// intended tag, in review.py's order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyShadow, classifyGrok, marketFamily, reviewClass, sideOf, filterReasons, booksInReason, isModelTag, tagLabel, passedAll } from '../../src/data/tags.js';

const CASES = [
  ['PUBLICADA Y APOSTADA (Apuestas ID 4)', 'published_bet'],
  ['PUBLICADA, NO APOSTADA (top #1, 1.25u)', 'published'],
  ['VALOR PROP CASI: Betano 2.07 vs justa 2.03 (+1.7%)', 'prop_near_value'],
  ['VALOR PROP: Betano 2.22 vs justa 2.01 (+10.3%)', 'prop_value'],
  ['VALOR CASI: Stake 1.85 vs justa 1.818 (+1.8%)', 'near_value'],
  ['VALOR CASI: Betano 1.90 vs justa 1.86 (+2.1%, bajo el 3%); relleno (c) nuevo', 'near_value'],
  ['VALOR: Betano/Betsson 2.15 vs justa 2.07 (+3.9%)', 'value'],
  ['TARJETAS UNDER (modelo): rule 3 razor; F-gap: modelo 60.1% vs mercado 49.5% (media 4.17, línea 4.5)', 'cards_under'],
  ['CÓRNERS EQUIPO: modelo 50.6% vs mercado 35.6% (media 5.92)', 'team_corners'],
  ['CÓRNERS EQUIPO (SHADOW, pasó todos los filtros): modelo 53.3% vs mercado 43.8% (media 6.12)', 'team_corners'],
  ['CÓRNERS RECHAZO ≤2.0: F-gap: modelo 65.4% vs mercado 55.0% (media 9.36, línea 10.5)', 'corner_rejects'],
  ['MODELO SOLO (tiros): modelo 76.3% vs mercado 61.0% (media 16.67, línea 20.5)', 'model_only_shots'],
  ['SHADOW (pasó todos los filtros, regla 30): modelo 54.0% vs mercado 53.7% (media 5.06)', 'shadow_rule30'],
  ['SHADOW: córners/tarjetas en pausa (regla 30); pasó todos los filtros, EV blend +2.0%', 'shadow_rule30'],
  ['SHADOW: córners pausados (regla 30)', 'shadow_rule30'],
  ['SHADOW: córners, 6 PJ (regla 18)', 'shadow'],
  ['SHADOW: tiros/SoT (regla 25), 8 partidos', 'shadow'],
  ['SHADOW: relaxed sample: 9 games (count stats need 6); new market (shots/SoT): shadow until reviewed', 'shadow'],
  ['IA-WATCH: IA media 9 vs línea 10.5 (IA 68.7% vs línea 51.6%)', 'ai_watch'],
  ['Pasó todos los filtros; edge <4% (EV +2.9%), stake máx 0.25u. No se mostró en el slate.', 'low_edge'],
  ['Stake < 0.25u (EV blend +0.7%); SHADOW: mercado nuevo', 'low_edge'],
  ['F-gap; F-ratio', 'filter_reject'],
  ['F-gap + F-ratio (modelo 67.2% vs mercado 38.1%); muestra 8 partidos; SHADOW: mercado nuevo', 'filter_reject'],
  ['Muestra (7); brecha >10 pts; ratio 1.54x', 'filter_reject'],
  ['Filtro 4 (últimos 5): EV blend cae a +0.2%', 'filter_reject'],
  ['Regla 1: media modelo 10.87 bajo la línea 11.5', 'filter_reject'],
  ['SKIP (relleno): razor, F-gap: modelo 58.4% vs mercado 46.3%', 'filter_reject'],
  ['Salto: solo filtro 5 (árbitro 5.41/p, EV blend -0.9%)', 'filter_reject'],
  ['rule 3 razor: line 9.5 within 0.5 of model mean 9.16', 'filter_reject'],
  ['', 'filter_reject'],
];

test('Sombra reasons map to the intended tag', () => {
  for (const [reason, tag] of CASES) assert.equal(classifyShadow(reason), tag, reason);
});

test('Grok verdicts', () => {
  assert.equal(classifyGrok('Cotizado: modelo 53.0% vs mercado 38.3% → SKIP: F-gap'), 'grok_priced');
  assert.equal(classifyGrok('Cotizado (regla 29): consenso justo 8.8%'), 'grok_priced');
  assert.equal(classifyGrok('No cotizado: mercado no modelado'), 'grok_not_priced');
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
  assert.equal(sideOf('Goiás tiros Over 9.5'), 'over');
  assert.equal(sideOf('X2 (Inter o empate)'), '');
  assert.deepEqual(booksInReason('VALOR: Betano/Stake 2.15 vs justa 2.06 (+4.4%)'), ['Betano', 'Stake']);
  assert.deepEqual(booksInReason('F-gap'), []);
  assert.ok(isModelTag('filter_reject') && isModelTag('cards_under') && !isModelTag('value') && !isModelTag('ai_watch'));
  assert.equal(tagLabel('near_value'), 'VALOR CASI');
  assert.ok(passedAll('CÓRNERS EQUIPO: x', 'SHADOW: pasó todos los filtros'));
});

test('rejection reasons follow review.py, including tags kept in the notes', () => {
  assert.deepEqual(filterReasons('filter_reject', 'Muestra (7 partidos); ratio modelo/mercado 1.36x', ''), ['ratio', 'sample', 'rule18']);
  assert.deepEqual(filterReasons('filter_reject', 'Brecha >10 pts', ''), ['gap']);
  assert.deepEqual(filterReasons('cards_under', 'TARJETAS UNDER (modelo): rule 3 razor; F-gap: modelo 1% vs mercado 2%', ''), ['gap', 'razor']);
  assert.deepEqual(filterReasons('filter_reject', 'Regla 1 (media 10.22 sobre 9.5)', ''), ['rule1']);
  assert.deepEqual(filterReasons('filter_reject', 'Stake < 0.25u (EV +0.5%)', ''), ['low_stake']);
  assert.deepEqual(filterReasons('shadow', 'SHADOW: 7 partidos (regla 18)', 'Betano 1.9 | también F-gap; filtro 5'), ['gap', 'filter5', 'rule18']);
  assert.deepEqual(filterReasons('value', 'VALOR: Betano 2 vs justa 1.9 (+5%)', 'F-gap'), []);
  assert.deepEqual(filterReasons('model_only_shots', 'MODELO SOLO (tiros): F-gap', ''), []);
});
