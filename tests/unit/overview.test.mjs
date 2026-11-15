import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodFromQuery, periodQuery, periodFilter, picksInPeriod, lastGradedSlate, closeVerdict, VERDICT_MIN_N, rankRows, shadowTagRows,
  shadowMarketRows, bestWorst, rangeAxis, axisPct, sourceSummary, cumulativeUnits, dailyUnits, realBetsExtras, slateReport,
  upcomingPending, overduePending, visitSnapshot, sinceLastVisit, dateIn,
} from '../../src/data/overview.js';
import { mkPick } from './helpers/picks.mjs';

const ev = (n, mean, lo, hi) => ({ n, mean, median: mean, se: null, lo, hi, z: null, shareAbove: null });

test('period comes from the date query key and defaults to all', () => {
  assert.equal(periodFromQuery({}), 'all');
  assert.equal(periodFromQuery({ date: '7d' }), '7d');
  assert.equal(periodFromQuery({ date: 'this_month' }), 'all', 'only the switch values');
  assert.deepEqual(periodQuery('all'), {});
  assert.deepEqual(periodQuery('30d'), { date: '30d' });
});

test('last slate is the latest date with a graded pick, pinned as an explicit slate', () => {
  const ps = [mkPick({ date: '2026-11-13' }), mkPick({ date: '2026-11-14', status: 'lost' }), mkPick({ date: '2026-11-15', status: 'pending' })];
  assert.equal(lastGradedSlate(ps), '2026-11-14');
  assert.deepEqual(periodFilter('last_slate', ps), { slate: '2026-11-14' });
  assert.deepEqual(periodFilter('7d', ps), { datePreset: '7d' });
  assert.deepEqual(periodFilter('all', ps), {});
  assert.deepEqual(picksInPeriod(ps, 'last_slate', { today: '2026-11-15' }).map((p) => p.date), ['2026-11-14']);
  assert.equal(picksInPeriod(ps, 'all', { today: '2026-11-15' }).length, 3);
  const old = mkPick({ date: '2026-11-01' });
  assert.deepEqual(picksInPeriod([...ps, old], '7d', { today: '2026-11-15' }).length, 3);
  assert.equal(lastGradedSlate([mkPick({ status: 'pending' })]), null);
  assert.deepEqual(periodFilter('last_slate', []), { datePreset: 'last_slate' });
});

test('close verdict follows the documented rule', () => {
  assert.equal(closeVerdict(ev(0, null, null, null)), 'none');
  assert.equal(closeVerdict(ev(VERDICT_MIN_N - 1, 0.05, 0.01, 0.09)), 'too_early');
  assert.equal(closeVerdict(ev(VERDICT_MIN_N, 0.05, 0.01, 0.09)), 'above');
  assert.equal(closeVerdict(ev(40, -0.05, -0.09, -0.01)), 'below');
  assert.equal(closeVerdict(ev(40, 0.01, -0.02, 0.04)), 'lean_above');
  assert.equal(closeVerdict(ev(40, -0.01, -0.04, 0.02)), 'lean_below');
  assert.equal(closeVerdict(ev(40, 0, -0.03, 0.03)), 'lean_below');
});

test('rows rank verdicts by mean, then too early by n, then no closes', () => {
  const row = (key, verdict, mean, nClose, n = 10) => ({ key, verdict, count: n, summary: /** @type {any} */ ({ n, fairCloseEv: ev(nClose, mean, null, null) }) });
  const out = rankRows([row('a', 'none', null, 0, 30), row('b', 'too_early', -0.01, 5), row('c', 'below', -0.04, 30), row('d', 'above', 0.03, 30), row('e', 'too_early', 0.1, 12)]);
  assert.deepEqual(out.map((r) => r.key), ['d', 'c', 'e', 'b', 'a']);
});

function closes(n, tag, mean, extra = {}) {
  return Array.from({ length: n }, (_, i) => mkPick({ tag, fairCloseEv: mean + (i % 2 ? 0.002 : -0.002), match: `${tag}${i}`, ...extra }));
}

test('shadow tag rows: graded tags only, published bets left out, verdict per tag', () => {
  const ps = [
    ...closes(25, 'value', 0.04),
    ...closes(25, 'cards_under', -0.03, { market: 'cards_total' }),
    ...closes(3, 'near_value', 0.01),
    mkPick({ tag: 'team_corners', status: 'pending' }),
    mkPick({ tag: 'published_bet' }),
    mkPick({ tag: 'value', source: 'grok' }),
  ];
  const rows = shadowTagRows(ps);
  assert.deepEqual(rows.map((r) => r.key), ['value', 'cards_under', 'near_value']);
  assert.deepEqual(rows.map((r) => r.verdict), ['above', 'below', 'too_early']);
  assert.equal(rows[0].summary.n, 25, 'Grok rows are not in Sombra');
  const bw = bestWorst(rows);
  assert.equal(bw.best.key, 'value');
  assert.equal(bw.worst.key, 'cards_under');
  assert.equal(bw.qualified, 2);
  assert.equal(bestWorst(rows.slice(0, 1)).worst, null);
  assert.equal(bestWorst([]).best, null);
  const m = shadowMarketRows(ps);
  assert.deepEqual(m.map((r) => r.key).sort(), ['cards_total', 'corners_total']);
});

test('range axis includes zero and clips intervals; positions are clipped percentages', () => {
  const r = (mean, lo, hi) => ({ summary: { fairCloseEv: ev(30, mean, lo, hi) } });
  const a = rangeAxis(/** @type {any} */ ([r(0.05, 0.01, 0.09), r(-0.5, -0.9, -0.1)]));
  assert.equal(a.max, 0.09);
  assert.equal(a.min, -0.3);
  assert.equal(axisPct(-1, a), 0);
  assert.equal(axisPct(1, a), 100);
  assert.ok(axisPct(0, a) > 0 && axisPct(0, a) < 100);
  assert.deepEqual(rangeAxis([]), { min: -0.02, max: 0.02 });
});

test('source summary: Apuestas uses the sheet profit, the others 1u flat; curves follow dates', () => {
  const bets = [
    mkPick({ source: 'bets', date: '2026-11-02', status: 'won', price: 2, stakeU: 2, profitU: 1.5 }),
    mkPick({ source: 'bets', date: '2026-11-01', status: 'lost', price: 2, stakeU: 1, profitU: -1 }),
    mkPick({ source: 'bets', date: '2026-11-02', status: 'lost', price: 3, stakeU: 0.5, profitU: -0.5 }),
  ];
  assert.equal(sourceSummary(bets, 'bets').profit, 0);
  assert.equal(sourceSummary([mkPick({ status: 'won', price: 2.5 })], 'shadow').profit, 1.5);
  assert.deepEqual(cumulativeUnits(bets).map((p) => p.cum), [-1, 0.5, 0]);
  assert.deepEqual(dailyUnits(bets), [
    { date: '2026-11-01', n: 1, profit: -1, cum: -1 },
    { date: '2026-11-02', n: 2, profit: 1, cum: 0 },
  ]);
});

test('real bets extras: drawdown now and at worst, average stake, best and worst day', () => {
  const b = (date, profitU, stakeU = 1, status = profitU > 0 ? 'won' : 'lost') => mkPick({ source: 'bets', tag: 'bet', date, status, price: 2, stakeU, profitU });
  const bets = [b('2026-11-01', 2), b('2026-11-02', -1), b('2026-11-02', -2, 2), b('2026-11-03', 0.5), mkPick({ source: 'bets', status: 'pending', stakeU: 3 })];
  const x = realBetsExtras(bets, 100);
  assert.equal(x.peak, 2);
  assert.equal(x.total, -0.5);
  assert.equal(x.currentDrawdownU, 2.5);
  assert.equal(x.maxDrawdownU, 3);
  assert.ok(Math.abs(x.currentDrawdownPct - 2.5 / 102) < 1e-12);
  assert.ok(Math.abs(x.avgStake - 8 / 5) < 1e-12, 'graded and pending stakes');
  assert.equal(x.stakeN, 5);
  assert.equal(x.best.date, '2026-11-01');
  assert.equal(x.worst.date, '2026-11-02');
  assert.equal(x.worst.profit, -3);
  const none = realBetsExtras([], null);
  assert.equal(none.currentDrawdownU, 0);
  assert.equal(none.currentDrawdownPct, null);
  assert.equal(none.best, null);
  assert.equal(none.avgStake, null);
});

test('slate report, upcoming and overdue pending', () => {
  const ps = [
    mkPick({ date: '2026-11-14', status: 'won', price: 2 }),
    mkPick({ date: '2026-11-14', source: 'grok', status: 'pending' }),
    mkPick({ date: '2026-11-15', status: 'pending' }),
    mkPick({ date: '2026-11-15', source: 'grok', status: 'pending', time: '15:00' }),
    mkPick({ date: '2026-11-16', status: 'pending' }),
    mkPick({ date: '2026-11-15', status: 'pending', tag: 'published_bet' }),
  ];
  const r = slateReport(ps, '2026-11-14');
  assert.deepEqual(r.sources.map((x) => x.source), ['shadow', 'grok']);
  assert.equal(r.sources[0].summary.profit, 1);
  assert.equal(slateReport(ps, null).sources.length, 0);
  const g = upcomingPending(ps, '2026-11-15');
  assert.deepEqual(g.map((x) => x.date), ['2026-11-15', '2026-11-16']);
  assert.deepEqual(g[0].bySource, { bets: 0, shadow: 1, grok: 1 });
  assert.equal(g[0].picks[0].source, 'grok', 'Grok (with a time) first');
  assert.equal(overduePending(ps, '2026-11-15'), 1);
});

test('since the last visit: exact with a snapshot, by date without one, nothing on a first visit', () => {
  const a = mkPick({ uid: 'shadow:10', row: 10, date: '2026-11-13', status: 'pending' });
  const b = mkPick({ uid: 'shadow:11', row: 11, date: '2026-11-12', status: 'won', price: 2 });
  const at = '2026-11-13T15:00:00.000Z';
  const snap = visitSnapshot([a, b], at);
  assert.deepEqual(snap, { at, pending: ['shadow:10'], maxRow: { shadow: 11 } });
  const now = [
    { ...a, status: 'won', price: 2 },
    b,
    mkPick({ uid: 'shadow:12', row: 12, date: '2026-11-14', status: 'lost', price: 2 }),
    mkPick({ uid: 'shadow:13', row: 13, date: '2026-11-15', status: 'pending' }),
  ];
  const r = sinceLastVisit(now, at, snap, { timeZone: 'America/Bogota' });
  assert.equal(r.exact, true);
  assert.deepEqual(r.graded.map((p) => p.uid), ['shadow:10', 'shadow:12']);
  assert.equal(r.added, 2);
  assert.equal(r.sources[0].summary.profit, 0);
  const approx = sinceLastVisit(now, at, null, { timeZone: 'America/Bogota' });
  assert.equal(approx.exact, false);
  assert.deepEqual(approx.graded.map((p) => p.uid), ['shadow:10', 'shadow:12']);
  assert.equal(sinceLastVisit(now, at, { ...snap, at: 'other' }, { timeZone: 'America/Bogota' }).exact, false, 'a stale snapshot is not trusted');
  assert.equal(sinceLastVisit(now, null, snap, { timeZone: 'America/Bogota' }), null);
  assert.equal(dateIn('2026-11-16T03:00:00Z', 'America/Bogota'), '2026-11-15');
  assert.equal(dateIn('nope', 'America/Bogota'), null);
});
