import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../../src/lib/i18n.js';
import { summarize } from '../../src/data/stats.js';
import {
  describeSampleSize, describeResultsVsClose, describeSource, verdictLabel, describeBestWorst, describeLastSlate, describePending,
  describeSinceVisit, describeRealBets,
} from '../../src/data/summaries.js';
import { realBetsExtras, sinceLastVisit, slateReport, upcomingPending } from '../../src/data/overview.js';
import { loadAllStrings } from './helpers/strings.mjs';
import { mkPick } from './helpers/picks.mjs';

loadAllStrings('es');

const both = (fn) => {
  setLocale('es');
  const es = fn();
  setLocale('en');
  const en = fn();
  setLocale('es');
  return { es, en };
};

/** n picks, `won` of them won at `price`, each with a fair-close EV. */
function sample(n, won, price, ev) {
  return Array.from({ length: n }, (_, i) => mkPick({ status: i < won ? 'won' : 'lost', price, fairCloseEv: ev + (i % 2 ? 0.003 : -0.003), match: `m${i}` }));
}

test('sample size sentences', () => {
  assert.equal(describeSampleSize(0), '');
  const s = both(() => [describeSampleSize(12), describeSampleSize(50), describeSampleSize(150)]);
  assert.match(s.es[0], /^Con 12 calificadas todavía es muy pronto/);
  assert.match(s.es[1], /ya orienta/);
  assert.match(s.es[2], /no para dar nada por seguro/);
  assert.match(s.en[0], /^With 12 graded it is still very early/);
  assert.match(s.en[2], /not to take anything for granted/);
});

test('results against the close: luck, bad run, both good, nothing when too early', () => {
  const lucky = summarize(sample(30, 20, 2, -0.04));
  const s = both(() => describeResultsVsClose(lucky, 'below'));
  assert.equal(s.es, 'Gana en resultados pero pierde contra el cierre: probablemente suerte.');
  assert.equal(s.en, 'Winning on results but losing against the close: probably luck.');
  const unlucky = summarize(sample(30, 10, 2, 0.04));
  assert.equal(describeResultsVsClose(unlucky, 'lean_above'), 'Pierde en resultados pero le gana al cierre: probablemente mala racha.');
  assert.equal(describeResultsVsClose(lucky, 'above'), 'Gana en resultados y también le gana al cierre.');
  assert.equal(describeResultsVsClose(lucky, 'too_early'), '');
  assert.equal(describeResultsVsClose(unlucky, 'below'), '');
  assert.equal(describeResultsVsClose(summarize([]), 'none'), '');
});

test('source paragraph is built from the summary and never promises profit', () => {
  const s = summarize(sample(30, 20, 2, -0.04));
  const p = both(() => describeSource('Sombra', s, 'below'));
  assert.match(p.es, /^Sombra: 20-10 a cuota media 2\.00, \+10\.00u \(\+33\.3%\) en 30 calificadas\./);
  assert.match(p.es, /Acierta 66\.7%, por encima del 50\.0%/);
  assert.match(p.es, /Contra el cierre sin margen: −4\.0% de media \(n 30\)/);
  assert.match(p.es, /probablemente suerte\.$/);
  assert.match(p.en, /^Sombra: 20-10 at an average price of 2\.00/);
  assert.match(p.en, /probably luck\.$/);
  for (const text of [p.es, p.en]) assert.doesNotMatch(text, /garantiz|guarantee|seguro que|sure to/i);
  assert.equal(describeSource('Grok', summarize([]), 'none'), 'Grok: todavía sin picks calificados.');
});

test('verdict words in both languages', () => {
  const v = both(() => ['none', 'too_early', 'above', 'below', 'lean_above', 'lean_below'].map(verdictLabel));
  assert.deepEqual(v.es, ['sin cierres', 'muy pronto', 'por encima del cierre', 'por debajo del cierre', 'tirando a favor', 'tirando en contra']);
  assert.deepEqual(v.en, ['no closes', 'too early', 'beats the close', 'below the close', 'leaning above', 'leaning below']);
});

test('best and worst tag with n', () => {
  const row = (key, mean, n) => ({ key, summary: { fairCloseEv: { mean, n } } });
  const label = (k) => ({ near_value: 'VALOR CASI', corner_rejects: 'CÓRNERS RECHAZO' })[k];
  const s = both(() => describeBestWorst({ best: row('near_value', 0.021, 45), worst: row('corner_rejects', -0.034, 31), qualified: 2 }, label, 20));
  assert.equal(s.es, 'Mejor contra el cierre: VALOR CASI (+2.1%, n 45). Peor: CÓRNERS RECHAZO (−3.4%, n 31).');
  assert.equal(s.en, 'Best against the close: VALOR CASI (+2.1%, n 45). Worst: CÓRNERS RECHAZO (−3.4%, n 31).');
  assert.match(describeBestWorst({ best: row('near_value', 0.021, 45), worst: null, qualified: 1 }, label, 20), /única con 20 cierres/);
  assert.equal(describeBestWorst({ best: null, worst: null, qualified: 0 }, label, 20), 'Ninguna etiqueta tiene todavía 20 cierres con los dos lados: muy pronto para compararlas.');
});

test('last slate and pending', () => {
  const ps = [
    mkPick({ date: '2026-11-14', status: 'won', price: 2 }),
    mkPick({ date: '2026-11-14', status: 'lost', price: 2 }),
    mkPick({ date: '2026-11-14', source: 'grok', status: 'won', price: 3 }),
    mkPick({ date: '2026-11-14', source: 'grok', status: 'pending' }),
    mkPick({ date: '2026-11-15', status: 'pending' }),
    mkPick({ date: '2026-11-15', status: 'pending' }),
    mkPick({ date: '2026-11-15', source: 'grok', status: 'pending' }),
    mkPick({ date: '2026-11-16', status: 'pending' }),
  ];
  const r = slateReport(ps, '2026-11-14');
  const s = both(() => describeLastSlate(r));
  assert.equal(s.es, 'Última jornada calificada (14 nov): Sombra 1-1, 0.00u; Grok 1-0, +2.00u. Queda 1 pendiente de ese día.');
  assert.equal(s.en, 'Last graded slate (Nov 14): Shadow 1-1, 0.00u; Grok 1-0, +2.00u. 1 pick from that day is still pending.');
  assert.equal(describeLastSlate({ date: null, sources: [] }), 'Todavía no hay una jornada calificada.');
  const g = upcomingPending(ps, '2026-11-15');
  const p = both(() => describePending(g, '2026-11-15'));
  assert.equal(p.es, '3 picks pendientes para hoy (Sombra 2, Grok 1). Y 1 más en las jornadas siguientes.');
  assert.equal(p.en, '3 picks pending for today (Shadow 2, Grok 1). And 1 more on later slates.');
  assert.equal(describePending(g.slice(1), '2026-11-15'), '1 pick pendiente para 16 nov (Sombra 1).');
  assert.equal(describePending([], '2026-11-15'), 'No hay picks pendientes desde hoy.');
});

test('since the last visit and real bets', () => {
  const at = '2026-11-13T15:00:00.000Z';
  const ps = [mkPick({ date: '2026-11-14', status: 'won', price: 2.5 }), mkPick({ date: '2026-11-14', source: 'grok', status: 'lost', price: 2 })];
  const r = sinceLastVisit(ps, at, null, { timeZone: 'America/Bogota' });
  const s = both(() => describeSinceVisit(r));
  assert.match(s.es, /^Desde tu última visita se calificaron 2 picks: Sombra 1-0, \+1\.50u; Grok 0-1, −1\.00u\. Cuenta los picks/);
  assert.match(s.en, /^Since your last visit 2 picks were graded: Shadow 1-0, \+1\.50u; Grok 0-1, −1\.00u\. It counts/);
  assert.equal(describeSinceVisit(sinceLastVisit([], at, { at, pending: [], maxRow: {} }, { timeZone: 'America/Bogota' })), 'Desde tu última visita no se calificó ningún pick.');
  assert.equal(describeSinceVisit(null), '');

  const b = (date, profitU) => mkPick({ source: 'bets', tag: 'bet', date, status: profitU > 0 ? 'won' : 'lost', price: 2, stakeU: 1, profitU });
  const x = realBetsExtras([b('2026-11-01', 2), b('2026-11-02', -1)]);
  const rb = both(() => describeRealBets(x));
  assert.equal(rb.es, 'Las apuestas reales van +1.00u, 1.00u por debajo de su mejor punto (+2.00u).');
  assert.equal(rb.en, 'Real bets stand at +1.00u, 1.00u below their best point (+2.00u).');
  assert.equal(describeRealBets(realBetsExtras([b('2026-11-01', 2)])), 'Las apuestas reales van +2.00u y están en su punto más alto.');
  assert.equal(describeRealBets(realBetsExtras([])), 'Todavía no hay apuestas reales calificadas en este periodo.');
});
