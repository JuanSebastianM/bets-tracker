// Glossary and rules content (src/content/*.json), the loader (src/data/content.js) and the link
// helpers (src/lib/glossary-links.js). The quality gates: both languages have the same slugs and the
// same language-neutral fields; every tag, market family, status, filter reason and parsed note field
// has an entry; every related slug exists; no entry holds money; every expected rule number has an
// entry in both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { TAGS, tagLabel, MARKET_FAMILIES, FILTER_REASONS } from '../../src/data/tags.js';
import { buildContent, loadContent, clearContentCache, searchGlossary, groupByLetter, letterOf, filterRules, ruleStateCounts, RULE_STATES } from '../../src/data/content.js';
import { glossaryHref, tagSlug, ruleSlug, decisionHref, sheetRuleSlug, SHEET_RULE_SLUGS } from '../../src/lib/glossary-links.js';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const G = { es: read('src/content/glossary.es.json'), en: read('src/content/glossary.en.json') };
const R = { es: read('src/content/rules.es.json'), en: read('src/content/rules.en.json') };

/**
 * Every numbered rule of betting-analyst's "Principles (hard rules)" and every rule number the skill
 * cites elsewhere (checked against the skill on 15 Nov 2026: rules 1–36). Add a number here when the
 * skill gains a rule; the test then fails until both languages explain it.
 */
const EXPECTED_RULES = Array.from({ length: 36 }, (_, i) => i + 1);
const STATUSES = ['won', 'lost', 'void', 'half_won', 'half_lost', 'pending', 'other'];

/** The parsed-note fields named in docs/DATA_CONTRACT.md section 6 (first column of its table). */
function contractNoteFields() {
  const doc = readFileSync(join(root, 'docs/DATA_CONTRACT.md'), 'utf8');
  const sec = doc.split('## 6. Parsed notes')[1].split('\n## ')[0];
  const fields = new Set();
  for (const line of sec.split('\n')) {
    if (!line.startsWith('| `')) continue;
    // Values in brackets (`ref` (`feed` / `books` …)) are not fields.
    const first = line.split('|')[1].replace(/\([^)]*\)/g, '');
    for (const m of first.matchAll(/`([a-zA-Z0-9]+)`/g)) fields.add(m[1]);
  }
  return [...fields];
}

const slugsOf = (lang) => G[lang].entries.map((e) => e.slug);
const ruleSlugs = (lang) => R[lang].rules.map((r) => r.slug);
const covered = (kind) => new Set(G.es.entries.flatMap((e) => e.covers?.[kind] || []));

test('Spanish and English have the same entries, categories and language-neutral fields', () => {
  assert.deepEqual(slugsOf('en'), slugsOf('es'));
  assert.deepEqual(G.en.categories.map((c) => c.id), G.es.categories.map((c) => c.id));
  for (let i = 0; i < G.es.entries.length; i++) {
    const es = G.es.entries[i];
    const en = G.en.entries[i];
    for (const k of ['category', 'related', 'covers']) assert.deepEqual(en[k], es[k], `${es.slug}.${k}`);
    assert.equal(Boolean(en.example), Boolean(es.example), `${es.slug}.example in one language only`);
    for (const lang of [es, en]) for (const k of ['term', 'short', 'inSheet']) assert.ok(String(lang[k] || '').trim(), `${es.slug}.${k} empty`);
  }
  assert.deepEqual(ruleSlugs('en'), ruleSlugs('es'));
  for (let i = 0; i < R.es.rules.length; i++) {
    const es = R.es.rules[i];
    const en = R.en.rules[i];
    for (const k of ['n', 'slug', 'state', 'since', 'decisions', 'terms']) assert.deepEqual(en[k], es[k], `rule ${es.n}.${k}`);
    assert.equal(Boolean(en.why), Boolean(es.why), `rule ${es.n}.why in one language only`);
    assert.equal(Boolean(en.stateNote), Boolean(es.stateNote), `rule ${es.n}.stateNote in one language only`);
  }
});

test('slugs are unique, stable kebab-case English; categories exist', () => {
  const all = [...slugsOf('es'), ...ruleSlugs('es')];
  assert.equal(new Set(all).size, all.length, 'duplicate slug');
  for (const s of all) assert.match(s, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, s);
  const cats = new Set(G.es.categories.map((c) => c.id));
  for (const e of G.es.entries) assert.ok(cats.has(e.category), `${e.slug}: unknown category ${e.category}`);
});

test('every TagId has its entry, slugged tagSlug(id) and titled with the sheet label', () => {
  const bySlug = new Map(G.es.entries.map((e) => [e.slug, e]));
  const byEn = new Map(G.en.entries.map((e) => [e.slug, e]));
  for (const tag of TAGS) {
    const e = bySlug.get(tagSlug(tag.id));
    assert.ok(e, `no entry ${tagSlug(tag.id)} for tag ${tag.id}`);
    assert.ok(e.covers?.tags?.includes(tag.id), `${e.slug} does not cover ${tag.id}`);
    assert.equal(e.term, tagLabel(tag.id));
    assert.equal(byEn.get(e.slug).term, tagLabel(tag.id), 'tags keep the sheet label in English too');
  }
});

test('every market family, status, filter reason and contract note field has an entry', () => {
  for (const m of MARKET_FAMILIES) assert.ok(covered('markets').has(m), `market family ${m}`);
  for (const s of STATUSES) assert.ok(covered('statuses').has(s), `status ${s}`);
  for (const [id] of FILTER_REASONS) assert.ok(covered('reasons').has(id), `filter reason ${id}`);
  const fields = contractNoteFields();
  assert.ok(fields.length >= 20, `parsed ${fields.length} note fields from the contract`);
  for (const f of fields) assert.ok(covered('notes').has(f), `note field ${f}`);
});

test('every related slug and every rule term exists; rule decisions are sheet rows', () => {
  const known = new Set([...slugsOf('es'), ...ruleSlugs('es')]);
  for (const e of G.es.entries) for (const r of e.related || []) assert.ok(known.has(r), `${e.slug} → ${r}`);
  for (const r of R.es.rules) {
    for (const s of r.terms || []) assert.ok(known.has(s), `rule ${r.n} → ${s}`);
    for (const row of r.decisions) assert.ok(Number.isInteger(row) && row >= 2, `rule ${r.n} decision ${row}`);
    assert.ok(RULE_STATES.includes(r.state), `rule ${r.n} state ${r.state}`);
    assert.ok(r.since === null || /^\d{4}-\d{2}-\d{2}$/.test(r.since), `rule ${r.n} since`);
  }
});

test('every expected rule number has an entry in both languages, and nothing else', () => {
  for (const lang of ['es', 'en']) {
    const ns = R[lang].rules.map((r) => r.n);
    for (const n of EXPECTED_RULES) {
      const r = R[lang].rules.find((x) => x.n === n);
      assert.ok(r, `${lang}: rule ${n} missing`);
      assert.equal(r.slug, ruleSlug(n));
      for (const k of ['title', 'says']) assert.ok(String(r[k] || '').trim(), `${lang}: rule ${n}.${k}`);
    }
    assert.deepEqual([...ns].sort((a, b) => a - b), EXPECTED_RULES, `${lang}: unexpected rule numbers`);
  }
});

test('no entry or rule contains a currency amount', () => {
  const MONEY = [
    /\$/,
    /\bCOP\b/i,
    /\bpesos\b/i,
    /\d[\d.,]*\s?(?:mil|k|millones)\s?(?:de\s)?(?:COP|pesos)?\b(?!\w)/i,
    /\d{1,3}(?:[.,]\d{3}){2,}(?!\d)/,
  ];
  for (const file of ['glossary.es', 'glossary.en', 'rules.es', 'rules.en']) {
    const text = readFileSync(join(root, `src/content/${file}.json`), 'utf8');
    for (const re of MONEY) assert.ok(!re.test(text), `${file}: ${re} → ${(text.match(re) || [''])[0]}`);
  }
});

test('link helpers', () => {
  assert.equal(glossaryHref('near-value'), '#/glossary/near-value');
  assert.equal(tagSlug('prop_near_value'), 'prop-near-value');
  assert.equal(tagSlug('shadow_rule30'), 'shadow-rule30');
  assert.equal(ruleSlug(29), 'rule-29');
  assert.equal(ruleSlug('7'), 'rule-7');
  assert.equal(decisionHref(110), '#/decisions/110');
});

test('staking rule lines map to existing entries', () => {
  const known = new Set(slugsOf('es'));
  for (const [, slug] of SHEET_RULE_SLUGS) assert.ok(known.has(slug), slug);
  assert.ok(known.has('sheet-rules'));
  const feed = read('tests/fixtures/feed.json');
  const got = feed.tabs.rules.map((line) => sheetRuleSlug(line));
  assert.deepEqual(got, ['stake', 'minimum-price', 'double-bet', 'live-bet', 'fair-price', 'favorites', 'kelly', 'clv']);
  assert.equal(sheetRuleSlug('10. Algo nuevo'), 'sheet-rules');
});

test('search: accents and case ignored, ranked by term, then aliases, then definitions; by category', () => {
  const c = buildContent(G.es, R.es);
  assert.equal(searchGlossary(c.entries, { q: 'corners' })[0].slug, 'corners');
  assert.equal(searchGlossary(c.entries, { q: 'VALOR CASI' })[0].slug, 'near-value');
  assert.ok(searchGlossary(c.entries, { q: 'vig' }).some((e) => e.slug === 'margin'), 'alias');
  assert.ok(searchGlossary(c.entries, { q: 'oddspedia' }).length >= 2, 'definitions are searched too');
  const tags = searchGlossary(c.entries, { category: 'tags' });
  assert.equal(tags.length, TAGS.length);
  assert.deepEqual(searchGlossary(c.entries, { q: 'zzzz' }), []);
  assert.equal(searchGlossary(c.entries).length, c.entries.length);
});

test('A–Z grouping and rule filters', () => {
  const c = buildContent(G.es, R.es);
  assert.equal(letterOf('Ámbar'), 'A');
  assert.equal(letterOf('1X2'), '#');
  assert.equal(letterOf('«feed»'), 'F');
  const groups = groupByLetter(c.entries);
  assert.equal(groups[0].letter, '#');
  assert.equal(groups.reduce((s, g) => s + g.items.length, 0), c.entries.length);
  assert.deepEqual(c.rules.map((r) => r.n), EXPECTED_RULES);
  assert.deepEqual(filterRules(c.rules, { q: '29' }).map((r) => r.n), [29]);
  assert.ok(filterRules(c.rules, { state: 'paused' }).every((r) => r.state === 'paused'));
  const counts = ruleStateCounts(c.rules);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), EXPECTED_RULES.length);
});

test('loadContent fetches each file once per locale and retries after a failure', async () => {
  clearContentCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const name = String(url).split('/').pop();
    return { ok: true, json: async () => read(`src/content/${name}`) };
  };
  const a = await loadContent('es', { fetchImpl, base: '/x/' });
  const b = await loadContent('es', { fetchImpl, base: '/x/' });
  assert.equal(a, b);
  assert.deepEqual(calls, ['/x/src/content/glossary.es.json', '/x/src/content/rules.es.json']);
  assert.equal(a.bySlug.get('rule-29'), undefined);
  assert.equal(a.ruleByN.get(29).slug, 'rule-29');
  let fail = true;
  const flaky = async (url) => (fail ? { ok: false, status: 503 } : fetchImpl(url));
  await assert.rejects(loadContent('en', { fetchImpl: flaky, base: '/y/' }));
  fail = false;
  const en = await loadContent('en', { fetchImpl: flaky, base: '/y/' });
  assert.equal(en.entries.length, G.en.entries.length);
  clearContentCache();
});

test('the deploy precaches the content files, so the glossary works offline', () => {
  const out = mkdtempSync(join(tmpdir(), 'bt-site-'));
  try {
    execFileSync(process.execPath, [join(root, 'scripts/build-site.mjs'), out], { stdio: 'pipe' });
    const sw = readFileSync(join(out, 'sw.js'), 'utf8');
    for (const f of ['glossary.es', 'glossary.en', 'rules.es', 'rules.en']) assert.ok(sw.includes(`"./src/content/${f}.json"`), f);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('<Term> links to the entry; <RefText> renders references as links, never as markup', async () => {
  const { Term, RefText } = await import('../../src/lib/ui/index.js');
  const v = Term({ slug: 'near-value', children: 'VALOR CASI' });
  assert.equal(v.type, 'a');
  assert.equal(v.props.href, '#/glossary/near-value');
  assert.equal(v.props.children, 'VALOR CASI');
  const nodes = RefText({ text: '<i>fila 7</i> y regla 3', known: { decisionRows: [7], ruleNumbers: [3] } });
  const anchors = nodes.filter((n) => n && n.type === 'a').map((n) => n.props.href);
  assert.deepEqual(anchors, ['#/decisions/7', '#/glossary/rule-3']);
  assert.ok(nodes.every((n) => !n.props?.dangerouslySetInnerHTML));
});
