// Review screenshots of the line filter (run by `npm run screenshots`, never by `npm run check`):
// the "Línea" section in the phone sheet and the desktop side column, the Simulator "por línea"
// breakdown and the Overview per-line rows; phone and desktop, light and dark.
import { test, expect } from 'playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openApp } from './helpers.js';

const DIR = process.env.SCREENSHOT_DIR || '/home/claude/review/lines';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false },
];

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    test.describe(`lines ${vp.name} ${theme}`, () => {
      test.use({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.isMobile, colorScheme: theme });
      const shot = (/** @type {string} */ name) => join(DIR, `${vp.name}-${theme}-lines-${name}.png`);

      test('explorer panel, all lines', async ({ page }) => {
        await openApp(page, '/explorer?src=shadow', { settings: { theme } });
        if (vp.isMobile) await page.getByTestId('filter-button').click();
        const lines = page.getByTestId('fp-lines');
        await expect(lines).toBeVisible();
        await lines.scrollIntoViewIfNeeded();
        await page.screenshot({ path: shot('panel'), fullPage: !vp.isMobile });
        if (vp.isMobile) await lines.screenshot({ path: shot('panel-section') });
      });

      test('explorer, TARJETAS UNDER + Under 4.5', async ({ page }) => {
        await openApp(page, '/explorer?tag=cards_under&line=cards%3Aunder%3A4.5', { settings: { theme } });
        await expect(page.getByTestId('explorer-count')).toBeVisible();
        if (vp.isMobile) {
          await page.screenshot({ path: shot('explorer'), fullPage: false });
          await page.getByTestId('filter-button').click();
          await page.getByTestId('fp-lines').scrollIntoViewIfNeeded();
          await page.screenshot({ path: shot('panel-cards') });
        } else await page.screenshot({ path: shot('explorer'), fullPage: false });
      });

      test('simulator by line', async ({ page }) => {
        await openApp(page, '/simulator?src=shadow', { settings: { theme } });
        await page.getByTestId('sim-breakdown').getByText('Desglose').click();
        await page.getByTestId('sim-breakdown').getByRole('radio', { name: 'Línea' }).click();
        const block = page.getByTestId('sim-breakdown');
        await block.scrollIntoViewIfNeeded();
        await block.screenshot({ path: shot('simulator') });
      });

      test('overview per-line rows', async ({ page }) => {
        await openApp(page, '/', { settings: { theme } });
        const lines = page.getByTestId('tag-lines-cards_under');
        await lines.getByText('Por línea').click();
        await page.getByTestId('overview-tags').screenshot({ path: shot('overview') });
      });
    });
  }
}
