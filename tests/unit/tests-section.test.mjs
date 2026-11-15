// Data additions for the Tests section (src/data/tests-config.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FROZEN_TESTS, FROZEN_RULE, frozenProgress, nextShadowReview, projectDate, frozenProjection, decisionShare, waitingFor,
  testsOverview, shadowReviewHistory, shadowReviewParts, propCloseEv, PRICE_FIRST_TESTS, priceFirstProgress, PROP_RULE,
  STOPPED_CATEGORIES, stoppedSummary, plusDays, daysBetween,
} from '../../src/data/tests-config.js';
import { toQueryString, defaultFilters } from '../../src/data/filters.js';
import { mkPick } from './helpers/picks.mjs';

const byId = Object.fromEntries(FROZEN_TESTS.map((t) => [t.id, t]));
const pf = Object.fromEntries(PRICE_FIRST_TESTS.map((t) => [t.id, t]));
const cr = byId.corner_rejects;
/** n corner-reject rows, one match each; `ev(i)` gives the fair-close EV of row i (null = no close). */
const crRows = (n, ev, extra = {}) =>
  Array.from({ length: n }, (_, i) => mkPick({ tag: 'corner_rejects', date: '2026-11-10', match: `CR${i}`, status: i % 2 ? 'won' : 'lost', fairCloseEv: ev(i), ...extra }));

test('dates', () => {
  assert.equal(plusDays('2026-11-28', 5), '2026-12-03');
  assert.equal(daysBetween('2026-11-01', '2026-11-15'), 14);
});

test('projectDate: reached, no pace, and a pace that rounds up', () => {
  assert.deepEqual(projectDate({ have: 100, need: 100, recent: 0, windowDays: 14, today: '2026-11-15' }), { reached: true, perDay: 0, daysLeft: 0, date: '2026-11-15' });
  const none = projectDate({ have: 10, need: 100, recent: 0, windowDays: 14, today: '2026-11-15' });
  assert.equal(none.date, null);
  assert.equal(none.daysLeft, null);
  assert.equal(projectDate({ have: 10, need: 100, recent: 5, windowDays: 0, today: '2026-11-15' }).date, null);
  // 14 in 14 days = 1 a day; 90 left -> 90 days
  assert.equal(projectDate({ have: 10, need: 100, recent: 14, windowDays: 14, today: '2026-11-15' }).date, '2027-02-13');
  // 3 a day, 10 left -> 3.33 -> 4 days
  assert.equal(projectDate({ have: 90, need: 100, recent: 42, windowDays: 14, today: '2026-11-15' }).daysLeft, 4);
});

test('frozenProjection: window shrinks for a young test, the slower count sets the date', () => {
  // corner rejects start 9 Nov: on 15 Nov the window is 7 days
  const rows = crRows(14, (i) => (i < 7 ? 0.01 : null)).map((p, i) => ({ ...p, date: plusDays('2026-11-09', i % 7) }));
  const p = frozenProgress(cr, rows);
  const pr = frozenProjection(p, '2026-11-15');
  assert.equal(pr.windowDays, 7);
  assert.equal(pr.graded.perDay, 2); // 14 graded in 7 days
  assert.equal(pr.graded.daysLeft, 43); // 86 left / 2
  assert.equal(pr.withClose.perDay, 1); // 7 closes in 7 days
  assert.equal(pr.withClose.daysLeft, 43); // 43 left / 1
  assert.equal(pr.date, plusDays('2026-11-15', 43));
  // rows outside the window do not count toward the pace
  const old = frozenProjection(frozenProgress(byId.team_corners, [mkPick({ reviewClass: 'team_corners', tag: 'team_corners', date: '2026-10-01', parsed: { passedAll: true } })]), '2026-11-15');
  assert.equal(old.windowDays, 14);
  assert.equal(old.date, null);
  // nothing at all: no window, no date
  assert.equal(frozenProjection(frozenProgress(cr, []), '2026-11-15').date, null);
});

test('state edge case: 0 rows', () => {
  const p = frozenProgress(cr, []);
  assert.equal(p.graded, 0);
  assert.equal(p.withClose, 0);
  assert.equal(p.ev.mean, null);
  assert.equal(p.state, 'collecting');
  assert.equal(decisionShare(p), 0);
  assert.equal(waitingFor(p), 'both');
});

test('state edge case: 99 of 100 graded never decides, whatever the EV', () => {
  const p = frozenProgress(cr, crRows(99, (i) => 0.08 + (i % 3) * 0.01));
  assert.equal(p.graded, 99);
  assert.equal(p.state, 'collecting');
  assert.equal(waitingFor(p), 'graded');
  assert.equal(decisionShare(p), 0.99);
});

test('state edge case: 100 graded with 49 closes waits for closes', () => {
  const p = frozenProgress(cr, crRows(100, (i) => (i < 49 ? 0.08 + (i % 3) * 0.01 : null)));
  assert.equal(p.graded, 100);
  assert.equal(p.withClose, 49);
  assert.equal(p.ready, false);
  assert.equal(p.state, 'collecting');
  assert.equal(waitingFor(p), 'closes');
  assert.equal(decisionShare(p), 0.98);
});

test('state edge case: a mean exactly 2 SE above zero passes, a hair below stops', () => {
  // 50 rows with a close, one match each, half at m+d and half at m−d: clustered SE = d / √(n−1) = d / 7.
  const at = (m, d) => frozenProgress(cr, crRows(100, (i) => (i < 50 ? (i % 2 ? m + d : m - d) : null)));
  const exact = at(0.02, 0.07);
  assert.ok(Math.abs(exact.ev.z - 2) < 1e-9, `z ${exact.ev.z}`);
  assert.equal(exact.state, 'pass');
  assert.equal(at(0.0199, 0.07).state, 'stop');
  assert.equal(at(0.02, 0.07).ready, true);
});

test('overview strip: collecting, reached, closest to its decision', () => {
  const a = frozenProgress(cr, crRows(60, (i) => (i < 20 ? 0.01 : null))); // min(0.6, 0.4) = 0.4
  const b = frozenProgress(byId.team_corners, Array.from({ length: 30 }, (_, i) => mkPick({ reviewClass: 'team_corners', tag: 'team_corners', date: '2026-11-05', match: `T${i}`, fairCloseEv: 0.01 })));
  const c = frozenProgress(cr, crRows(100, (i) => (i < 60 ? 0.05 + (i % 3) * 0.01 : null)));
  const o = testsOverview([a, b, c]);
  assert.equal(o.total, 3);
  assert.equal(o.collecting, 2);
  assert.equal(o.ready, 1);
  assert.equal(o.closest, a);
  assert.equal(o.closestShare, 0.4);
  assert.equal(testsOverview([]).closest, null);
});

test('review history: only "Revisión Sombra" topics, newest first', () => {
  const ds = [
    { row: 20, date: '2026-10-10', topic: 'Revisión Sombra 30 filas', decision: '', evidence: '', review: '', status: 'Vigente' },
    { row: 36, date: '2026-10-15', topic: 'Revisión Grok 30 filas', decision: '', evidence: '', review: '', status: 'Vigente' },
    { row: 104, date: '2026-11-08', topic: 'Revisión Sombra 650 filas', decision: '', evidence: '', review: '', status: 'Vigente' },
    { row: 100, date: '2026-11-08', topic: 'Revisión Sombra 600 filas', decision: '', evidence: '', review: '', status: 'Vigente' },
    { row: 112, date: '2026-11-09', topic: 'Revisiones Sombra: cuando hayan pasado 14 días', decision: '', evidence: '', review: '', status: 'Vigente' },
  ];
  const h = shadowReviewHistory(ds);
  assert.deepEqual(h.map((x) => x.row), [104, 100, 20]);
  assert.equal(h[0].rows, 650);
});

test('review parts: days since out of 14 and rows since out of 150', () => {
  const ds = [{ row: 104, date: '2026-11-08', topic: 'Revisión Sombra 650 filas', decision: '', evidence: '', review: '', status: 'Vigente' }];
  const r = nextShadowReview(ds, Array.from({ length: 710 }, () => mkPick()), '2026-11-15');
  assert.deepEqual(shadowReviewParts(r), { days: 7, daysShare: 0.5, rows: 60, rowsShare: 0.4, daysMet: false, rowsMet: false });
  const due = nextShadowReview(ds, Array.from({ length: 820 }, () => mkPick()), '2026-11-30');
  const parts = shadowReviewParts(due);
  assert.equal(due.due, true);
  assert.equal(parts.daysShare, 1);
  assert.equal(parts.rowsShare, 1);
  assert.equal(shadowReviewParts(nextShadowReview([], [], '2026-11-15')), null);
});

test('frozen tests carry a decision row and an Explorer filter', () => {
  for (const t of FROZEN_TESTS) {
    assert.ok(Number.isInteger(t.decisionRow), t.id);
    const qs = toQueryString({ ...defaultFilters(), ...t.explorer });
    assert.match(qs, /src=shadow/, t.id);
  }
  assert.equal(FROZEN_RULE.decisionRow, 111);
});

test('VALOR PROP measure: F × power-de-vigged feed close − 1, only with one other side', () => {
  const p = mkPick({ price: 2.1, parsed: { close: { price: 1.9, others: [1.9], triple: null, source: 'feed', book: 'bet365' } } });
  assert.ok(Math.abs(propCloseEv(p) - 0.05) < 1e-9); // fair 50%: 2.1 × 0.5 − 1
  assert.equal(propCloseEv(mkPick({ price: 2.1, parsed: { close: { price: 1.9, others: [], triple: null } } })), null);
  assert.equal(propCloseEv(mkPick({ price: 2.1, parsed: { close: { price: 1.9, others: [3, 4], triple: null } } })), null);
  assert.equal(propCloseEv(mkPick({ price: 2.1 })), null);
});

/** VALOR rows: `n` rows at `price`, opening fair EV `ev(i)`, a win every `winEvery` rows. */
const valRows = (n, price, ev, { date = '2026-11-01', winEvery = 2, tag = 'value', prefix = 'V' } = {}) =>
  Array.from({ length: n }, (_, i) =>
    mkPick({ tag, reviewClass: 'result', marketRaw: '1X2', price, date, match: `${prefix}${price}${i}`, status: i % winEvery === 0 ? 'won' : 'lost', openingFairEv: ev(i), parsed: { priceSource: 'Betano' } }));

test('VALOR (rows 79, 80): collecting, then cases a, a with 3.0, b, b waiting and c', () => {
  const t = pf.value;
  const pos = (i) => 0.02 + (i % 3) * 0.01;
  const neg = (i) => -0.03 - (i % 3) * 0.01;
  assert.equal(priceFirstProgress(t, valRows(29, 2.5, pos)).state, 'collecting');
  const a = priceFirstProgress(t, valRows(30, 2.5, pos));
  assert.equal(a.state, 'pass');
  assert.equal(a.decisionCase, 'a');
  assert.equal(a.le4.ev.n, 30);
  assert.equal(a.byBook.find((b) => b.book === 'Betano').graded, 30);
  // ≤4.0 passes but the 3.0–4.0 band has 10 rows with a negative mean -> propose ≤3.0 only
  const a3 = priceFirstProgress(t, [...valRows(40, 2.5, (i) => 0.06 + (i % 3) * 0.01), ...valRows(10, 3.5, neg, { winEvery: 3 })]);
  assert.equal(a3.state, 'pass');
  assert.equal(a3.decisionCase, 'a_le3');
  // ≤4.0 fails, ≤3.0 passes on old rows only -> wait for rows since 30 Oct
  const old = valRows(30, 2.5, pos, { date: '2026-10-20' });
  const band = valRows(30, 3.8, (i) => -0.2 - (i % 3) * 0.01, { winEvery: 4 });
  const bw = priceFirstProgress(t, [...old, ...band]);
  assert.equal(bw.decisionCase, 'b_waiting');
  assert.equal(bw.state, 'collecting');
  const b = priceFirstProgress(t, [...old, ...band, ...valRows(30, 2.5, pos, { date: '2026-11-02', prefix: 'N' })]);
  assert.equal(b.decisionCase, 'b');
  assert.equal(b.state, 'pass');
  const c = priceFirstProgress(t, valRows(30, 2.5, neg));
  assert.equal(c.state, 'stop');
  assert.equal(c.decisionCase, 'c');
  // rows priced above 4.0 never count toward the gate line
  assert.equal(priceFirstProgress(t, valRows(30, 5, pos)).le4.ev.n, 0);
  // VALOR CASI is context only
  assert.equal(priceFirstProgress(pf.near_value, valRows(40, 2.5, pos, { tag: 'near_value' })).state, 'context');
});

test('VALOR: Pinnacle progress counts graded VALOR and VALOR CASI rows with a pin id', () => {
  const rows = [
    ...valRows(3, 2.2, () => 0.01).map((p) => ({ ...p, parsed: { ...p.parsed, pin: { home: 2, draw: 3, away: 4, readUtc: 'x', id: 'ab12' } } })),
    mkPick({ tag: 'near_value', status: 'won', parsed: { pin: { home: 2, draw: 3, away: 4, readUtc: 'x', id: 'cd34' } } }),
    mkPick({ tag: 'value', status: 'pending', parsed: { pin: { home: 2, draw: 3, away: 4, readUtc: 'x', id: 'ef56' } } }),
    mkPick({ tag: 'value', status: 'won', parsed: { pinMissing: 'sin partido' } }),
  ];
  assert.equal(priceFirstProgress(pf.value, rows).pinGraded, 4);
});

/** VALOR PROP rows with a two-sided feed close at 1.9/1.9 (fair 50%). */
const propRows = (n, price, { winEvery = 2, tag = 'prop_value' } = {}) =>
  Array.from({ length: n }, (_, i) =>
    mkPick({ tag, price: typeof price === 'function' ? price(i) : price, match: `P${i}`, date: plusDays('2026-11-07', i % 8), status: i % winEvery === 0 ? 'won' : 'lost',
      parsed: { close: { price: 1.9, others: [1.9], triple: null, source: 'feed', book: 'bet365' }, priceSource: 'Betsson' } }));

test('VALOR PROP (row 97): 60 rows, clear / stop / continue to 120', () => {
  const t = pf.prop_value;
  assert.equal(priceFirstProgress(t, propRows(59, (i) => 2.1 + (i % 3) * 0.01)).state, 'collecting');
  const clear = priceFirstProgress(t, propRows(60, (i) => 2.1 + (i % 3) * 0.01));
  assert.equal(clear.state, 'pass');
  assert.ok(clear.all.lo95 > 0);
  const stop = priceFirstProgress(t, propRows(60, (i) => 1.9 + (i % 3) * 0.01));
  assert.equal(stop.state, 'stop');
  // positive mean but an interval that crosses zero: keep going to 120
  const wide = (i) => (i % 2 ? 2.4 : 1.65);
  const ext = priceFirstProgress(t, propRows(60, wide));
  assert.ok(ext.all.ev.mean > 0 && ext.all.lo95 <= 0);
  assert.equal(ext.state, 'extended');
  assert.equal(ext.target, PROP_RULE.finalLook);
  assert.equal(priceFirstProgress(t, propRows(120, wide)).state, 'stop');
  assert.equal(priceFirstProgress(pf.prop_near_value, propRows(60, 2.1, { tag: 'prop_near_value' })).state, 'context');
  assert.equal(clear.slates, 8);
  assert.equal(clear.perSlate, 7.5);
});

test('stopped categories: membership and final numbers', () => {
  const ids = Object.fromEntries(STOPPED_CATEGORIES.map((c) => [c.id, c]));
  const aiC = mkPick({ tag: 'ai_watch', reviewClass: 'corners', date: '2026-10-20', status: 'won' });
  const aiK = mkPick({ tag: 'ai_watch', reviewClass: 'cards', marketRaw: 'Tarjetas totales', date: '2026-10-30', status: 'lost' });
  const tcRej = mkPick({ tag: 'team_corners', reviewClass: 'team_corners', date: '2026-10-25' });
  const tcPass = mkPick({ tag: 'team_corners', reviewClass: 'team_corners', date: '2026-10-25', parsed: { passedAll: true } });
  const fill = mkPick({ tag: 'filter_reject', reviewClass: 'cards', date: '2026-11-05' });
  const lateFill = mkPick({ tag: 'filter_reject', reviewClass: 'cards', date: '2026-11-12' });
  const low = mkPick({ tag: 'model_only_shots', reviewClass: 'shots', marketRaw: 'Tiros equipo', price: 1.4 });
  const teamShot = mkPick({ tag: 'shadow', reviewClass: 'shots', marketRaw: 'Tiros al arco equipo' });
  const all = [aiC, aiK, tcRej, tcPass, fill, lateFill, low, teamShot];
  const s = (id) => stoppedSummary(ids[id], all);
  assert.deepEqual(s('ai_watch_corners').rows, [aiC]);
  assert.deepEqual(s('ai_watch_cards').rows, [aiK]);
  assert.deepEqual(s('team_corner_rejects').rows, [tcRej]);
  assert.deepEqual(s('corner_card_fillers').rows, [fill]);
  assert.deepEqual(s('model_only_shots_low').rows, [low]);
  assert.deepEqual(s('team_shots').rows, [teamShot]);
  const both = stoppedSummary({ ...ids.ai_watch_corners, match: (p) => p.tag === 'ai_watch' }, all);
  assert.equal(both.first, '2026-10-20');
  assert.equal(both.last, '2026-10-30');
  assert.equal(both.summary.won, 1);
  assert.equal(both.summary.lost, 1);
  for (const c of STOPPED_CATEGORIES) assert.ok(Number.isInteger(c.decisionRow) && /^\d{4}-\d{2}-\d{2}$/.test(c.stoppedOn), c.id);
});
