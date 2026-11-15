// Audit (docs/build-log/audit.md): what the section agents could not verify. Synthetic feeds only:
// the fixture, the fixture with whitelisted headers missing, an empty feed, and the fixture blown up to
// 5,000 picks. Both languages, both themes, 390 px and 1280 px.
import { test, expect } from 'playwright/test';
import { readFileSync } from 'node:fs';
import { ROUTES, openApp, expectNoHorizontalScroll } from './helpers.js';

const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Serve `feed` instead of the fixture file. */
async function serveFeed(page, feed) {
  await page.route('**/tests/fixtures/feed.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(feed) }));
}

/** The fixture with the given whitelisted keys removed from a tab, as the script sends a missing header. */
function withoutColumns(tab, keys, headers) {
  const f = clone(FIXTURE);
  const t = f.tabs[tab];
  for (const k of keys) {
    const i = t.columns.indexOf(k);
    for (const r of t.rows) r[i] = null;
  }
  f.meta.missingHeaders = [...f.meta.missingHeaders, ...headers];
  return f;
}

function emptyFeed() {
  const f = clone(FIXTURE);
  for (const k of ['bets', 'shadow', 'grok', 'decisions', 'pinnacle']) f.tabs[k].rows = [];
  f.tabs.rules = [];
  f.meta.rows = { bets: 0, shadow: 0, grok: 0, decisions: 0, pinnacle: 0, rules: 0 };
  return f;
}

/** The fixture's Sombra rows repeated (new row numbers, dates spread over 60 days) up to `n` picks. */
function bigFeed(n) {
  const f = clone(FIXTURE);
  const src = f.tabs.shadow.rows;
  const di = f.tabs.shadow.columns.indexOf('date');
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = clone(src[i % src.length]);
    r[0] = i + 2;
    const d = new Date(Date.UTC(2026, 8, 17 + Math.floor((i * 60) / n)));
    r[di] = d.toISOString().slice(0, 10);
    rows.push(r);
  }
  f.tabs.shadow.rows = rows;
  f.meta.rows.shadow = rows.length;
  return f;
}

/** Visit every route; each must render its ready element (or, for `empty`, some text) with no page error. */
async function visitAll(page, errors, { empty = false } = {}) {
  for (const r of ROUTES) {
    await page.evaluate((p) => (location.hash = '#' + p), r.path);
    if (empty) await expect(page.locator('main')).not.toBeEmpty();
    else await expect(page.getByTestId(r.ready).first(), r.path).toBeVisible({ timeout: 10_000 });
  }
  expect(errors, errors.join('\n')).toEqual([]);
}

test('missing whitelisted headers: banner, and every route still renders', async ({ page }) => {
  const f = withoutColumns('shadow', ['notes', 'closePrice', 'reason'], ['Sombra!Notas', 'Sombra!Cuota cierre', 'Sombra!Motivo de descarte']);
  await serveFeed(page, f);
  const { errors } = await openApp(page, '/');
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  await expect(page.locator('body')).toContainText('Sombra!Notas');
  await visitAll(page, errors);
});

test('empty feed: every route renders without an error', async ({ page }) => {
  await serveFeed(page, emptyFeed());
  const { errors } = await openApp(page, '/');
  await expect(page.locator('main')).not.toBeEmpty();
  await visitAll(page, errors, { empty: true });
});

test('5,000 picks: each section renders within seconds and a filter tap stays responsive', async ({ page }) => {
  test.setTimeout(120_000);
  await serveFeed(page, bigFeed(5000));
  const { errors } = await openApp(page, '/');
  const timings = {};
  for (const r of ROUTES.filter((x) => !x.path.includes('%3A') && !x.path.includes('/decisions/'))) {
    const t0 = Date.now();
    await page.evaluate((p) => (location.hash = '#' + p), r.path);
    await expect(page.getByTestId(r.ready).first()).toBeVisible({ timeout: 15_000 });
    timings[r.path] = Date.now() - t0;
  }
  // A filter change in the Explorer: from tap to the new count.
  await page.evaluate(() => (location.hash = '#/explorer'));
  const count = page.getByTestId('explorer-count');
  await expect(count).toBeVisible();
  const before = await count.textContent();
  await page.getByTestId('filter-button').click();
  const t0 = Date.now();
  await page.getByTestId('fchip-sources-grok').click();
  await page.getByTestId('filter-show').click();
  await expect(count).not.toHaveText(before || '');
  timings.explorerFilter = Date.now() - t0;
  // The Simulator recomputes on a stake change.
  await page.evaluate(() => (location.hash = '#/simulator'));
  await expect(page.getByTestId('sim-profit')).toBeVisible();
  const p0 = await page.getByTestId('sim-profit').textContent();
  const t1 = Date.now();
  await page.getByRole('button', { name: '2u', exact: true }).click();
  await expect(page.getByTestId('sim-profit')).not.toHaveText(p0 || '');
  timings.simulatorStake = Date.now() - t1;
  console.log('timings (ms) with 5,000 picks:', JSON.stringify(timings));
  for (const [k, ms] of Object.entries(timings)) expect(ms, k).toBeLessThan(8000); // alone: under 2 s each (build log); generous for CI and parallel workers
  expect(errors).toEqual([]);
});

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark']) {
    for (const locale of ['es', 'en']) {
      test(`every route at ${width} px, ${theme}, ${locale}: renders, no horizontal scroll, no untranslated key`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 900 });
        const { errors } = await openApp(page, '/', { settings: { theme }, locale });
        for (const r of ROUTES) {
          await page.evaluate((p) => (location.hash = '#' + p), r.path);
          await expect(page.getByTestId(r.ready).first(), r.path).toBeVisible({ timeout: 10_000 });
          await expectNoHorizontalScroll(page);
          // a raw i18n key looks like "section.key" with no spaces; it must never be shown
          const raw = await page.evaluate(() => {
            const keys = [];
            const walker = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const s = (walker.currentNode.nodeValue || '').trim();
              if (/^[a-z]+(?:\.[a-zA-Z0-9_]+){1,4}$/.test(s) && !/^\d/.test(s)) keys.push(s);
            }
            return keys;
          });
          expect(raw, `${r.path}: ${raw.join(', ')}`).toEqual([]);
        }
        const dark = await page.evaluate(() => document.documentElement.dataset.theme || document.documentElement.className);
        expect(String(dark)).toContain(theme);
        expect(errors, errors.join('\n')).toEqual([]);
      });
    }
  }
}
