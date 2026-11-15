// Privacy (docs/DATA_CONTRACT.md section 2): the scrubber removes money in every shape, money
// headers are refused, the final feed has no money marker, and the repository holds no money text.
// Never weaken this test to make it pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { loadFeedGs, headerOf } from './helpers/feed-gs.mjs';

const root = resolve(import.meta.dirname, '../..');
const money = JSON.parse(readFileSync(join(root, 'tests/fixtures/privacy-money.json'), 'utf8'));
const gs = loadFeedGs();

/** Patterns that must not appear anywhere in the repo outside the allowed files. */
const REPO_PATTERNS = [
  /\$\s?\d/,
  /\d[\d.,]*\s?(?:mil|k|millones)?\s?(?:de\s)?(?:COP|pesos)\b/i,
  /\b(?:COP|pesos)\s?\$?\s?\d/i,
  /\d{1,3}(?:[.,]\d{3}){2,}(?!\d)/,
];
const DIGITS_RE = /\d/g;

test('every money shape is scrubbed from text', () => {
  for (const text of money.texts) {
    const { text: out, hits } = gs.btFeedScrub(text);
    assert.ok(hits > 0, `no hit in: ${text}`);
    assert.ok(out.includes('[oculto]'), `not hidden: ${text}`);
    for (const re of REPO_PATTERNS) assert.ok(!re.test(out), `${re} survived in "${out}" (from "${text}")`);
  }
});

test('prices, stats and units are not scrubbed', () => {
  for (const text of money.safe) {
    const { text: out, hits } = gs.btFeedScrub(text);
    assert.equal(hits, 0, `false hit in: ${text}`);
    assert.equal(out, text);
  }
});

test('money headers are refused even when someone whitelists one', () => {
  for (const h of money.headers) assert.ok(gs.BT_FEED_MONEY_HEADER.test(h), h);
  const gs2 = loadFeedGs();
  gs2.BT_FEED_TABS.shadow.columns.push(['Ganancia (COP)', 'leak', 'units']);
  const values = { Sombra: [headerOf(gs2, 'shadow'), headerOf(gs2, 'shadow').map(() => 'x')] };
  assert.throws(() => gs2.btFeedBuild(values, 'America/Bogota', new Date()), /refused/);
});

test('an unlisted money column next to whitelisted ones never reaches the feed', () => {
  const h = headerOf(gs, 'bets');
  const header = [...h.slice(0, 9), 'Stake (COP)', ...h.slice(9), 'Ganancia (COP)', 'Bank acumulado (COP)'];
  const row = header.map((name) => (/COP/.test(name) ? 31500 : name === 'Partido' ? 'Equipo A vs Equipo B' : name === 'Notas/lección' ? money.texts[4] : null));
  const feed = gs.btFeedBuild({ Apuestas: [header, row] }, 'America/Bogota', new Date('2026-11-15T16:00:00Z'));
  const json = JSON.stringify(feed);
  assert.ok(!json.includes('31500'));
  assert.ok(!/COP|\$/.test(json));
  assert.ok(feed.meta.redactions >= 1);
  assert.ok(!feed.tabs.bets.columns.some((c) => /cop|bank/i.test(c)));
});

test('every text in a full synthetic sheet comes out clean', () => {
  const tabs = {};
  for (const key of ['bets', 'shadow', 'grok', 'decisions']) {
    const h = headerOf(gs, key);
    tabs[gs.BT_FEED_TABS[key].sheet] = [h, ...money.texts.map((t) => h.map((name) => (name === 'Partido' ? 'A vs B' : t)))];
  }
  tabs.Reglas = [['Reglas'], ...money.texts.map((t, i) => [`${i + 1}. ${t}`])];
  const feed = gs.btFeedBuild(tabs, 'America/Bogota', new Date());
  const json = JSON.stringify(feed);
  for (const re of REPO_PATTERNS) assert.ok(!re.test(json), `${re} in the feed`);
  assert.ok(!gs.BT_FEED_LEFTOVER.test(json));
  assert.ok(feed.tabs.rules.every((r) => !/^1\./.test(r)), 'rule 1 must never be published');
});

/** Text files tracked in the repo (skips vendor bundles, node_modules, build output, git). */
function repoFiles(dir = root) {
  const skip = new Set(['.git', 'node_modules', 'vendor', '_site', 'test-results', 'playwright-report', 'vendor-build-tmp']);
  return readdirSync(dir).flatMap((name) => {
    if (skip.has(name)) return [];
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) return repoFiles(p);
    return /\.(js|mjs|gs|json|md|html|css|webmanifest|yml|txt)$/.test(name) ? [p] : [];
  });
}

const ALLOWED = new Set(['docs/DATA_CONTRACT.md', 'tests/fixtures/privacy-money.json']);

test('the repository holds no money text outside the allowed examples', () => {
  const hits = [];
  for (const file of repoFiles()) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (ALLOWED.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const re of REPO_PATTERNS) if (re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120).replace(DIGITS_RE, '#')}`);
    });
  }
  assert.deepEqual(hits, [], 'money-like text found (digits masked):\n' + hits.join('\n'));
});
