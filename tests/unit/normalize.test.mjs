// normalize.js on the synthetic fixture: every tag, status, market family and note format is present
// and parsed, so the fixture keeps covering the edge cases it was built for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeFeed, statusOf, tabObjects } from '../../src/data/normalize.js';
import { TAGS } from '../../src/data/tags.js';

const feed = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));
const data = normalizeFeed(feed);
const picks = data.picks;

test('status mapping, sheet words', () => {
  const map = { Ganada: 'won', Perdida: 'lost', Nula: 'void', Push: 'void', Devuelta: 'void', 'Medio ganada': 'half_won', 'Media perdida': 'half_lost', Pendiente: 'pending', '': 'pending', Aplazado: 'other' };
  for (const [raw, st] of Object.entries(map)) assert.equal(statusOf(raw), st, raw);
});

test('tab rows become objects keyed by the feed keys', () => {
  const rows = tabObjects({ columns: ['row', 'a'], rows: [[2, 'x']] });
  assert.deepEqual(rows, [{ row: 2, a: 'x' }]);
});

test('the fixture covers every tag, source, market family and status', () => {
  const tags = new Set(picks.map((p) => p.tag));
  for (const t of TAGS) assert.ok(tags.has(t.id), `fixture lacks tag ${t.id}`);
  for (const f of ['result', 'goals', 'corners_total', 'corners_team', 'cards_total', 'cards_team', 'shots', 'combo']) {
    assert.ok(picks.some((p) => p.market === f), `fixture lacks market ${f}`);
  }
  for (const s of ['won', 'lost', 'void', 'half_won', 'half_lost', 'pending']) assert.ok(picks.some((p) => p.status === s), `fixture lacks status ${s}`);
  assert.ok(picks.length >= 240);
});

test('the fixture covers every note format and close edge case', () => {
  const has = (fn, what) => assert.ok(picks.some(fn), `fixture lacks ${what}`);
  has((p) => p.parsed.feedPrice != null, 'feed X');
  has((p) => p.parsed.feedOpen != null && !p.parsed.feedOpenFlipped, 'apertura feed');
  has((p) => p.parsed.feedOpenFlipped, 'apertura feed invertida');
  for (const r of ['feed', 'books', 'one_book', 'consensus']) has((p) => p.parsed.ref === r, `ref ${r}`);
  has((p) => p.parsed.sample === '10+', 'muestra 10+');
  has((p) => p.parsed.sample === '6-9', 'muestra 6–9');
  for (const f of ['keeps', 'rejects', 'na']) has((p) => p.parsed.fuerza === f, `FUERZA ${f}`);
  has((p) => p.parsed.pin, 'pin');
  has((p) => p.parsed.pinMissing, 'pin n/d');
  has((p) => p.parsed.open1x2 && p.parsed.open1x2 !== 'n/a', '1X2 apertura feed');
  has((p) => p.parsed.open1x2 === 'n/a', '1X2 apertura feed n/a');
  has((p) => p.closeSource === 'same_book', 'two-sided close at the own book');
  has((p) => p.closeSource === 'feed' && p.need === 1, 'two-sided feed close');
  has((p) => p.closeSource === 'feed' && p.need === 2, 'three-way feed close');
  has((p) => p.need === 'dc' && p.fairCloseEv != null, 'double chance de-vigged from the 1X2');
  has((p) => p.closePrice != null && p.fairCloseEv == null, 'one-sided close');
  has((p) => p.parsed.closeMissing, 'cierre feed: sin línea');
  has((p) => p.status !== 'pending' && p.closePrice == null && !p.parsed.closeMissing, 'graded without a close');
  has((p) => p.parsed.loggerEvOtherBook, 'EV justa (otro lado de …)');
  has((p) => p.price != null && Math.round(p.price * 1000) % 10 !== 0, '3-decimal price');
  has((p) => p.price == null, 'pick without a price');
  has((p) => p.parsed.singleSource, 'una sola fuente');
  has((p) => p.parsed.filters.length > 1, 'several rejection reasons');
  has((p) => p.books.length > 1, 'VALOR at two books');
  has((p) => p.source === 'bets' && p.extra.freeBet, 'free bet');
  has((p) => p.source === 'bets' && p.extra.clvCrossSource, 'cross-source Apuestas close');
  has((p) => p.source === 'grok' && p.time, 'Grok time');
  assert.ok(data.meta.missingHeaders.length, 'a missing header');
  assert.ok(picks.filter((p) => p.source === 'grok').every((p) => p.extra.minPrice == null));
});

test('Pick shape: uid, row, measures; decisions, pinnacle and rules carried over', () => {
  const p = picks.find((x) => x.source === 'shadow');
  assert.equal(p.uid, `shadow:${p.row}`);
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
  for (const k of ['fairCloseEv', 'closeSource', 'clv', 'need', 'hasTwoSidedClose', 'parsed', 'reviewClass', 'side']) assert.ok(k in p, k);
  assert.ok(picks.every((x, i) => i === 0 || picks[i - 1].date <= x.date), 'chronological');
  assert.ok(data.decisions.length && data.decisions.every((d) => d.topic));
  assert.ok(data.pinnacle.length && data.pinnacle[0].id);
  assert.ok(data.rules.length && !data.rules.some((r) => r.startsWith('1.')));
  // fair-close EV never exceeds raw CLV at the same source (review.py's sanity check)
  for (const x of picks) if (x.openingFairEv != null && x.clv != null && x.clvSource === (x.closeSource === 'same_book' ? 'own' : 'feed')) assert.ok(x.openingFairEv <= x.clv + 1e-9, x.uid);
});
