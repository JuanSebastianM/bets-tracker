// Foundation smoke tests: boot on the fixture, every route, language and theme, settings, offline
// copy, unconfigured feed, schema guard, explorer chips and the detail sheet.
import { test, expect } from 'playwright/test';
import { openApp, ROUTES, expectNoHorizontalScroll } from './helpers.js';

test('boots on the fixture and shows the three sources', async ({ page }) => {
  const { errors } = await openApp(page, '/');
  for (const s of ['bets', 'shadow', 'grok']) await expect(page.getByTestId(`source-${s}`)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Resumen');
  await expect(page.getByTestId('banner-fixture')).toBeVisible();
  await expect(page.getByTestId('banner-missing')).toContainText('Cuota mín. Grok');
  await expect(page.getByTestId('sync-stamp')).toContainText('Hoja leída');
  expect(errors).toEqual([]);
});

for (const r of ROUTES) {
  test(`route ${r.path} renders without horizontal scroll`, async ({ page }) => {
    const { errors } = await openApp(page, r.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.title);
    await expect(page.getByTestId(r.ready)).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}

test('bottom bar navigates and marks the current tab', async ({ page }) => {
  await openApp(page, '/');
  await page.locator('[data-tab="explorer"]').click();
  await expect(page).toHaveURL(/#\/explorer/);
  await expect(page.locator('[data-tab="explorer"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-tab="more"]').click();
  await page.getByTestId('more-glossary').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glosario');
  await expect(page.locator('[data-tab="more"]')).toHaveAttribute('aria-current', 'page');
});

test('glossary deep link keeps the term', async ({ page }) => {
  await openApp(page, '/glossary/near-value');
  await expect(page.getByTestId('glossary-term')).toContainText('near-value');
});

test('language switch to English applies everywhere and persists', async ({ page }) => {
  await openApp(page, '/settings');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await page.locator('[data-tab="overview"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview');
  await expect(page.getByTestId('source-shadow')).toContainText('Shadow');
});

test('theme switch applies and persists', async ({ page }) => {
  await openApp(page, '/settings');
  await page.getByRole('radio', { name: 'Oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg);
  await page.getByRole('radio', { name: 'Claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('bankroll and unit stay on the device and persist', async ({ page }) => {
  await openApp(page, '/settings');
  await expect(page.getByTestId('bankroll-units')).toContainText('unidades');
  await page.getByTestId('input-bankroll').fill('500');
  await page.getByTestId('input-unit').fill('5');
  await expect(page.getByTestId('bankroll-units')).toContainText('100.00u');
  await page.reload();
  await expect(page.getByTestId('input-bankroll')).toHaveValue('500');
  await expect(page.getByTestId('bankroll-units')).toContainText('100.00u');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bt.settings') || '{}'));
  expect(stored.bankroll).toBe(500);
  await page.getByRole('button', { name: 'Borrar bank y unidad' }).click();
  await expect(page.getByTestId('input-bankroll')).toHaveValue('');
});

test('settings show the feed status', async ({ page }) => {
  await openApp(page, '/settings');
  await expect(page.getByTestId('feed-source')).toHaveText('Datos de ejemplo');
  await expect(page.getByTestId('rows-shadow')).not.toHaveText('–');
  await expect(page.getByTestId('feed-redactions')).toHaveText('0');
  await expect(page.getByTestId('feed-missing')).toContainText('Grok!Cuota mín. Grok');
  await expect(page.getByTestId('app-version')).toHaveText('dev');
});

test('offline: the saved copy is shown with a banner', async ({ page }) => {
  await openApp(page, '/');
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  // wait until the copy is in IndexedDB
  await expect.poll(() => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('bets-tracker');
    r.onsuccess = () => {
      const g = r.result.transaction('feed').objectStore('feed').get('fixture');
      g.onsuccess = () => res(!!g.result);
      g.onerror = () => res(false);
    };
    r.onerror = () => res(false);
  }))).toBe(true);
  await page.route('**/tests/fixtures/feed.json', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  await expect(page.getByTestId('banner-stale')).toContainText('Sin conexión');
});

test('without a configured feed the app says so and offers the example data', async ({ page }) => {
  await openApp(page, '/', { fixture: false });
  await expect(page.getByTestId('feed-unconfigured')).toBeVisible();
  await page.getByRole('link', { name: 'Ver con datos de ejemplo' }).click();
  await expect(page.getByTestId('source-shadow')).toBeVisible();
});

test('a newer feed schema is refused with a clear message', async ({ page }) => {
  await page.route('**/tests/fixtures/feed.json', (route) => route.fulfill({ json: { schema: 99, tabs: {} } }));
  await openApp(page, '/');
  await expect(page.getByTestId('feed-error')).toContainText('formato más nuevo');
});

test('explorer: source chips filter through the URL and the detail sheet opens and closes', async ({ page }) => {
  await openApp(page, '/explorer');
  const count = page.getByTestId('explorer-count');
  const all = await count.textContent();
  await page.getByTestId('chip-source-grok').click();
  await expect(page).toHaveURL(/src=grok/);
  await expect(count).not.toHaveText(all || '');
  await page.locator('.pick-card').first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Grok');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/#\/explorer\?src=grok/);
});

test('chart text alternative: the table toggle shows the data', async ({ page }) => {
  await openApp(page, '/simulator');
  await page.getByRole('button', { name: 'Ver como tabla' }).click();
  await expect(page.getByTestId('sim-chart').locator('table')).toBeVisible();
});
