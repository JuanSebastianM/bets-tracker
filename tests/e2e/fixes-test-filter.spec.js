// The filter by test (fixes): every Tests link opens the Explorer on `test=<id>` with the same count as
// the link, the "Prueba: …" chip, a reload, the "Prueba" section of the filter panel, and English.
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

/** Click a Tests link and check the Explorer shows the link's own row count, the chip and the URL. */
async function followLink(page, link, id, label, chipWord = 'Prueba') {
  const rows = Number(await link.getAttribute('data-rows'));
  expect(rows).toBeGreaterThan(0);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`#/explorer\\?test=${id}$`));
  await expect(page.getByTestId('explorer-count')).toHaveText(new RegExp(`^${rows} picks?$`));
  const chip = page.getByTestId('active-filters').locator('[data-field="tests"]');
  await expect(chip).toHaveText(`${chipWord}: ${label}`);
  return rows;
}

test('a frozen test (CÓRNERS EQUIPO, the OR one) links to exactly its rows; the chip survives a reload and removes', async ({ page }) => {
  const { errors } = await openApp(page, '/tests?open=team_corners');
  const d = page.getByTestId('detail-team_corners');
  await expect(d).toBeVisible();
  await expect(d).not.toContainText('aproximación');
  const link = d.getByTestId('explorer-team_corners');
  await expect(link).toHaveText(/^Ver las? (\d+ )?filas? en el Explorador$/);
  const rows = await followLink(page, link, 'team_corners', 'CÓRNERS EQUIPO (pasó todos los filtros)');
  await page.reload();
  await expect(page.getByTestId('explorer-count')).toHaveText(new RegExp(`^${rows} picks?$`));
  await expect(page.getByTestId('active-filters').locator('[data-field="tests"]')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByTestId('active-filters').locator('[data-field="tests"]').click();
  await expect(page).toHaveURL(/#\/explorer$/);
  await expect(page.getByTestId('active-filters')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a price-first test and a stopped category link with the same count', async ({ page }) => {
  const { errors } = await openApp(page, '/tests?open=value');
  await followLink(page, page.getByTestId('explorer-value'), 'value', 'VALOR');

  await openApp(page, '/tests');
  await page.getByText('Categorías detenidas (7)').click();
  const item = page.getByTestId('stopped-ai_watch_cards');
  await item.locator('summary').click();
  await followLink(page, item.getByTestId('explorer-ai_watch_cards'), 'ai_watch_cards', 'IA-WATCH (tarjetas)');
  expect(errors).toEqual([]);
});

test('every frozen test link matches its count', async ({ page }) => {
  const { errors } = await openApp(page, '/tests');
  const ids = await page.getByTestId('frozen-list').locator('li.tests-row').evaluateAll((els) => els.map((e) => e.id.replace(/^test-/, '')));
  expect(ids.length).toBeGreaterThanOrEqual(8);
  for (const id of ids) {
    await page.goto(`/?feed=fixture#/tests?open=${id}`);
    const link = page.getByTestId(`explorer-${id}`);
    await expect(link).toBeVisible();
    const rows = Number(await link.getAttribute('data-rows'));
    await link.click();
    await expect(page.getByTestId('explorer-count')).toHaveText(new RegExp(`^${rows} picks?$`));
  }
  expect(errors).toEqual([]);
});

test('filter panel: the "Prueba" section, collapsed after Tag, lists the tests with counts and filters', async ({ page }) => {
  const { errors } = await openApp(page, '/explorer');
  await page.getByTestId('filter-button').click();
  const sheet = page.getByTestId('filter-sheet');
  const sections = await sheet.locator('.fp-section').evaluateAll((els) => els.map((e) => e.getAttribute('data-section')));
  expect(sections.indexOf('test')).toBe(sections.indexOf('tag') + 1);
  const sec = sheet.locator('[data-section="test"]');
  const toggle = sec.getByRole('button', { name: 'Prueba' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(sec.getByTestId('fp-tests')).toContainText('Pruebas congeladas');
  await expect(sec.getByTestId('fp-tests')).toContainText('Categorías detenidas');
  const chip = sec.getByTestId('fchip-tests-cards_under');
  const n = Number(await chip.locator('.fchip-count').textContent());
  expect(n).toBeGreaterThan(0);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/test=cards_under/);
  await expect(page.getByTestId('filter-live-count')).toContainText(String(n));
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('the test filter works in the Simulator and Analysis too', async ({ page }) => {
  const { errors } = await openApp(page, '/simulator?test=value');
  await expect(page.getByTestId('sim-profit')).toBeVisible();
  await expect(page.getByTestId('active-filters').locator('[data-field="tests"]').first()).toHaveText('Prueba: VALOR');
  await openApp(page, '/analysis?test=team_corners');
  await expect(page.getByTestId('analysis-bars')).toBeVisible();
  await expect(page.locator('[data-field="tests"]').first()).toHaveText('Prueba: CÓRNERS EQUIPO (pasó todos los filtros)');
  expect(errors).toEqual([]);
});

test('English: link text, chip and section', async ({ page }) => {
  const { errors } = await openApp(page, '/tests?open=team_corners', { locale: 'en' });
  const link = page.getByTestId('explorer-team_corners');
  await expect(link).toHaveText(/^See the (\d+ )?rows? in the Explorer$/);
  await followLink(page, link, 'team_corners', 'CÓRNERS EQUIPO (pasó todos los filtros)', 'Test');
  await page.getByTestId('filter-button').click();
  const sec = page.getByTestId('filter-sheet').locator('[data-section="test"]');
  await sec.getByRole('button', { name: 'Test' }).click();
  await expect(sec.getByTestId('fp-tests')).toContainText('Frozen tests');
  await expect(sec.getByTestId('fchip-tests-team_corners')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
