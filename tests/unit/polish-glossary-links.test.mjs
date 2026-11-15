// One source for glossary links: every slug the code links to exists in the glossary content (both
// languages); the inline term linker; the plain "En corto" sentence of every rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TAGS, tagSlug as tagSlugFromTags, FILTER_REASONS, MARKET_FAMILIES } from '../../src/data/tags.js';
import { tagSlug, ruleSlug, REASON_SLUGS, MARKET_SLUGS, SHEET_RULE_SLUGS, SHEET_RULE_BY_N, tagHref } from '../../src/lib/glossary-links.js';
import { buildContent, buildTermIndex, linkTerms } from '../../src/data/content.js';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const G = { es: read('src/content/glossary.es.json'), en: read('src/content/glossary.en.json') };
const R = { es: read('src/content/rules.es.json'), en: read('src/content/rules.en.json') };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Every glossary slug written literally in the code, with the file it is in. */
function slugsInCode() {
  /** @type {Array<[string, string]>} */
  const found = [];
  const res = [
    /glossaryHref\(\s*'([^'$]+)'\s*\)/g,
    /\bslug="([^"$]+)"/g,
    /\bslug=\$\{'([^']+)'\}/g,
    /href\(\s*[`']\/glossary\/([a-z0-9-]+)/g,
    /#\/glossary\/([a-z0-9][a-z0-9-]*)/g,
    /\bslug:\s*'([a-z0-9-]+)'/g,
  ];
  for (const file of walk(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const re of res) for (const m of src.matchAll(re)) found.push([m[1], file]);
    // Slug maps: `const X_SLUG(S) = { a: 'slug', … }` and `[re, 'slug']` pairs.
    for (const m of src.matchAll(/[A-Z_]*SLUGS?[A-Z_]*\b[^=\n]*=\s*(?:\/\*\*[^*]*\*\/\s*\()?\s*[{[]([\s\S]*?)[}\]]\)?;/g)) {
      for (const v of m[1].matchAll(/'([a-z0-9][a-z0-9-]*)'/g)) found.push([v[1], file]);
    }
  }
  return found;
}

test('every slug in the code exists in the glossary (es and en)', () => {
  const known = { es: new Set(G.es.entries.map((e) => e.slug)), en: new Set(G.en.entries.map((e) => e.slug)) };
  const rules = { es: new Set(R.es.rules.map((r) => r.slug)), en: new Set(R.en.rules.map((r) => r.slug)) };
  const all = [
    ...slugsInCode(),
    ...TAGS.map((tg) => [tagSlug(tg.id), 'TAGS']),
    ...Object.values(REASON_SLUGS).map((s) => [s, 'REASON_SLUGS']),
    ...Object.values(MARKET_SLUGS).map((s) => [s, 'MARKET_SLUGS']),
    ...SHEET_RULE_SLUGS.map(([, s]) => [s, 'SHEET_RULE_SLUGS']),
    ...Object.values(SHEET_RULE_BY_N).map(([, s]) => [s, 'SHEET_RULE_BY_N']),
    ['sheet-rules', 'sheetRuleSlug fallback'],
  ];
  assert.ok(all.length > 60, `collected ${all.length}`);
  const literal = new Set(slugsInCode().map(([s]) => s));
  for (const s of ['fair-close-ev', 'standard-error', 'decision-in-force', 'decision-replaced']) assert.ok(literal.has(s), `collector finds ${s}`);
  for (const lang of ['es', 'en']) {
    for (const [slug, file] of all) {
      if (/^rule-\d+$/.test(slug)) assert.ok(rules[lang].has(slug), `${lang}: ${slug} (${file})`);
      else assert.ok(known[lang].has(slug), `${lang}: ${slug} (${file})`);
    }
  }
  for (let n = 1; n <= 36; n++) assert.ok(rules.es.has(ruleSlug(n)) && rules.en.has(ruleSlug(n)), `rule ${n}`);
});

test('one implementation of tagSlug; the maps cover every reason and market family', () => {
  assert.equal(tagSlugFromTags, tagSlug);
  assert.equal(tagHref('prop_near_value'), '#/glossary/prop-near-value');
  for (const [id] of FILTER_REASONS) assert.ok(REASON_SLUGS[id], `reason ${id}`);
  for (const id of MARKET_FAMILIES) assert.ok(MARKET_SLUGS[id], `market ${id}`);
  // The maps agree with the entries' own `covers`.
  for (const e of G.es.entries) {
    for (const r of e.covers?.reasons || []) assert.equal(REASON_SLUGS[r], e.slug, `reason ${r}`);
  }
  // No section keeps a local copy of tagSlug.
  for (const file of walk(join(root, 'src/features'))) {
    assert.ok(!/const tagSlug\s*=/.test(readFileSync(file, 'utf8')), `local tagSlug in ${file}`);
  }
});

test('inline term links: abbreviations and Spanish words become links, first occurrence only, safe tokens', () => {
  const ix = buildTermIndex(G.es.entries);
  const terms = (text, opts) => linkTerms(text, ix, opts).filter((x) => x.type === 'term').map((x) => `${x.text}=${x.slug}`);
  assert.deepEqual(terms('Se cotizan ML, DNB y BTTS.'), ['ML=1x2', 'DNB=dnb', 'BTTS=btts']);
  assert.deepEqual(terms('El consenso manda; el consenso otra vez.'), ['consenso=consensus']);
  assert.deepEqual(terms('Se compara con el cierre de la misma casa.'), ['cierre=closing-line']);
  assert.deepEqual(terms('Esos picks son VALOR CASI y VALOR.'), ['VALOR CASI=near-value', 'VALOR=value']);
  // Capitalised sheet words match only as written; ordinary words are not linked.
  assert.deepEqual(terms('no tiene valor, pero la cuota y el precio sí'), []);
  // Whole words only, accents and case ignored for the others.
  assert.deepEqual(terms('MODELOS y remodelo'), []);
  assert.deepEqual(terms('Según el Modelo.'), ['Modelo=model']);
  // The seen set spans calls (pieces of one paragraph); excluded slugs are never linked.
  const seen = new Set();
  assert.deepEqual(terms('el modelo', { seen }), ['modelo=model']);
  assert.deepEqual(terms('otra vez el modelo', { seen }), []);
  assert.deepEqual(terms('DNB y ML', { exclude: ['dnb'] }), ['ML=1x2']);
  // Text is kept exactly: joining the tokens gives the input back (no HTML involved).
  const src = 'Con <b>DNB</b> & "BTTS" — sin margen.';
  assert.equal(linkTerms(src, ix).map((x) => x.text).join(''), src);
  // English index too.
  const en = buildTermIndex(G.en.entries);
  assert.deepEqual(linkTerms('Price ML, DNB and the consensus.', en).filter((x) => x.type === 'term').map((x) => x.slug), ['1x2', 'dnb', 'consensus']);
});

test('every rule has a plain one-sentence "short" in both languages, without jargon', () => {
  const JARGON = /\b(?:EV|blend|SHADOW|ML|DNB|BTTS|CLV|feed|xG|H2H|Kelly|lambda|de-?vig|builder|F-gap|F-ratio|F-sample|SE|yield|CANDIDATE|IA-WATCH|VALOR)\b|\bstake\b|margen|margin|consenso|consensus/;
  for (const lang of ['es', 'en']) {
    const c = buildContent(G[lang], R[lang]);
    assert.equal(c.rules.length, 36);
    for (const r of c.rules) {
      const s = String(r.short || '');
      assert.ok(s.length > 20 && s.length < 200, `${lang} rule ${r.n}: short length`);
      assert.ok(/[.!?]$/.test(s), `${lang} rule ${r.n}: ends a sentence`);
      assert.ok(!/[.!?]\s+\p{Lu}/u.test(s), `${lang} rule ${r.n}: one sentence`);
      assert.ok(!JARGON.test(s), `${lang} rule ${r.n}: jargon in "${s}"`);
      assert.ok(!/\$|COP|pesos|\d{1,3}(?:[.,]\d{3}){2,}/.test(s), `${lang} rule ${r.n}: money`);
    }
  }
});
