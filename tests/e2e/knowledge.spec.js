// Decisions and Glossary (feat/knowledge): search, category and status filters, deep links, cross-links
// between decisions and rules, both languages, no horizontal scroll. Fixture feed only.
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

test('glossary: search as you type ignores accents and case', async ({ page }) => {
  const { errors } = await openApp(page, '/glossary');
  await expect(page.getByTestId('glossary-tags')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar en el glosario' }).fill('CORNERS');
  await expect(page.locator('.gl-item').first()).toHaveAttribute('data-slug', 'corners');
  await expect(page).toHaveURL(/q=CORNERS/);
  await page.getByRole('searchbox', { name: 'Buscar en el glosario' }).fill('zzzz');
  await expect(page.getByText('Nada coincide')).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('glossary: category chip filters and survives a reload', async ({ page }) => {
  await openApp(page, '/glossary');
  await page.getByTestId('glossary-cat-tags').click();
  await expect(page.getByTestId('glossary-cat-tags')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/cat=tags/);
  await expect(page.locator('.gl-item[data-slug="near-value"]')).toBeVisible();
  await expect(page.locator('.gl-item[data-slug="kelly"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.gl-item[data-slug="kelly"]')).toHaveCount(0);
  await expect(page.locator('.gl-item[data-slug="value"]')).toBeVisible();
});

test('glossary: an entry deep link shows the entry, its tag count and related links', async ({ page }) => {
  const { errors } = await openApp(page, '/glossary/near-value');
  const entry = page.getByTestId('glossary-term');
  await expect(entry).toHaveAttribute('data-slug', 'near-value');
  await expect(entry.getByRole('heading', { level: 2 })).toHaveText('VALOR CASI');
  await expect(entry).toContainText('En esta hoja');
  await expect(entry).toContainText('con la etiqueta VALOR CASI');
  await entry.getByRole('link', { name: 'VALOR', exact: true }).click();
  await expect(page).toHaveURL(/#\/glossary\/value$/);
  await expect(page.getByTestId('glossary-term').getByRole('heading', { level: 2 })).toHaveText('VALOR');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('glossary: the rules tab lists every rule in order and filters by state', async ({ page }) => {
  await openApp(page, '/glossary?tab=rules');
  const rules = page.getByTestId('glossary-rules').locator('.gl-rule');
  await expect(rules).toHaveCount(36);
  await expect(rules.first()).toHaveAttribute('data-rule', '1');
  await page.getByTestId('glossary-state-paused').click();
  await expect(page).toHaveURL(/state=paused/);
  await expect(rules).toHaveCount(1);
  await expect(rules.first()).toHaveAttribute('data-rule', '30');
  await rules.first().click();
  await expect(page).toHaveURL(/#\/glossary\/rule-30$/);
  await expect(page.getByTestId('glossary-term')).toContainText('Córners y tarjetas: encogidos y en pausa');
  await expectNoHorizontalScroll(page);
});

test('glossary: a rule links to the decisions that back it', async ({ page }) => {
  const { errors } = await openApp(page, '/glossary/rule-25');
  const backed = page.getByTestId('glossary-rule-decisions');
  await expect(backed.getByRole('link', { name: 'Decisiones fila 7' })).toBeVisible();
  await backed.getByRole('link', { name: 'Decisiones fila 7' }).click();
  await expect(page).toHaveURL(/#\/decisions\/7$/);
  await expect(page.getByTestId('decision-detail')).toHaveAttribute('data-row', '7');
  expect(errors).toEqual([]);
});

test('decisions: timeline newest first, search highlights and opens matching evidence', async ({ page }) => {
  const { errors } = await openApp(page, '/decisions');
  await expect(page.getByTestId('decisions-count')).toContainText('14 decisiones registradas');
  const cards = page.getByTestId('decisions-timeline').locator('.dcard');
  await expect(cards.first()).toHaveAttribute('data-row', '14');
  await expect(cards.last()).toHaveAttribute('data-row', '15');
  await page.getByRole('searchbox', { name: 'Buscar en las decisiones' }).fill('larga para el fixture');
  await expect(page.getByTestId('decisions-results')).toContainText('1 decisión');
  await expect(page.getByTestId('decision-evidence-14')).toHaveAttribute('open', '');
  await expect(page.locator('mark.hl').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('decisions: status filter, in-force view and URL state', async ({ page }) => {
  await openApp(page, '/decisions?st=open');
  await expect(page.getByTestId('decisions-results')).toContainText('2 decisiones');
  await expect(page.getByTestId('decisions-status-open')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('decisions-status-replaced').click();
  await expect(page).toHaveURL(/st=open%2Creplaced|st=open,replaced/);
  await expect(page.getByTestId('decisions-results')).toContainText('3 decisiones');
  await page.goto('/?feed=fixture#/decisions?view=now');
  const now = page.getByTestId('decisions-now');
  await expect(now).toBeVisible();
  await expect(now.locator('.dchip-replaced')).toHaveCount(0);
  await expect(now.locator('.dchip-open')).toHaveCount(0);
  await expect(page.getByTestId('decisions-results')).toContainText('11 decisiones en vigor');
});

test('decisions: a deep link shows one decision with its cross-links and related rows', async ({ page }) => {
  const { errors } = await openApp(page, '/decisions/14');
  const detail = page.getByTestId('decision-detail');
  await expect(detail).toHaveAttribute('data-row', '14');
  // "fila 7", "filas 4-5", "Decisiones row 11" link; "Sombra fila 12" and "fila 17 de Apuestas" stay text.
  await expect(detail.locator('a.ref-decision')).toHaveText(['fila 7', 'filas 4', '5', 'Decisiones row 11', 'fila 10']);
  await expect(detail.locator('a.ref-rule')).toHaveText(['regla 28', 'reglas 29', '30']);
  await expect(page.getByTestId('decision-cites').locator('a')).toHaveCount(5);
  await detail.getByRole('link', { name: 'regla 28' }).first().click();
  await expect(page).toHaveURL(/#\/glossary\/rule-28$/);
  await page.goBack();
  await expect(page.getByTestId('decision-detail')).toHaveAttribute('data-row', '14');
  await page.goto('/?feed=fixture#/decisions/7');
  await expect(page.getByTestId('decision-cited-by').locator('a')).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('decisions: unknown row and the staking rules block', async ({ page }) => {
  await openApp(page, '/decisions/999');
  await expect(page.getByText('No hay ninguna decisión en la fila 999')).toBeVisible();
  await page.goto('/?feed=fixture#/decisions');
  const staking = page.getByTestId('decisions-staking');
  await expect(staking.locator('li')).toHaveCount(8);
  await staking.locator('li').nth(6).getByRole('link', { name: 'Qué significa' }).click();
  await expect(page).toHaveURL(/#\/glossary\/kelly$/);
});

test('both sections in English', async ({ page }) => {
  const { errors } = await openApp(page, '/glossary?tab=rules', { locale: 'en' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glossary');
  await expect(page.getByTestId('glossary-rules')).toContainText('Market first for results and goals');
  await page.goto('/?feed=fixture#/glossary/fair-close-ev');
  await expect(page.getByTestId('glossary-term')).toContainText('In this sheet');
  await page.goto('/?feed=fixture#/decisions');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Decisions');
  await expect(page.getByTestId('decisions-count')).toContainText('14 decisions logged');
  await page.goto('/?feed=fixture#/decisions/14');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Decision');
  await expect(page.getByTestId('decision-related')).toContainText('Cited by');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('wide screen: no horizontal scroll on the long pages', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [path, ready] of [['/decisions', 'decisions-timeline'], ['/decisions/14', 'decision-related'], ['/glossary', 'glossary-tags'], ['/glossary/rule-34', 'glossary-term']]) {
    await openApp(page, path);
    await expect(page.getByTestId(ready)).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
