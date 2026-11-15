// The Tests section on the synthetic fixture: compact list of every test, accordion with deep link,
// review card, links, both languages, no horizontal scroll. The clock is fixed so the countdown is stable.
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T17:00:00Z'));
});

test('collapsed list in Spanish: strip, review, every test in one row, short page', async ({ page }) => {
  const { errors } = await openApp(page, '/tests');
  await expect(page.getByTestId('frozen-table')).toBeVisible();
  const strip = page.getByTestId('tests-overview');
  await expect(strip).toContainText('pruebas juntando filas');

  const review = page.getByTestId('next-review');
  await expect(review.getByTestId('review-state')).toHaveText('Todavía no');
  await expect(review.getByTestId('review-days')).toContainText('7 de 14 días');
  await expect(review.getByRole('progressbar', { name: 'Días desde la última' })).toHaveAttribute('aria-valuenow', '7');
  await expect(review.getByTestId('review-when')).toContainText('22 nov 2026');
  await expect(review.getByTestId('review-history')).toBeHidden();
  await review.getByText('Regla y revisiones anteriores').click();
  await expect(review.getByTestId('review-history').getByRole('link')).toHaveCount(3);

  await expect(page.locator('[data-testid^="frozen-"][data-state]')).toHaveCount(8);
  await expect(page.locator('[data-testid^="price-first-"][data-state]')).toHaveCount(4);
  await expect(page.getByTestId('graded-cards_under')).toContainText('16/100');
  await expect(page.getByTestId('close-cards_under')).toContainText('11/50');
  await expect(page.getByTestId('ev-cards_under')).toContainText('n 11');
  await expect(page.getByTestId('close-prop_value')).toContainText('/60');
  await expect(page.locator('.tests-panel')).toHaveCount(0);
  await expect(page.getByTestId('stopped-ai_watch_cards')).toBeHidden();
  await review.getByText('Regla y revisiones anteriores').click();

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThan(3500);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('accordion: one open at a time, in the URL, keyboard operable, kept on reload', async ({ page }) => {
  const { errors } = await openApp(page, '/tests?date=30d');
  const cr = page.getByTestId('frozen-corner_rejects');
  const btn = cr.getByRole('button', { name: /CÓRNERS RECHAZO/ });
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('detail-corner_rejects')).toBeVisible();
  await expect(cr.getByRole('region')).toContainText('No se decide nada hasta 100 calificadas');
  await expect(cr.getByRole('img')).toHaveAttribute('aria-label', /EV contra el cierre/);
  await expect(page).toHaveURL(/#\/tests\?date=30d&open=corner_rejects$/);

  const tc = page.getByTestId('frozen-team_corners').getByRole('button');
  await tc.focus();
  await page.keyboard.press('Enter');
  await expect(tc).toHaveAttribute('aria-expanded', 'true');
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.tests-panel')).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId('detail-team_corners')).toBeVisible();
  await page.getByTestId('frozen-team_corners').getByRole('button').press('Space');
  await expect(page.locator('.tests-panel')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/tests\?date=30d$/);

  await page.getByTestId('price-first-value').getByRole('button').click();
  await page.getByTestId('price-first').getByText('Por tramo de cuota y por casa').click();
  await expect(page.getByTestId('detail-value')).toContainText('id de Pinnacle');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('deep links: the strip opens the closest test; unknown ids are ignored', async ({ page }) => {
  const { errors } = await openApp(page, '/tests?open=nope&date=7d');
  await expect(page.getByTestId('frozen-table')).toBeVisible();
  await expect(page.locator('.tests-panel')).toHaveCount(0);
  await page.getByTestId('tests-overview').getByRole('link', { name: 'TARJETAS UNDER (modelo)' }).click();
  await expect(page.getByTestId('detail-cards_under')).toBeVisible();
  await expect(page.getByTestId('frozen-cards_under').getByRole('button')).toHaveAttribute('aria-expanded', 'true');

  await page.goto('/?feed=fixture#/tests?open=prop_value');
  await expect(page.getByTestId('detail-prop_value')).toContainText('60');
  await expect(page.getByTestId('detail-prop_value')).toBeInViewport();
  expect(errors).toEqual([]);
});

test('links: explorer filter, decisions, glossary, stopped categories', async ({ page }) => {
  const { errors } = await openApp(page, '/tests?open=corner_rejects');
  const d = page.getByTestId('detail-corner_rejects');
  await expect(d.getByRole('link', { name: 'Decisiones fila 106' })).toHaveAttribute('href', '#/decisions/106');
  await page.getByText('Cómo leer esta pantalla').click();
  await expect(page.getByRole('link', { name: 'EV contra el cierre' })).toHaveAttribute('href', '#/glossary/fair-close-ev');
  await expect(page.getByRole('link', { name: 'error estándar' })).toHaveAttribute('href', '#/glossary/standard-error');
  await expect(page.getByRole('link', { name: 'Decisiones fila 111' })).toHaveAttribute('href', '#/decisions/111');

  await page.getByText('Categorías detenidas (7)').click();
  const ai = page.getByTestId('stopped-ai_watch_cards');
  await expect(ai).toContainText('Parada el 2 nov 2026');
  await ai.locator('summary').click();
  await expect(ai.getByRole('link', { name: 'Decisiones fila 88' })).toHaveAttribute('href', '#/decisions/88');
  await expectNoHorizontalScroll(page);

  await d.getByTestId('explorer-corner_rejects').click();
  await expect(page).toHaveURL(/#\/explorer\?src=shadow&tag=corner_rejects&from=2026-11-09$/);
  await expect(page.getByTestId('explorer-count')).toBeVisible();

  await openApp(page, '/tests?open=value');
  await expect(page.getByTestId('glossary-value')).toHaveAttribute('href', '#/glossary/value');
  expect(errors).toEqual([]);
});

test('English', async ({ page }) => {
  const { errors } = await openApp(page, '/tests?open=near_value', { locale: 'en' });
  await expect(page.getByTestId('frozen-list')).toContainText('Frozen tests');
  await expect(page.getByTestId('tests-overview')).toContainText('tests collecting rows');
  await expect(page.getByTestId('review-state')).toHaveText('Not yet');
  await expect(page.getByTestId('frozen-cards_under').locator('.tests-state')).toHaveText('Collecting rows');
  await expect(page.getByTestId('price-first-near_value').locator('.tests-state')).toHaveText('Context');
  await expect(page.getByTestId('detail-near_value')).toContainText('No decision of its own');
  await expect(page.locator('.tests')).not.toContainText('Pruebas congeladas');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('wide screen: one line per test, expand works, no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { errors } = await openApp(page, '/tests');
  const row = page.getByTestId('frozen-rule30_pass_all').getByRole('button');
  const box = await row.boundingBox();
  expect(box.height).toBeLessThan(72);
  await row.click();
  await expect(page.getByTestId('detail-rule30_pass_all')).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
