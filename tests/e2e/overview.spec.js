// Overview (#/): period switch in the URL, tag table links, last-visit behaviour, languages, layout.
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

// The fixture's last slate is 2026-11-15 (all pending); fix "today" to that day in Bogotá.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T17:00:00Z'));
});

const storedSettings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('bt.settings') || '{}'));

test('the period switch lives in the URL and survives a reload', async ({ page }) => {
  const { errors } = await openApp(page, '/');
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  const allUnits = await page.getByTestId('units-shadow').textContent();
  await expect(page.getByRole('radio', { name: 'Todo' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('radio', { name: '7 días' }).click();
  await expect(page).toHaveURL(/#\/\?date=7d$/);
  await expect(page.getByTestId('period-note')).toHaveText('Del 9 nov al 15 nov');
  await expect(page.getByTestId('units-shadow')).not.toHaveText(allUnits || '');

  await page.reload();
  await expect(page.getByRole('radio', { name: '7 días' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('overview-links').getByRole('link', { name: 'Simular' })).toHaveAttribute('href', '#/simulator?date=7d');
  await expect(page.getByTestId('overview-links').getByRole('link', { name: 'Tests' })).toHaveAttribute('href', '#/tests?date=7d');

  await page.getByRole('radio', { name: 'Última jornada' }).click();
  await expect(page).toHaveURL(/date=last_slate/);
  await expect(page.getByTestId('period-note')).toHaveText('Jornada del 14 nov 2026');
  await expect(page.getByTestId('overview-links').getByRole('link', { name: 'Ver todos los picks' })).toHaveAttribute('href', '#/explorer?slate=2026-11-14');

  await page.getByRole('radio', { name: 'Todo' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('units-shadow')).toHaveText(allUnits || '');
  expect(errors).toEqual([]);
});

test('a tag row opens the Explorer filtered by that tag and the period', async ({ page }) => {
  const { errors } = await openApp(page, '/?date=30d');
  const table = page.getByTestId('tag-table');
  await expect(table).toBeVisible();
  const first = table.locator('a.ov-grow').first();
  const key = await first.getAttribute('data-key');
  expect(await first.getAttribute('href')).toBe(`#/explorer?src=shadow&tag=${key}&date=30d`);
  await first.click();
  await expect(page).toHaveURL(new RegExp(`#/explorer\\?src=shadow&tag=${key}&date=30d`));
  await expect(page.getByTestId('explorer-count')).toBeVisible();

  await page.goBack();
  const market = page.getByTestId('market-table').locator('a.ov-grow').first();
  await expect(market).toHaveAttribute('href', /^#\/explorer\?src=shadow&mkt=[a-z_]+&date=30d$/);
  expect(errors).toEqual([]);
});

test('every graded Sombra tag has a row with n, a verdict and an accessible name', async ({ page }) => {
  await openApp(page, '/');
  const rows = page.getByTestId('tag-table').locator('a.ov-grow');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(5);
  await expect(rows.first()).toHaveAttribute('aria-label', /: (muy pronto|sin cierres|por encima del cierre|por debajo del cierre|tirando a favor|tirando en contra)\./);
  await expect(page.getByTestId('tag-table')).not.toContainText('PUBLICADA Y APOSTADA');
});

test('today and pending are grouped by slate with a link to the Explorer', async ({ page }) => {
  await openApp(page, '/');
  const group = page.getByTestId('overview-pending').locator('[data-date="2026-11-15"]');
  await expect(group).toContainText('Hoy');
  await expect(group.getByRole('link')).toHaveAttribute('href', '#/explorer?st=pending&slate=2026-11-15');
  await expect(page.getByTestId('brief-pending')).toContainText('pendientes para hoy');
});

test('first visit shows nothing special, then the visit is recorded once seen', async ({ page }) => {
  const { errors } = await openApp(page, '/');
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  await expect(page.getByTestId('overview-since')).toHaveCount(0);
  await expect.poll(async () => (await storedSettings(page)).lastVisit || null).not.toBeNull();
  const snap = await page.evaluate(() => JSON.parse(localStorage.getItem('bt.overview.visit') || 'null'));
  expect(snap.at).toBe((await storedSettings(page)).lastVisit);
  expect(snap.pending.length).toBeGreaterThan(0);
  // Nothing was graded in between: the next visit has nothing to report.
  await page.reload();
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  await expect(page.getByTestId('overview-since')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a previous visit lists what was graded since, then moves lastVisit forward', async ({ page }) => {
  const lastVisit = '2026-11-13T15:00:00.000Z';
  await openApp(page, '/', { settings: { lastVisit } });
  const card = page.getByTestId('overview-since');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Desde tu última visita');
  await expect(page.getByTestId('since-summary')).toContainText('se calificaron');
  await expect(card.locator('[data-source="shadow"]')).toBeVisible();
  await expect.poll(async () => (await storedSettings(page)).lastVisit).not.toBe(lastVisit);
  // The card keeps the previous visit while the screen is open.
  await expect(card).toBeVisible();
});

test('English: titles, summaries and verdicts', async ({ page }) => {
  const { errors } = await openApp(page, '/', { locale: 'en' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview');
  await expect(page.getByTestId('overview-brief')).toContainText('In short');
  await expect(page.getByTestId('brief-last-slate')).toContainText('Last graded slate (Nov 14)');
  await expect(page.getByTestId('summary-shadow')).toContainText('at an average price of');
  await expect(page.getByTestId('overview-tags')).toContainText('Shadow by tag');
  await expect(page.getByRole('radio', { name: 'Last slate' })).toBeVisible();
  await expect(page.getByTestId('overview-real')).toContainText('Real bets');
  expect(errors).toEqual([]);
});

test('Spanish summaries are built from the figures', async ({ page }) => {
  await openApp(page, '/');
  await expect(page.getByTestId('brief-last-slate')).toContainText('Última jornada calificada (14 nov)');
  await expect(page.getByTestId('summary-shadow')).toContainText('a cuota media');
  await expect(page.getByTestId('real-summary')).toContainText('Las apuestas reales van');
});

test('the bankroll percentage appears only with a bankroll set', async ({ page }) => {
  await openApp(page, '/', { settings: { bankroll: 500, unitValue: 5 } });
  await expect(page.getByTestId('real-current-dd')).toContainText('de tu bank');
});

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
]) {
  test(`no horizontal scroll on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const { errors } = await openApp(page, '/?date=30d');
    await expect(page.getByTestId('tag-table')).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}
