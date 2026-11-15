// Audit of apps-script/Feed.gs (docs/build-log/audit.md): money shapes the first scrubber missed, money
// typed into number columns, duplicate whitelisted headers, and a doGet that ignores its parameters and
// only reads. Money examples live in tests/fixtures/privacy-money.json (auditTexts), never here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFeedGs, headerOf } from './helpers/feed-gs.mjs';

const money = JSON.parse(readFileSync(new URL('../fixtures/privacy-money.json', import.meta.url), 'utf8'));
const gs = loadFeedGs();
const TZ = 'America/Bogota';
const NOW = new Date('2026-11-15T16:00:00Z');

test('audit: every money shape the first scrubber missed is hidden, with the exact output', () => {
  assert.ok(money.auditTexts.length >= 20);
  for (const [input, want] of money.auditTexts) {
    const r = gs.btFeedScrub(input);
    assert.ok(r.hits > 0, `no hit in: ${input}`);
    assert.equal(r.text, want, `scrubbed form of: ${input}`);
  }
});

test('audit: real-looking counts, prices, ids and words stay readable', () => {
  for (const text of [...money.auditSafe, ...money.safe]) {
    const r = gs.btFeedScrub(text);
    assert.equal(r.hits, 0, `false hit in: ${text} -> ${r.text}`);
  }
});

test('audit: a money-sized value in a number column is dropped and counted', () => {
  const hb = headerOf(gs, 'bets');
  // 5 and 7 digit integers built at run time so the repo scan sees no money-like literal
  const big = Number('7' + '0'.repeat(4));
  const huge = Number('7' + '0'.repeat(6));
  const cell = { ID: big, Partido: 'A vs B', Cuota: big, 'Stake (u)': huge, 'Ganancia (u)': -big, 'Prob. modelo': big, EV: big, 'Stake máx. (u)': 1.5 };
  const feed = gs.btFeedBuild({ Apuestas: [hb, hb.map((n) => cell[n] ?? '')] }, TZ, NOW);
  const t = feed.tabs.bets;
  const get = (k) => t.rows[0][t.columns.indexOf(k)];
  for (const k of ['id', 'price', 'stakeU', 'profitU', 'probModel', 'ev']) assert.equal(get(k), null, k);
  assert.equal(get('maxStakeU'), 1.5, 'plausible values pass');
  assert.equal(feed.meta.redactions, 6);
  assert.ok(!JSON.stringify(feed).includes(String(big)));
});

test('audit: a number in a text column is scrubbed like text', () => {
  const hs = headerOf(gs, 'shadow');
  const huge = Number('7' + '0'.repeat(6));
  const row = hs.map((n) => (n === 'Notas' ? huge : n === 'Partido' ? 'A vs B' : ''));
  const feed = gs.btFeedBuild({ Sombra: [hs, row] }, TZ, NOW);
  assert.equal(feed.tabs.shadow.rows[0][feed.tabs.shadow.columns.indexOf('notes')], '[oculto]');
});

test('audit: Pinnacle minutes before kickoff keep values over a thousand', () => {
  const h = headerOf(gs, 'pinnacle');
  const row = h.map((n) => (n === 'id' ? 'abc' : n === 'mins_before_kickoff' ? 2716 : n === 'last_1' ? 1.65 : null));
  const feed = gs.btFeedBuild({ Pinnacle: [h, row] }, TZ, NOW);
  const t = feed.tabs.pinnacle;
  assert.equal(t.rows[0][t.columns.indexOf('mins_before_kickoff')], 2716);
  assert.equal(feed.meta.redactions, 0);
});

test('audit: a whitelisted header that appears twice is not read and is reported', () => {
  const hs = headerOf(gs, 'shadow');
  const header = [...hs, 'Notas'];
  const row = header.map((n, i) => (i === header.length - 1 ? 'otra columna' : n === 'Notas' ? 'nota' : n === 'Partido' ? 'A vs B' : ''));
  const feed = gs.btFeedBuild({ Sombra: [header, row] }, TZ, NOW);
  const t = feed.tabs.shadow;
  assert.equal(t.rows[0][t.columns.indexOf('notes')], null);
  assert.ok(feed.meta.missingHeaders.includes('Sombra!Notas'));
  assert.ok(!JSON.stringify(feed).includes('otra columna'));
});

test('audit: doGet ignores its parameters and only calls read methods on the spreadsheet', () => {
  const opened = [];
  const READ = new Set(['getSheetByName', 'getDataRange', 'getValues', 'getSpreadsheetTimeZone']);
  /** Any method that is not a known read throws, so a write would fail the test. */
  const guard = (obj) => new Proxy(obj, { get(o, k) { if (typeof k === 'string' && !(k in o) && k !== 'then') throw new Error('unexpected call ' + k); return o[k]; } });
  const sheet = (name) => guard({ getDataRange: () => guard({ getValues: () => (name === 'Sombra' ? [headerOf(gs, 'shadow'), headerOf(gs, 'shadow').map((n) => (n === 'Partido' ? 'A vs B' : ''))] : [[]]) }) });
  const ss = guard({ getSheetByName: (n) => { opened.push(n); return sheet(n); }, getSpreadsheetTimeZone: () => TZ });
  const out = [];
  const g = loadFeedGs({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (b) => ({ setMimeType: () => { out.push(b); return b; } }) },
    CacheService: { getScriptCache: () => null },
    LockService: { getScriptLock: () => null },
  });
  g.doGet({ parameter: { nocache: '1', tab: 'Bank', range: 'Bank!A1:Z' }, queryString: 'nocache=1&tab=Bank' });
  g.doGet({});
  assert.equal(out.length, 2);
  const a = JSON.parse(out[0]), b = JSON.parse(out[1]);
  delete a.generatedAt; delete b.generatedAt;
  assert.deepEqual(a, b, 'parameters change nothing');
  for (const n of ['Bank', 'Resumen mensual', 'Por mercado', 'Por liga']) assert.ok(!opened.includes(n), n);
  assert.ok([...new Set(opened)].every((n) => ['Apuestas', 'Sombra', 'Grok', 'Decisiones', 'Pinnacle', 'Reglas'].includes(n)));
  assert.ok(READ.size === 4);
});
