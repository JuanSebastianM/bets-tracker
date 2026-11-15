// The integration pass: one app across sections. Glossary links from every section, rules in plain
// words, inline term links, exact Analysis links (line dimension too), banners, wide-screen layout,
// phone-friendly Glossary and Decisions, the app status in Settings. Fixture feed only.
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

test('the missing-columns banner shows only on Overview and Settings; the fixture banner everywhere', async ({ page }) => {
  await openApp(page, '/');
  await expect(page.getByTestId('banner-missing')).toBeVisible();
  for (const [path, ready] of [['/explorer', 'explorer-count'], ['/tests', 'frozen-table'], ['/glossary', 'glossary-tags']]) {
    await page.goto(`/?feed=fixture#${path}`);
    await expect(page.getByTestId(ready)).toBeVisible();
    await expect(page.getByTestId('banner-fixture')).toBeVisible();
    await expect(page.getByTestId('banner-missing')).toHaveCount(0);
  }
  await page.goto('/?feed=fixture#/settings');
  await expect(page.getByTestId('banner-missing')).toBeVisible();
  await expect(page.getByTestId('app-status')).toContainText('desarrollo');
});

test('rules in plain words: "En corto" first on the rule page and in the list; terms link inline', async ({ page }) => {
  const { errors } = await openApp(page, '/glossary/rule-29');
  await expect(page.getByTestId('rule-short')).toContainText('En corto:');
  const says = page.getByTestId('glossary-term').locator('.gl-sec').first();
  for (const [name, slug] of [['DNB', 'dnb'], ['BTTS', 'btts'], ['ML', '1x2'], ['consenso', 'consensus']]) {
    await expect(says.getByRole('link', { name, exact: true })).toHaveAttribute('href', `#/glossary/${slug}`);
  }
  await page.goto('/?feed=fixture#/glossary/rule-34');
  await expect(page.getByTestId('glossary-term').getByRole('link', { name: 'cierre', exact: true }).first()).toHaveAttribute('href', '#/glossary/closing-line');
  await page.goto('/?feed=fixture#/glossary?tab=rules');
  await expect(page.getByTestId('glossary-rules').locator('.gl-rule').first()).toContainText('En corto:');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('glossary on a phone: collapsed groups by category, search first, short page', async ({ page }) => {
  await openApp(page, '/glossary');
  const groups = page.locator('.gl-group');
  await expect(groups).toHaveCount(9);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThan(2500);
  await page.locator('.gl-group[data-cat="markets"] > summary').click();
  await expect(page.locator('.gl-item[data-slug="dnb"]')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar en el glosario' }).fill('kelly');
  await expect(page.locator('.gl-group')).toHaveCount(0);
  await expect(page.locator('.gl-item').first()).toHaveAttribute('data-slug', 'kelly');
});

test('decisions on a phone: one disclosure per card, month jump, clear date labels', async ({ page }) => {
  await openApp(page, '/decisions');
  const card = page.locator('.dcard[data-row="14"]');
  await expect(card.locator('details')).toHaveCount(1);
  await expect(page.locator('.djump-btn').first()).toBeVisible();
  await page.getByRole('button', { name: /Filtros/ }).click();
  await expect(page.getByLabel('Desde el día')).toBeVisible();
  await expect(page.getByLabel('Hasta el día')).toBeVisible();
});

test('tags link to the glossary from the Explorer table, the pick detail, Overview, Analysis, Simulator and Tests', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page, '/explorer?tag=near_value');
  await expect(page.getByTestId('explorer-table').locator('a.tag').first()).toHaveAttribute('href', '#/glossary/near-value');
  await page.goto('/?feed=fixture#/');
  await expect(page.getByTestId('overview-tag-glossary').getByRole('link').first()).toHaveAttribute('href', /#\/glossary\//);
  await page.goto('/?feed=fixture#/analysis');
  await expect(page.getByTestId('bd-glossary').getByRole('link').first()).toHaveAttribute('href', /#\/glossary\//);
  await page.goto('/?feed=fixture#/tests?open=value');
  const dl = page.getByTestId('detail-value').locator('a.dlink').first();
  await expect(dl).toHaveAttribute('href', /#\/decisions\/\d+/);
  await expect(dl).toContainText('Decisiones fila');
});

test('Analysis: line dimension, and a row link opens exactly the row\'s picks', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page, '/analysis?src=shadow&price=le200&dim=line');
  const row = page.getByTestId('bd-rows').locator('tr[data-key]').first();
  await expect(row).toBeVisible();
  const n = Number((await row.locator('td').nth(1).innerText()).split('\n')[0].trim());
  await row.getByTestId('bd-link').click();
  await expect(page).toHaveURL(/#\/explorer\?/);
  await expect(page.getByTestId('explorer-count')).toContainText(`${n} pick`);
});

test('wide screen: rail paints the whole page, side panel never overflows, table head sticks', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page, '/analysis');
  await expect(page.getByTestId('analysis-bars')).toBeVisible();
  const overflow = await page.locator('.an-side-panel').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const bg = await page.locator('.app').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('linear-gradient');
  await page.goto('/?feed=fixture#/explorer');
  await expect(page.getByTestId('explorer-table')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 2500));
  const top = await page.getByTestId('explorer-table').locator('th').first().evaluate((el) => el.getBoundingClientRect().top);
  const header = await page.locator('.app-header').evaluate((el) => el.getBoundingClientRect().bottom);
  expect(Math.abs(top - header)).toBeLessThan(4);
  await expectNoHorizontalScroll(page);
});
