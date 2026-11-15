// apps-script/Feed.gs: whitelist by header, value conversion, rules, self-check, cache wrapper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFeedGs, headerOf, FEED_GS_SOURCE } from './helpers/feed-gs.mjs';

const gs = loadFeedGs();
/** Money text comes from the privacy fixture (the only file allowed to hold it). */
const MONEY_TEXT = JSON.parse(readFileSync(new URL('../fixtures/privacy-money.json', import.meta.url), 'utf8')).texts[2].split(' de ').pop();
const TZ = 'America/Bogota';
const NOW = new Date('2026-11-15T16:00:00Z');

/**
 * The instant whose wall clock in Bogotá is the given date-time, by the time zone database (in 1899
 * Bogotá used local mean time, which is how Sheets hands time-only cells to Apps Script).
 */
function bogota(y, m, d, hh = 0, mm = 0) {
  const want = Date.UTC(y, m - 1, d, hh, mm);
  let t = want + 5 * 3600000;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    t += want - shown;
  }
  return new Date(t);
}

test('only whitelisted globals: every global starts with btFeed / BT_FEED, plus doGet', () => {
  const names = [...FEED_GS_SOURCE.matchAll(/^(?:function|var|let|const)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  assert.ok(names.length > 10);
  for (const n of names) assert.ok(n === 'doGet' || n.startsWith('btFeed') || n.startsWith('BT_FEED_'), n);
});

test('only read calls on the spreadsheet', () => {
  const calls = [...FEED_GS_SOURCE.matchAll(/\.(\w+)\(/g)].map((m) => m[1]);
  for (const forbidden of ['setValue', 'setValues', 'appendRow', 'insertRow', 'deleteRow', 'clear', 'clearContents', 'setFormula', 'insertSheet', 'copyTo']) {
    assert.ok(!calls.includes(forbidden), forbidden);
  }
  assert.match(FEED_GS_SOURCE, /@OnlyCurrentDoc/);
  for (const tab of ['Bank', 'Resumen mensual', 'Por mercado', 'Por liga']) assert.ok(!FEED_GS_SOURCE.includes(`'${tab}'`), tab);
});

test('columns are found by header, never by position; unlisted columns are dropped', () => {
  const h = headerOf(gs, 'shadow');
  const shuffled = ['Columna extra', ...[...h].reverse()];
  const row = shuffled.map((name) =>
    ({ 'Columna extra': 'secreto', Fecha: '2026-11-14', Partido: 'Uno vs Dos', Cuota: 1.91, Estado: 'Ganada', 'Prob. modelo': 0.5512, Notas: 'feed 1.833' })[name] ?? null,
  );
  const feed = gs.btFeedBuild({ Sombra: [shuffled, row] }, TZ, NOW);
  const t = feed.tabs.shadow;
  assert.equal(t.columns[0], 'row');
  const get = (k) => t.rows[0][t.columns.indexOf(k)];
  assert.equal(get('row'), 2);
  assert.equal(get('date'), '2026-11-14');
  assert.equal(get('match'), 'Uno vs Dos');
  assert.equal(get('price'), 1.91);
  assert.equal(get('probModel'), 0.5512);
  assert.equal(get('notes'), 'feed 1.833');
  assert.ok(!JSON.stringify(feed).includes('secreto'));
});

test('a missing whitelisted header is listed and its key is null', () => {
  const h = headerOf(gs, 'grok').filter((x) => x !== 'Cuota mín. Grok');
  const row = h.map((name) => (name === 'Partido' ? 'A vs B' : name === 'Cuota' ? 2 : null));
  const feed = gs.btFeedBuild({ Grok: [h, row] }, TZ, NOW);
  assert.ok(feed.meta.missingHeaders.includes('Grok!Cuota mín. Grok'));
  const t = feed.tabs.grok;
  assert.equal(t.rows[0][t.columns.indexOf('minPrice')], null);
  assert.ok(feed.meta.missingHeaders.includes('Apuestas'), 'a missing tab is listed too');
});

test('value conversion: Date cells, 1899 times, serials, % text, signed text, money in numeric cells', () => {
  const hb = headerOf(gs, 'bets');
  const cell = {
    ID: 7, Fecha: bogota(2026, 10, 2), Partido: 'A vs B', Cuota: '1,91', 'Stake (u)': '1.5', 'Prob. modelo': '59.70%',
    EV: 0.246, 'Ganancia (u)': '+2.74', CLV: '−5.2%', 'Cuota cierre': MONEY_TEXT, 'Prob. blend': 59.7, Estado: '  Ganada  ',
  };
  const row = hb.map((n) => cell[n] ?? '');
  const feed = gs.btFeedBuild({ Apuestas: [hb, row, hb.map(() => '')] }, TZ, NOW);
  const t = feed.tabs.bets;
  const get = (k) => t.rows[0][t.columns.indexOf(k)];
  assert.equal(t.rows.length, 1, 'rows with an empty Partido are skipped');
  assert.equal(get('id'), 7);
  assert.equal(get('date'), '2026-10-02');
  assert.equal(get('price'), 1.91);
  assert.equal(get('stakeU'), 1.5);
  assert.equal(get('probModel'), 0.597);
  assert.equal(get('ev'), 0.246);
  assert.equal(get('profitU'), 2.74);
  assert.equal(get('clv'), -0.052);
  assert.equal(get('closePrice'), null, 'money text in a number column is dropped');
  assert.equal(get('probBlend'), 0.597, 'a probability written as 59.7 becomes a fraction');
  assert.equal(get('status'), 'Ganada');
  assert.equal(get('notes'), null);
  assert.ok(feed.meta.redactions >= 1);

  const hg = headerOf(gs, 'grok');
  const g = { Fecha: 46339, Hora: bogota(1899, 12, 30, 14, 30), Partido: 'C vs D' };
  const fg = gs.btFeedBuild({ Grok: [hg, hg.map((n) => g[n] ?? null)] }, TZ, NOW);
  const tg = fg.tabs.grok;
  assert.equal(tg.rows[0][tg.columns.indexOf('date')], '2026-11-13');
  assert.equal(tg.rows[0][tg.columns.indexOf('time')], '14:30');
  const g2 = { Fecha: '14/11/2026', Hora: 0.375, Partido: 'E vs F' };
  const fg2 = gs.btFeedBuild({ Grok: [hg, hg.map((n) => g2[n] ?? null)] }, TZ, NOW);
  assert.equal(fg2.tabs.grok.rows[0][1], '2026-11-14');
  assert.equal(fg2.tabs.grok.rows[0][2], '09:00');
});

test('rules: numbered lines below the "Reglas" header, never rule 1, nothing above it', () => {
  const values = [['Algo arriba', 'x'], ['2. línea fuera de la lista', ''], ['Reglas'], ['1. la regla de la unidad'], ['2. Stake entre 0,25u y 2u.'], [''], ['texto suelto'], ['10. Calibración.']];
  const feed = gs.btFeedBuild({ Reglas: values }, TZ, NOW);
  assert.deepEqual([...feed.tabs.rules], ['2. Stake entre 0,25u y 2u.', '10. Calibración.']);
  const none = gs.btFeedBuild({ Reglas: [['sin cabecera'], ['2. x']] }, TZ, NOW);
  assert.equal(none.tabs.rules.length, 0);
  assert.ok(none.meta.missingHeaders.includes('Reglas!Reglas'));
});

test('self-check replaces any cell that still holds a money marker', () => {
  const feed = { tabs: { shadow: { columns: ['row', 'notes'], rows: [[2, 'ok'], [3, 'leak COP']] }, rules: ['2. x', 'y $'] } };
  assert.equal(gs.btFeedSelfCheck(feed), 2);
  assert.equal(feed.tabs.shadow.rows[1][1], '[oculto]');
  assert.equal(feed.tabs.rules[1], '[oculto]');
});

test('meta: schema, generatedAt, rows per tab', () => {
  const feed = gs.btFeedBuild({}, TZ, NOW);
  assert.equal(feed.schema, 1);
  assert.equal(feed.generatedAt, '2026-11-15T16:00:00Z');
  assert.deepEqual([...Object.keys(feed.meta.rows)].sort(), ['bets', 'decisions', 'grok', 'pinnacle', 'rules', 'shadow']);
  assert.equal(feed.meta.redactions, 0);
});

test('Pinnacle: only columns A–Q by header; the status cells to the right are never read', () => {
  const h = [...headerOf(gs, 'pinnacle'), '', 'credits_remaining', 'last_run_utc'];
  const row = h.map((n) => (n === 'id' ? 'abc123' : n === 'last_1' ? '1.65' : n === 'credits_remaining' ? '476' : null));
  const feed = gs.btFeedBuild({ Pinnacle: [h, row] }, TZ, NOW);
  assert.ok(!JSON.stringify(feed.tabs.pinnacle).includes('476'));
  assert.equal(feed.tabs.pinnacle.rows[0][feed.tabs.pinnacle.columns.indexOf('last_1')], 1.65);
});

// ---------------------------------------------------------------- cache wrapper

function fakeCache({ throwOn = null, limit = 100 * 1024 } = {}) {
  const store = new Map();
  const calls = { get: 0, getAll: 0, put: 0, putAll: 0 };
  const guard = (op) => {
    calls[op]++;
    if (throwOn === op || throwOn === 'all') throw new Error('cache down');
  };
  return {
    store,
    calls,
    get(k) {
      guard('get');
      return store.has(k) ? store.get(k) : null;
    },
    getAll(keys) {
      guard('getAll');
      const out = {};
      for (const k of keys) if (store.has(k)) out[k] = store.get(k);
      return out;
    },
    put(k, v) {
      guard('put');
      if (Buffer.byteLength(v, 'utf8') > limit) throw new Error('Argument too large');
      store.set(k, v);
    },
    putAll(values) {
      guard('putAll');
      for (const [k, v] of Object.entries(values)) {
        if (Buffer.byteLength(v, 'utf8') > limit) throw new Error('Argument too large');
      }
      for (const [k, v] of Object.entries(values)) store.set(k, v);
    },
    removeAll(keys) {
      for (const k of keys) store.delete(k);
    },
  };
}
function fakeLock(ok = true) {
  return { held: false, tries: 0, tryLock() { this.tries++; this.held = ok; return ok; }, releaseLock() { this.held = false; } };
}
/** A feed whose JSON is a few hundred KB (several chunks), with accents. */
function bigBuild(counter) {
  return () => {
    counter.n++;
    return { schema: 1, generatedAt: '2026-11-15T16:00:00Z', meta: { rows: {}, redactions: 0, missingHeaders: [] }, tabs: { notes: 'Córners ñandú '.repeat(20000) } };
  };
}

test('cache: a miss builds once and stores chunks; the next call is a hit with meta.cached', () => {
  const cache = fakeCache();
  const lock = fakeLock();
  const c = { n: 0 };
  const first = JSON.parse(gs.btFeedServe({ cache, lock, build: bigBuild(c) }));
  assert.equal(c.n, 1);
  assert.equal(first.meta.cached, false);
  assert.equal(first.meta.cacheTtlSeconds, 300);
  assert.ok(cache.store.size > 3, 'stored in several chunks');
  for (const v of cache.store.values()) assert.ok(Buffer.byteLength(v, 'utf8') <= 100 * 1024);
  assert.equal(lock.held, false, 'lock released');
  const second = JSON.parse(gs.btFeedServe({ cache, lock, build: bigBuild(c) }));
  assert.equal(c.n, 1, 'served from the cache');
  assert.equal(second.meta.cached, true);
  assert.equal(second.tabs.notes, first.tabs.notes);
  const idx = JSON.parse(cache.store.get(gs.btFeedCacheIndexKey()));
  assert.equal(idx.generatedAt, '2026-11-15T16:00:00Z');
  assert.match(gs.btFeedCacheIndexKey(), /s1:/, 'the schema is in the key');
});

test('cache: a missing chunk is a miss', () => {
  const cache = fakeCache();
  const c = { n: 0 };
  gs.btFeedServe({ cache, lock: fakeLock(), build: bigBuild(c) });
  cache.store.delete(`${gs.BT_FEED_CACHE_PREFIX}c1`);
  const out = JSON.parse(gs.btFeedServe({ cache, lock: fakeLock(), build: bigBuild(c) }));
  assert.equal(c.n, 2);
  assert.equal(out.meta.cached, false);
});

test('cache: an oversized payload is served but not cached', () => {
  const cache = fakeCache();
  const c = { n: 0 };
  const huge = () => {
    c.n++;
    return { schema: 1, generatedAt: 'x', meta: { rows: {}, redactions: 0, missingHeaders: [] }, tabs: { t: 'a'.repeat(gs.BT_FEED_CACHE_CHUNK * (gs.BT_FEED_CACHE_MAX_CHUNKS + 1)) } };
  };
  const out = JSON.parse(gs.btFeedServe({ cache, lock: fakeLock(), build: huge }));
  assert.equal(out.meta.cached, false);
  assert.equal(cache.store.size, 0);
  // a chunk rejected by the cache itself (byte limit) is not fatal either
  const tiny = fakeCache({ limit: 10 });
  const out2 = JSON.parse(gs.btFeedServe({ cache: tiny, lock: fakeLock(), build: bigBuild(c) }));
  assert.equal(out2.meta.cached, false);
  assert.equal(tiny.store.get(gs.btFeedCacheIndexKey()) ?? null, null, 'no index without its chunks');
});

test('cache: a throwing cache or lock never breaks the response', () => {
  for (const throwOn of ['get', 'getAll', 'putAll', 'put', 'all']) {
    const c = { n: 0 };
    const out = JSON.parse(gs.btFeedServe({ cache: fakeCache({ throwOn }), lock: fakeLock(), build: bigBuild(c) }));
    assert.equal(out.schema, 1, throwOn);
    assert.equal(c.n, 1);
  }
  const badLock = { tryLock() { throw new Error('lock down'); }, releaseLock() {} };
  const out = JSON.parse(gs.btFeedServe({ cache: fakeCache(), lock: badLock, build: bigBuild({ n: 0 }) }));
  assert.equal(out.meta.cached, false);
  const noServices = JSON.parse(gs.btFeedServe({ cache: null, lock: null, build: bigBuild({ n: 0 }) }));
  assert.equal(noServices.meta.cached, false);
});

test('cache: without the lock a caller re-checks the cache, then builds anyway', () => {
  const cache = fakeCache();
  const c = { n: 0 };
  const out = JSON.parse(gs.btFeedServe({ cache, lock: fakeLock(false), build: bigBuild(c) }));
  assert.equal(c.n, 1);
  assert.equal(out.meta.cached, false);
  assert.ok(cache.calls.get >= 2, 'checked the cache again after failing to lock');
});

test('doGet ignores request parameters (no cache bypass)', () => {
  assert.match(FEED_GS_SOURCE, /function btFeedDoGet\(e\) \{[\s\S]*?btFeedServe\(\{ cache: btFeedScriptCache\(\), lock: btFeedScriptLock\(\), build: btFeedFromSpreadsheet \}\)/);
  const body = FEED_GS_SOURCE.slice(FEED_GS_SOURCE.indexOf('function btFeedDoGet'), FEED_GS_SOURCE.indexOf('function doGet'));
  assert.ok(!/e\.parameter/.test(body));
});
