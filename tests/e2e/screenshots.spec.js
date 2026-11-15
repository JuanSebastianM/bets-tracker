// Review screenshots of every route: phone 390×844 and desktop 1280×800, light and dark.
//   SCREENSHOT_DIR=/tmp/shots npm run screenshots
import { test, expect } from 'playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openApp, ROUTES } from './helpers.js';

const DIR = process.env.SCREENSHOT_DIR || '/home/claude/review/foundation';
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false },
];

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    test.describe(`${vp.name} ${theme}`, () => {
      test.use({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.isMobile, colorScheme: theme });
      for (const r of ROUTES) {
        test(`${r.path}`, async ({ page }) => {
          await openApp(page, r.path, { settings: { theme } });
          await expect(page.getByTestId(r.ready)).toBeVisible();
          const slug = r.path === '/' ? 'overview' : r.path.slice(1).replace(/\//g, '-');
          await page.screenshot({ path: join(DIR, `${vp.name}-${theme}-${slug}.png`), fullPage: true });
        });
      }
    });
  }
}
