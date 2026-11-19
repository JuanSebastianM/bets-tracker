// Review screenshots of the fixes pass (run by `npm run screenshots`): the "different feed script"
// banner on the Overview and Settings, a Tests card with its exact link, the Explorer on `test=`, and the
// "Prueba" section of the filter panel. Phone and desktop, light and dark.
import { test, expect } from 'playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openApp } from './helpers.js';

const DIR = process.env.SCREENSHOT_DIR || '/home/claude/review/fixes';
mkdirSync(DIR, { recursive: true });
const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));

const VIEWPORTS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false },
];

async function oldScript(page) {
  const f = JSON.parse(JSON.stringify(FIXTURE));
  delete f.meta.scriptVersion;
  await page.route('**/tests/fixtures/feed.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(f) }));
}

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    test.describe(`fixes ${vp.name} ${theme}`, () => {
      test.use({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.isMobile, colorScheme: theme });
      const shot = (/** @type {string} */ name) => join(DIR, `${vp.name}-${theme}-fixes-${name}.png`);

      test('overview with the script banner', async ({ page }) => {
        await oldScript(page);
        await openApp(page, '/', { settings: { theme } });
        await expect(page.getByTestId('banner-script-version')).toBeVisible();
        await page.screenshot({ path: shot('overview-banner'), fullPage: false });
      });

      test('settings with a different script', async ({ page }) => {
        await oldScript(page);
        await openApp(page, '/settings', { settings: { theme } });
        await expect(page.getByTestId('feed-script')).toBeVisible();
        await page.getByTestId('feed-script').scrollIntoViewIfNeeded();
        await page.screenshot({ path: shot('settings-script-different'), fullPage: true });
      });

      test('settings up to date', async ({ page }) => {
        await openApp(page, '/settings', { settings: { theme } });
        await page.getByTestId('feed-script').scrollIntoViewIfNeeded();
        await page.getByTestId('feed-script').screenshot({ path: shot('settings-script-current') });
      });

      test('tests card and the explorer on its link', async ({ page }) => {
        await openApp(page, '/tests?open=team_corners', { settings: { theme } });
        const d = page.getByTestId('detail-team_corners');
        await expect(d).toBeVisible();
        await d.screenshot({ path: shot('tests-card') });
        await d.getByTestId('explorer-team_corners').click();
        await expect(page.getByTestId('explorer-count')).toBeVisible();
        await page.screenshot({ path: shot('explorer-test'), fullPage: false });
      });

      test('filter panel, Prueba section open', async ({ page }) => {
        await openApp(page, '/explorer?test=team_corners', { settings: { theme } });
        await expect(page.getByTestId('explorer-count')).toBeVisible();
        if (vp.isMobile) await page.getByTestId('filter-button').click();
        const sec = page.locator('[data-section="test"]').first();
        await sec.locator('.fp-toggle').click();
        await expect(sec.getByTestId('fp-tests')).toBeVisible();
        await sec.scrollIntoViewIfNeeded();
        await page.screenshot({ path: shot('panel-tests'), fullPage: false });
      });
    });
  }
}
