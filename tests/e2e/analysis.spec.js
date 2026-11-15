// Analysis section on the synthetic fixture (tests/fixtures/feed.json: 247 picks, 185 Sombra, 22 VALOR).
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

const count = (page) => page.getByTestId('analysis-count');

test('breakdown renders: chart, sentence, compact rows that open, two-way table', async ({ page }) => {
  const { errors } = await openApp(page, '/analysis');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Análisis');
  await expect(count(page)).toHaveText('247 picks con estos filtros');
  await expect(page.getByTestId('analysis-tab-breakdown')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('analysis-bars')).toBeVisible();
  await expect(page.getByTestId('breakdown-text')).toContainText('tienen al menos 10 calificadas');
  const valor = page.getByTestId('bd-rows').locator('li[data-key="value"]');
  await expect(valor).toContainText('VALOR');
  await valor.locator('summary').click();
  await expect(valor.getByTestId('bd-link')).toBeVisible();
  await page.getByText('Cruzar con una segunda dimensión').click();
  await page.getByLabel('Segunda dimensión').selectOption('priceBand');
  await expect(page).toHaveURL(/dim2=priceBand/);
  await expect(page.getByTestId('two-way')).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('dimension switch and sort live in the URL', async ({ page }) => {
  const { errors } = await openApp(page, '/analysis');
  await page.getByLabel('Partir por').selectOption('priceBand');
  await expect(page).toHaveURL(/dim=priceBand/);
  const keys = page.getByTestId('bd-rows').locator('li');
  await expect(keys.first()).toHaveAttribute('data-key', 'le170');
  await expect(page.getByTestId('analysis-bars').locator('.range-row').first()).toContainText('≤ 1.70');
  await page.getByRole('radio', { name: 'Yield' }).click();
  await expect(page).toHaveURL(/measure=yield/);
  await page.getByLabel('Ordenar por').selectOption('n');
  await expect(page).toHaveURL(/sort=n/);
  await expect(keys.first()).toHaveAttribute('data-key', '200_250');
  await page.reload();
  await expect(keys.first()).toHaveAttribute('data-key', '200_250');
  expect(errors).toEqual([]);
});

test('minimum n greys small groups, or hides them', async ({ page }) => {
  const { errors } = await openApp(page, '/analysis');
  const rows = page.getByTestId('bd-rows').locator('li');
  // Wait for the list before counting: count() does not wait, and on a slow runner it read 0.
  await expect(page.getByTestId('bd-rows').locator('li.an-small').first()).toBeVisible();
  const all = await rows.count();
  expect(all).toBeGreaterThan(0);
  await page.getByTestId('minn-slider').fill('20');
  await expect(page).toHaveURL(/minn=20/);
  await expect(page.getByTestId('breakdown-text')).toContainText('al menos 20 calificadas');
  await page.getByTestId('hide-small').check();
  await expect(page).toHaveURL(/small=hide/);
  await expect(page.getByTestId('bd-hidden')).toBeVisible();
  await expect.poll(() => rows.count()).toBeLessThan(all);
  await expect(page.getByTestId('bd-rows').locator('li.an-small')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('filters through the panel apply to every part', async ({ page }) => {
  const { errors } = await openApp(page, '/analysis');
  await page.getByTestId('filter-button').click();
  const sheet = page.getByTestId('filter-sheet');
  await sheet.getByTestId('fchip-sources-shadow').click();
  await sheet.getByTestId('filter-show').click();
  await expect(page).toHaveURL(/src=shadow/);
  await expect(count(page)).toHaveText('185 picks con estos filtros');
  await page.getByTestId('analysis-tab-calibration').click();
  await expect(page).toHaveURL(/#\/analysis\/calibration\?src=shadow/);
  await expect(count(page)).toHaveText('185 picks con estos filtros');
  await expect(page.getByTestId('calibration-chart')).toBeVisible();
  expect(errors).toEqual([]);
});

test('filters through the URL, and a group link lands on a filtered Explorer', async ({ page }) => {
  const { errors } = await openApp(page, '/analysis?src=shadow&dim=tag');
  await expect(count(page)).toHaveText('185 picks con estos filtros');
  const valor = page.getByTestId('bd-rows').locator('li[data-key="value"]');
  await valor.locator('summary').click();
  await valor.getByTestId('bd-link').click();
  await expect(page).toHaveURL(/#\/explorer\?src=shadow&tag=value/);
  await expect(page.getByTestId('explorer-count')).toHaveText('22 picks');
  expect(errors).toEqual([]);
});

test('calibration: four series with Brier scores, series switch', async ({ page }) => {
  const { errors } = await openApp(page, '/analysis/calibration');
  const compare = page.getByTestId('calibration-compare').locator('li');
  await expect(compare).toHaveCount(4);
  await expect(compare.first()).toContainText('Brier 0.');
  await expect(compare.first()).toContainText('calibra mejor');
  await page.getByRole('radio', { name: 'Consenso' }).click();
  await expect(page).toHaveURL(/series=consensus/);
  await expect(page.getByRole('heading', { name: 'Calibración: Prob. justa de consenso (VALOR)' })).toBeVisible();
  await page.getByTestId('calibration-chart').getByRole('button', { name: 'Ver como tabla' }).click();
  await expect(page.getByTestId('calibration-chart').locator('table')).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('price against the close: histogram, sources, moves and Pinnacle', async ({ page }) => {
  const { errors } = await openApp(page, '/analysis/close');
  await expect(page.getByTestId('close-histogram')).toBeVisible();
  await expect(page.getByTestId('close-text')).toContainText('le ganaron al cierre sin margen');
  await expect(page.getByTestId('close-by-source').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('close-moves')).toBeVisible();
  await expect(page.getByTestId('pin-towards')).toContainText('1');
  await expect(page.getByTestId('pin-text')).toContainText('cruzados con la pestaña Pinnacle: 1');
  await page.getByText('Ver el pick cruzado').click();
  await page.getByTestId('pin-rows').getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/explorer\/shadow%3A169/);
  expect(errors).toEqual([]);
});

test('Grok vs Claude: verdict groups, team corners, scope note', async ({ page }) => {
  const { errors } = await openApp(page, '/analysis/grok?src=shadow');
  await expect(page.getByTestId('grok-scope')).toBeVisible();
  await expect(count(page)).toHaveText('40 picks de Grok con estos filtros');
  await expect(page.getByTestId('grok-text')).toContainText('Grok va');
  await expect(page.getByTestId('grok-text')).toContainText('muestras pequeñas');
  const kinds = page.getByTestId('grok-verdicts').locator('li[data-key]');
  await expect(kinds).toHaveCount(3);
  await kinds.first().locator('summary').click();
  await expect(kinds.first().locator('[data-why="skip"]')).toBeVisible();
  await expect(page.getByTestId('tc-grok')).toBeVisible();
  await expect(page.getByTestId('tc-none')).toBeVisible();
  await expect(page.getByTestId('grok-markets').locator('li')).not.toHaveCount(0);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('English: parts, labels and sentences', async ({ page }) => {
  const { errors } = await openApp(page, '/analysis?dim=weekday', { locale: 'en' });
  await expect(page.getByTestId('analysis-tab-breakdown')).toHaveText('Breakdown');
  await expect(count(page)).toHaveText('247 picks with these filters');
  await expect(page.getByTestId('breakdown-text')).toContainText('groups of “Weekday”');
  await expect(page.getByText('There is no weekday filter')).toBeVisible();
  await page.getByTestId('analysis-tab-grok').click();
  await expect(page.getByTestId('grok-text')).toContainText('Grok is');
  expect(errors).toEqual([]);
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  test('table, side panel and no horizontal scroll on every part', async ({ page }) => {
    const { errors } = await openApp(page, '/analysis');
    await expect(page.getByTestId('bd-rows').locator('table')).toBeVisible();
    await page.getByTestId('bd-sort-yield').click();
    await expect(page).toHaveURL(/sort=yield/);
    await page.getByTestId('fchip-tags-value').click();
    await expect(page).toHaveURL(/tag=value/);
    await expect(count(page)).toHaveText('22 picks con estos filtros');
    // The tag column is wide enough: no label breaks inside a word.
    const broken = await page.locator('.an-td-label a').evaluateAll((els) => els.filter((a) => a.getClientRects().length > 1 && !/\s/.test(a.textContent.trim())).length);
    expect(broken).toBe(0);
    for (const part of ['breakdown', 'calibration', 'close', 'grok']) {
      await page.getByTestId(`analysis-tab-${part}`).click();
      await expect(page).toHaveURL(new RegExp(`#/analysis/${part}\\?tag=value`));
      await expectNoHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });
});
