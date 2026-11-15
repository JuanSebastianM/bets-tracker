// Explorer: the shared filter panel (tags, price and date presets, combined filters), URL state,
// saved filters, sorting, the summary strip, the pick detail and the wide-screen table.
// Counts come from the synthetic fixture (tests/fixtures/feed.json, 247 picks).
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

const count = (/** @type {import('playwright/test').Page} */ page) => page.getByTestId('explorer-count');

test('filters by tag from the panel; the sheet shows a live count and "show N picks"', async ({ page }) => {
  const { errors } = await openApp(page, '/explorer');
  await expect(count(page)).toHaveText('247 picks');
  await page.getByTestId('filter-button').click();
  const sheet = page.getByTestId('filter-sheet');
  await expect(sheet.getByRole('heading', { name: 'Filtros' })).toBeVisible();
  await sheet.getByTestId('fchip-tags-near_value').click();
  await expect(page).toHaveURL(/tag=near_value/);
  await expect(sheet.getByTestId('filter-live-count')).toHaveText('18 picks con estos filtros');
  await expect(page.getByTestId('filter-show')).toHaveText('Ver 18 picks');
  // options that would give nothing under the other filters are disabled, with their count
  await expect(sheet.getByTestId('fchip-sources-grok')).toBeDisabled();
  await page.getByTestId('filter-show').click();
  await expect(sheet).toHaveCount(0);
  await expect(count(page)).toHaveText('18 picks');
  await expect(page.getByTestId('filter-button')).toContainText('1');
  await expect(page.getByTestId('active-filters')).toContainText('VALOR CASI');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('price preset ≤ 2.00 and combined filters; chips remove one filter at a time', async ({ page }) => {
  await openApp(page, '/explorer');
  await page.getByTestId('filter-button').click();
  await page.getByTestId('fchip-price-le200').click();
  await expect(page).toHaveURL(/price=le200/);
  await expect(page.getByTestId('filter-live-count')).toHaveText('65 picks con estos filtros');
  await page.getByTestId('fchip-tags-near_value').click();
  await expect(page.getByTestId('filter-live-count')).toHaveText('4 picks con estos filtros');
  await page.getByTestId('filter-show').click();
  await expect(count(page)).toHaveText('4 picks');
  const active = page.getByTestId('active-filters');
  await expect(active.getByRole('button')).toHaveCount(3); // two chips + "clear all"
  await active.getByRole('button', { name: 'Quitar filtro: Cuota ≤ 2.00' }).click();
  await expect(count(page)).toHaveText('18 picks');
  await expect(page).not.toHaveURL(/price=/);
  await active.getByRole('button', { name: 'Quitar filtro: VALOR CASI' }).click();
  await expect(count(page)).toHaveText('247 picks');
  await expect(page.getByTestId('active-filters')).toHaveCount(0);
});

test('date preset "last slate" and a single slate date', async ({ page }) => {
  await openApp(page, '/explorer?src=shadow');
  await page.getByTestId('filter-button').click();
  await page.getByTestId('fchip-date-last_slate').click();
  await expect(page).toHaveURL(/date=last_slate/);
  await expect(page.getByTestId('filter-live-count')).toHaveText('20 picks con estos filtros');
  await page.getByTestId('fchip-date-last_slate').click();
  await page.getByTestId('fp-slate').selectOption('2026-11-15');
  await expect(page).toHaveURL(/slate=2026-11-15/);
  await expect(page.getByTestId('filter-live-count')).toHaveText('20 picks con estos filtros');
  await page.getByTestId('filter-show').click();
  await expect(page.getByTestId('active-filters')).toContainText('Slate 15 nov 2026');
});

test('the view lives in the URL: reload keeps filters, search, sort and page', async ({ page }) => {
  await openApp(page, '/explorer?tag=value&sort=price&dir=asc');
  await expect(count(page)).toHaveText('22 picks');
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('gana');
  await expect(page).toHaveURL(/q=gana/);
  const filtered = await count(page).textContent();
  await page.reload();
  await expect(count(page)).toHaveText(filtered || '');
  await expect(page.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('gana');
  await expect(page.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('price');
  await expect(page.getByTestId('active-filters')).toContainText('VALOR');
  // paging is in the URL too
  await openApp(page, '/explorer?page=2');
  await expect(page.getByRole('navigation', { name: 'Páginas' })).toContainText('Página 2 de 5');
});

test('sort by price, both directions', async ({ page }) => {
  await openApp(page, '/explorer?src=shadow');
  await page.getByRole('combobox', { name: 'Ordenar por' }).selectOption('price');
  await expect(page).toHaveURL(/sort=price/);
  const firstPrice = () => page.locator('.pick-card .pc-odds').first();
  await expect(firstPrice()).toHaveText('14.67');
  await page.getByTestId('sort-dir').click();
  await expect(page).toHaveURL(/dir=asc/);
  await expect(firstPrice()).toHaveText('1.40');
});

test('saved filters: save, apply, delete; built-in starting points fill the panel', async ({ page }) => {
  await openApp(page, '/explorer?tag=cards_under');
  await page.getByTestId('filter-button').click();
  const sheet = page.getByTestId('filter-sheet');
  await sheet.getByText('Filtros guardados y para empezar').click();
  await sheet.getByLabel('Nombre del filtro').fill('Mis tarjetas');
  await sheet.getByRole('button', { name: 'Guardar este filtro' }).click();
  await expect(page.getByText('Filtro «Mis tarjetas» guardado.')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bt.settings') || '{}').presets);
  expect(stored).toEqual([expect.objectContaining({ name: 'Mis tarjetas', query: 'tag=cards_under' })]);

  await sheet.getByTestId('builtin-value_le200').click();
  await expect(page).toHaveURL(/tag=value&price=le200/);
  await expect(sheet.getByTestId('filter-live-count')).toHaveText('1 pick con estos filtros');
  await sheet.getByRole('button', { name: 'Aplicar «Mis tarjetas»' }).click();
  await expect(sheet.getByTestId('filter-live-count')).toHaveText('16 picks con estos filtros');
  await expect(page).toHaveURL(/#\/explorer\?tag=cards_under$/);
  await sheet.getByRole('button', { name: 'Borrar «Mis tarjetas»' }).click();
  await expect(sheet.getByText('Todavía no guardas ninguno')).toBeVisible();
});

test('summary strip: record, rates with n, sentence, and "simulate these picks" keeps the filters', async ({ page }) => {
  await openApp(page, '/explorer?tag=near_value');
  const s = page.getByTestId('explorer-summary');
  await expect(s.getByTestId('ex-yield')).toContainText('n ');
  await expect(s.getByTestId('ex-close-ev')).toContainText('n ');
  await expect(page.getByTestId('explorer-sentence')).toContainText('Estos picks:');
  await expect(s.getByRole('img')).toHaveCount(1); // the sparkline has an accessible name
  await expect(page.getByTestId('simulate-these')).toHaveAttribute('href', '#/simulator?tag=near_value');
});

test('pick detail opens from the list, steps through it, and closes back to the same view', async ({ page }) => {
  const { errors } = await openApp(page, '/explorer?src=shadow');
  await page.locator('.pick-card').first().click();
  await expect(page).toHaveURL(/#\/explorer\/shadow%3A\d+\?src=shadow$/);
  const sheet = page.getByTestId('pick-sheet');
  await expect(sheet.getByTestId('pick-row')).toContainText(/Sombra fila \d+/);
  await expect(page.getByTestId('pick-position')).toHaveText('1 de 185');
  await expect(page.getByTestId('pick-prev')).toBeDisabled();
  await page.getByTestId('pick-next').click();
  await expect(page.getByTestId('pick-position')).toHaveText('2 de 185');
  await expect(sheet.getByTestId('pick-notes')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await sheet.getByRole('button', { name: 'Cerrar' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/#\/explorer\?src=shadow$/);
  await expect(count(page)).toHaveText('185 picks');
  expect(errors).toEqual([]);
});

test('pick detail: deep link shows Pinnacle 1X2 open → last, books and the tag meaning', async ({ page }) => {
  await openApp(page, '/explorer/shadow%3A169');
  const sheet = page.getByTestId('pick-sheet');
  await expect(sheet.getByTestId('pick-row')).toHaveText('Sombra fila 169');
  await expect(sheet.getByTestId('pin-move')).toHaveText('2.10 / 3.40 / 3.60 → 2.02 / 3.45 / 3.85');
  await expect(sheet.getByTestId('pick-books')).toContainText('Betano');
  await expect(sheet.getByTestId('pick-tag')).toContainText('VALOR CASI');
  await expect(sheet.getByRole('link', { name: 'VALOR CASI' })).toHaveAttribute('href', '#/glossary/near-value');
  // opened directly: closing falls back to the list instead of leaving the app
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/explorer$/);
  await expect(count(page)).toHaveText('247 picks');
});

test('an unknown pick says so', async ({ page }) => {
  await openApp(page, '/explorer/shadow%3A99999');
  await expect(page.getByTestId('pick-sheet')).toContainText('No encontramos este pick');
});

test('empty result offers to clear the filters', async ({ page }) => {
  await openApp(page, '/explorer?q=zzzz-nada');
  await expect(page.getByTestId('explorer-empty')).toBeVisible();
  await page.getByTestId('explorer-empty').getByRole('button', { name: 'Quitar todos' }).click();
  await expect(count(page)).toHaveText('247 picks');
});

test('English', async ({ page }) => {
  await openApp(page, '/explorer?tag=near_value', { locale: 'en' });
  await expect(page.getByTestId('explorer-sentence')).toContainText('These picks:');
  await expect(page.getByTestId('filter-button')).toContainText('Filters');
});

test.describe('wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('side panel, sortable table and the detail as a dialog', async ({ page }) => {
    const { errors } = await openApp(page, '/explorer?src=shadow');
    const panel = page.getByTestId('filter-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('filter-button')).toHaveCount(0);
    const table = page.getByTestId('explorer-table');
    await expect(table.locator('tbody tr')).toHaveCount(50);
    await table.locator('[data-sort="price"]').click();
    await expect(page).toHaveURL(/sort=price/);
    await expect(table.locator('th[aria-sort="descending"]')).toContainText('Cuota');
    await expect(table.locator('tbody tr').first().locator('td').nth(4)).toHaveText('14.67');
    await table.locator('[data-sort="price"]').click();
    await expect(table.locator('th[aria-sort="ascending"]')).toContainText('Cuota');
    await expect(table.locator('tbody tr').first().locator('td').nth(4)).toHaveText('1.40');
    // the panel filters in place
    await panel.getByTestId('fchip-tags-value').click();
    await expect(count(page)).toHaveText('22 picks');
    await table.locator('tbody tr').first().locator('a.ex-match-link').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/explorer\?src=shadow&tag=value&sort=price&dir=asc$/);
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
