// Filter by line and side: the "Línea" section of the shared panel, its chips, the URL, the built-in
// preset, the Simulator "por línea" breakdown and the Overview per-line rows.
// Counts come from the synthetic fixture (tests/fixtures/feed.json, 247 picks): TARJETAS UNDER has 16
// picks, 11 of them Under 4.5; 17 picks in all are cards Under 4.5.
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

const count = (/** @type {import('playwright/test').Page} */ page) => page.getByTestId('explorer-count');

test('TARJETAS UNDER + Under 4.5 in two taps; chips; removal; reload keeps it', async ({ page }) => {
  const { errors } = await openApp(page, '/explorer');
  await page.getByTestId('filter-button').click();
  const sheet = page.getByTestId('filter-sheet');
  await sheet.getByTestId('fchip-tags-cards_under').click();
  const lines = sheet.getByTestId('fp-lines');
  await expect(lines).toBeVisible();
  // Only the lines that exist under the tag, sorted by line, one kind of market: no group headings.
  await expect(lines.locator('[data-testid^="fchip-lines-"]')).toHaveCount(3);
  await expect(lines.locator('[data-testid^="fchip-lines-"]').first()).toContainText('Under 3.5');
  await expect(lines.getByTestId('fchip-lines-cards:under:4.5')).toContainText('Under 4.5');
  await expect(lines.getByTestId('fchip-lines-cards:under:4.5')).toContainText('11');
  await lines.getByTestId('fchip-lines-cards:under:4.5').click();
  await expect(page).toHaveURL(/tag=cards_under/);
  await expect(page).toHaveURL(/line=cards%253Aunder%253A4.5/);
  await expect(sheet.getByTestId('filter-live-count')).toHaveText('11 picks con estos filtros');
  await page.getByTestId('filter-show').click();
  await expect(count(page)).toHaveText('11 picks');
  const active = page.getByTestId('active-filters');
  await expect(active.getByRole('button', { name: 'Quitar filtro: Under 4.5' })).toBeVisible();
  await page.reload();
  await expect(count(page)).toHaveText('11 picks');
  await expect(active).toContainText('TARJETAS UNDER');
  await expect(active).toContainText('Under 4.5');
  await active.getByRole('button', { name: 'Quitar filtro: TARJETAS UNDER' }).click();
  await expect(count(page)).toHaveText('17 picks');
  await active.getByRole('button', { name: 'Quitar filtro: Under 4.5' }).click();
  await expect(count(page)).toHaveText('247 picks');
  await expect(page).not.toHaveURL(/line=/);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('line alone: grouped by kind of market; side chips; scoped chip labels when kinds mix', async ({ page }) => {
  await openApp(page, '/explorer');
  await page.getByTestId('filter-button').click();
  const lines = page.getByTestId('filter-sheet').getByTestId('fp-lines');
  await expect(lines.locator('[data-scope="cards"]')).toBeVisible();
  await expect(lines.locator('[data-scope="corners"]')).toBeVisible();
  await expect(lines.locator('[data-scope="ah"]')).toBeVisible();
  await lines.getByTestId('fchip-sides-under').click();
  await expect(page).toHaveURL(/side=under/);
  // Only picks with a line (round 2: three-way markets and other line-less picks keep their side for review.py).
  await expect(page.getByTestId('filter-live-count')).toHaveText('95 picks con estos filtros');
  await lines.getByTestId('fchip-lines-cards:under:4.5').click();
  await lines.getByTestId('fchip-lines-corners:under:9.5').click();
  await page.getByTestId('filter-show').click();
  const active = page.getByTestId('active-filters');
  await expect(active).toContainText('Lado: Under');
  await expect(active).toContainText('Tarjetas: Under 4.5');
  await expect(active).toContainText('Córners: Under 9.5');
  await expectNoHorizontalScroll(page);
});

test('built-in preset "Tarjetas Under 4.5"', async ({ page }) => {
  await openApp(page, '/explorer');
  await page.getByTestId('filter-button').click();
  const sheet = page.getByTestId('filter-sheet');
  await sheet.getByText('Filtros guardados y para empezar').click();
  await expect(sheet.getByTestId('builtin-cards_under_45')).toHaveText('Tarjetas Under 4.5');
  await sheet.getByTestId('builtin-cards_under_45').click();
  await page.getByTestId('filter-show').click();
  await expect(count(page)).toHaveText('11 picks');
  await expect(page).toHaveURL(/tag=cards_under/);
});

test('Simulator "por línea": a row link lands on the same count in the Explorer', async ({ page }) => {
  const { errors } = await openApp(page, '/simulator?src=shadow&tag=cards_under');
  await page.getByTestId('sim-breakdown').getByText('Desglose').click();
  await page.getByTestId('sim-breakdown').getByRole('radio', { name: 'Línea' }).click();
  const row = page.getByTestId('sim-breakdown-rows').locator('a[data-key="cards:under:4.5"]');
  await expect(row).toContainText('Under 4.5');
  const n = await row.getAttribute('data-n');
  expect(Number(n)).toBeGreaterThan(0);
  await row.click();
  await expect(page).toHaveURL(/#\/explorer\?/);
  await expect(count(page)).toHaveText(`${n} picks`);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('Simulator price band 1.70–2.00: the link shows the row\'s n', async ({ page }) => {
  await openApp(page, '/simulator?src=shadow');
  await page.getByTestId('sim-breakdown').getByText('Desglose').click();
  await page.getByTestId('sim-breakdown').getByRole('radio', { name: 'Cuota' }).click();
  const row = page.getByTestId('sim-breakdown-rows').locator('a[data-key="170_200"]');
  const n = await row.getAttribute('data-n');
  await row.click();
  await expect(count(page)).toHaveText(`${n} picks`);
});

test('Overview: the TARJETAS UNDER row opens a per-line list, collapsed by default', async ({ page }) => {
  const { errors } = await openApp(page, '/');
  const lines = page.getByTestId('tag-lines-cards_under');
  await expect(lines).toBeVisible();
  await expect(lines.locator('a[data-key="cards:under:4.5"]')).toBeHidden();
  await lines.getByText('Por línea').click();
  const row = lines.locator('a[data-key="cards:under:4.5"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Under 4.5');
  await expect(row).toContainText('n ');
  await row.click();
  await expect(page).toHaveURL(/tag=cards_under/);
  await expect(page).toHaveURL(/line=/);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('English: the section, the chips and the preset', async ({ page }) => {
  await openApp(page, '/explorer?tag=cards_under&line=cards%3Aunder%3A4.5', { locale: 'en' });
  await expect(count(page)).toHaveText('11 picks');
  await expect(page.getByTestId('active-filters')).toContainText('Under 4.5');
  await page.getByTestId('filter-button').click();
  const sheet = page.getByTestId('filter-sheet');
  await expect(sheet.getByRole('button', { name: /^Line/ })).toBeVisible();
  await sheet.getByText('Saved filters and starting points').click();
  await expect(sheet.getByTestId('builtin-cards_under_45')).toContainText('Cards Under 4.5');
  await expectNoHorizontalScroll(page);
});

test('desktop: the line section in the side column, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { errors } = await openApp(page, '/explorer?tag=cards_under');
  const lines = page.getByTestId('fp-lines');
  await expect(lines).toBeVisible();
  await lines.getByTestId('fchip-lines-cards:under:5.5').click();
  await expect(count(page)).toHaveText('2 picks');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
