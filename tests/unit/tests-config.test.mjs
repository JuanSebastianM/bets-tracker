import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FROZEN_TESTS, FROZEN_RULE, frozenProgress, nextShadowReview } from '../../src/data/tests-config.js';
import { mkPick } from './helpers/picks.mjs';

const byId = Object.fromEntries(FROZEN_TESTS.map((t) => [t.id, t]));

test('the rule of Decisiones row 111', () => {
  assert.deepEqual([FROZEN_RULE.minGraded, FROZEN_RULE.minWithClose, FROZEN_RULE.zThreshold, FROZEN_RULE.passStakeU], [100, 50, 2, 0.25]);
  assert.equal(FROZEN_TESTS.length, 8);
});

test('membership follows review.py', () => {
  const r30 = mkPick({ reviewClass: 'cards', tag: 'shadow_rule30', date: '2026-10-13', parsed: { passedAll: true } });
  assert.ok(byId.rule30_pass_all.match(r30));
  assert.ok(!byId.rule30_pass_all.match({ ...r30, date: '2026-10-12' }));
  assert.ok(!byId.rule30_pass_all.match({ ...r30, tag: 'value' }), 'price-first rows are not model rows');
  const cu = mkPick({ reviewClass: 'cards', tag: 'cards_under', side: 'under', selection: 'Under 4.5', date: '2026-11-02', price: 1.9 });
  assert.ok(byId.cards_under.match(cu) && byId.under45_control.match(cu));
  assert.ok(!byId.cards_under.match({ ...cu, price: 4.2 }));
  assert.ok(!byId.under45_control.match({ ...cu, selection: 'Under 5.5' }));
  assert.ok(byId.corner_rejects.match(mkPick({ tag: 'corner_rejects', date: '2026-11-09' })));
  assert.ok(!byId.corner_rejects.match(mkPick({ tag: 'corner_rejects', date: '2026-11-08' })));
  const tc = mkPick({ reviewClass: 'team_corners', tag: 'team_corners', date: '2026-10-20' });
  assert.ok(!byId.team_corners.match(tc));
  assert.ok(byId.team_corners.match({ ...tc, date: '2026-11-03' }));
  assert.ok(byId.team_corners.match({ ...tc, parsed: { ...tc.parsed, passedAll: true } }));
  assert.ok(byId.model_only_shots.match(mkPick({ tag: 'model_only_shots', price: 1.8 })));
  assert.ok(!byId.model_only_shots.match(mkPick({ tag: 'model_only_shots', price: 1.4 })));
  assert.ok(byId.match_total_shots.match(mkPick({ reviewClass: 'shots', marketRaw: 'Tiros (total)', tag: 'shadow' })));
  assert.ok(!byId.match_total_shots.match(mkPick({ reviewClass: 'shots', marketRaw: 'Tiros equipo', tag: 'shadow' })));
  assert.ok(byId.relaxed_sample_corners.match(mkPick({ reviewClass: 'corners', tag: 'shadow', parsed: { filters: ['rule18'] } })));
});

test('progress: graded out of 100, closes out of 50, decision by z of the fair-close EV', () => {
  const t = byId.corner_rejects;
  const rows = [];
  for (let i = 0; i < 100; i++) {
    rows.push(mkPick({ tag: 'corner_rejects', date: '2026-11-10', match: `M${i}`, status: i % 2 ? 'won' : 'lost', fairCloseEv: i < 60 ? 0.05 + (i % 3) * 0.01 : null, closeSource: i < 30 ? 'same_book' : 'feed' }));
  }
  rows.push(mkPick({ tag: 'corner_rejects', date: '2026-11-10', status: 'pending' }));
  const p = frozenProgress(t, rows);
  assert.equal(p.graded, 100);
  assert.equal(p.pending, 1);
  assert.equal(p.withClose, 60);
  assert.equal(p.withCloseSameBook, 30);
  assert.ok(p.ready);
  assert.equal(p.state, 'pass');
  const few = frozenProgress(t, rows.slice(0, 40));
  assert.equal(few.state, 'collecting');
  const neg = frozenProgress(t, rows.map((r) => ({ ...r, fairCloseEv: r.fairCloseEv == null ? null : -r.fairCloseEv })));
  assert.equal(neg.state, 'stop');
});

test('next Sombra review: 14 days and 150 graded rows since the last review row', () => {
  const decisions = [
    { row: 50, date: '2026-10-20', topic: 'Revisión Sombra 150 filas', decision: '', evidence: '', review: '', status: 'Vigente' },
    { row: 90, date: '2026-11-08', topic: 'Revisión Sombra 650 filas', decision: '', evidence: '', review: '', status: 'Vigente' },
  ];
  const picks = Array.from({ length: 700 }, () => mkPick({ status: 'won' }));
  const r = nextShadowReview(decisions, picks, '2026-11-15');
  assert.equal(r.last.rows, 650);
  assert.equal(r.dueDate, '2026-11-22');
  assert.equal(r.dueRows, 800);
  assert.equal(r.daysLeft, 7);
  assert.equal(r.rowsLeft, 100);
  assert.equal(r.due, false);
  const later = nextShadowReview(decisions, Array.from({ length: 820 }, () => mkPick()), '2026-11-23');
  assert.equal(later.due, true);
  assert.equal(nextShadowReview([], picks, '2026-11-15').last, null);
});
