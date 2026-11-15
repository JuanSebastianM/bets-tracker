// The Tests section on the synthetic fixture: strip, review, frozen and price-first cards, links,
// both languages, no horizontal scroll. The clock is fixed so the review countdown is stable.
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T17:00:00Z'));
});

test('tests screen in Spanish: strip, review countdown, every frozen test, no horizontal scroll', async ({ page }) => {
  const { errors } = await openApp(page, '/tests');
  await expect(page.getByTestId('frozen-table')).toBeVisible();
  const strip = page.getByTestId('tests-overview');
  await expect(strip).toContainText('8');
  await expect(strip).toContainText('pruebas juntando filas');
  await expect(strip.getByRole('link', { name: 'TARJETAS UNDER (modelo)' })).toHaveAttribute('href', '#test-cards_under');

  const review = page.getByTestId('next-review');
  await expect(review.getByTestId('review-state')).toHaveText('Todavía no');
  await expect(review.getByTestId('review-days')).toContainText('7 de 14 días');
  await expect(review.getByRole('progressbar', { name: 'Días desde la última' })).toHaveAttribute('aria-valuenow', '7');
  await expect(review.getByTestId('review-when')).toContainText('22 nov 2026');
  await expect(review.getByTestId('review-history').getByRole('link')).toHaveCount(3);

  await expect(page.locator('[data-testid^="frozen-"][data-state]')).toHaveCount(8);
  const cr = page.getByTestId('frozen-corner_rejects');
  await expect(cr.getByRole('heading', { name: 'CÓRNERS RECHAZO ≤2.0' })).toBeVisible();
  await expect(cr.getByTestId('graded-corner_rejects')).toContainText('de 100');
  await expect(cr.getByTestId('rule-corner_rejects')).toContainText('No se decide nada hasta 100 calificadas');
  await expect(cr.getByRole('img')).toHaveAttribute('aria-label', /EV contra el cierre/);
  await expect(cr.getByTestId('projection-corner_rejects')).toContainText('Estimado');

  await expect(page.getByTestId('price-first-value')).toContainText('id de Pinnacle');
  await expect(page.getByTestId('price-first-prop_value')).toContainText('60');
  await expect(page.getByTestId('stopped-ai_watch_cards')).toContainText('Parada el 2 nov 2026');

  await page.getByText('Cómo leer esta pantalla').click();
  for (const s of await page.locator('.tests details summary').all()) {
    if (!(await s.evaluate((el) => el.parentElement.open))) await s.click();
  }
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('tests screen links: explorer filter, decisions, glossary, review history', async ({ page }) => {
  const { errors } = await openApp(page, '/tests');
  await expect(page.getByTestId('frozen-table')).toBeVisible();
  const cr = page.getByTestId('frozen-corner_rejects');
  await expect(cr.getByRole('link', { name: 'Decisiones fila 106' })).toHaveAttribute('href', '#/decisions/106');
  await expect(page.getByRole('link', { name: 'Decisiones fila 111' })).toHaveAttribute('href', '#/decisions/111');
  await expect(page.getByTestId('review-history').getByRole('link').first()).toHaveAttribute('href', '#/decisions/10');
  await expect(page.getByTestId('price-first-value').getByRole('link', { name: 'VALOR' })).toHaveAttribute('href', '#/glossary/value');
  await page.getByText('Cómo leer esta pantalla').click();
  await expect(page.getByRole('link', { name: 'EV contra el cierre' })).toHaveAttribute('href', '#/glossary/fair-close-ev');
  await expect(page.getByRole('link', { name: 'error estándar' })).toHaveAttribute('href', '#/glossary/standard-error');

  await cr.getByTestId('explorer-corner_rejects').click();
  await expect(page).toHaveURL(/#\/explorer\?src=shadow&tag=corner_rejects&from=2026-11-09$/);
  await expect(page.getByTestId('explorer-count')).toBeVisible();
  expect(errors).toEqual([]);
});

test('tests screen in English', async ({ page }) => {
  const { errors } = await openApp(page, '/tests', { locale: 'en' });
  await expect(page.getByRole('heading', { name: 'Frozen tests' })).toBeVisible();
  await expect(page.getByTestId('tests-overview')).toContainText('tests collecting rows');
  await expect(page.getByTestId('review-state')).toHaveText('Not yet');
  await expect(page.getByTestId('frozen-cards_under').locator('.tests-state')).toHaveText('Collecting rows');
  await expect(page.getByRole('heading', { name: 'Price-first tests' })).toBeVisible();
  await expect(page.getByTestId('price-first-near_value').locator('.tests-state')).toHaveText('Context');
  await expect(page.getByRole('link', { name: 'Decisions row 111' })).toBeVisible();
  await expect(page.locator('.tests')).not.toContainText('Pruebas congeladas');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('tests screen on a wide screen keeps the cards in two columns without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { errors } = await openApp(page, '/tests');
  await expect(page.getByTestId('frozen-table')).toBeVisible();
  const a = await page.getByTestId('frozen-rule30_pass_all').boundingBox();
  const b = await page.getByTestId('frozen-cards_under').boundingBox();
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
