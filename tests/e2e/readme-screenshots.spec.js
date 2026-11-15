// The README screenshots (docs/screenshots/): first screen of four routes on a 390 px phone, both
// themes, on the synthetic fixture only. Runs only when asked:
//   README_SHOTS=1 npm run screenshots:readme
import { test, expect } from 'playwright/test';
import { join, resolve } from 'node:path';
import { openApp } from './helpers.js';

const DIR = resolve(import.meta.dirname, '../../docs/screenshots');
const SHOTS = [
  { name: 'phone-light-overview', theme: 'light', path: '/', ready: 'source-shadow' },
  { name: 'phone-dark-explorer', theme: 'dark', path: '/explorer?src=shadow&tag=cards_under&line=cards%3Aunder%3A4.5', ready: 'explorer-count' },
  { name: 'phone-light-simulator', theme: 'light', path: '/simulator?src=shadow&tag=value&price=le200', ready: 'sim-profit' },
  { name: 'phone-dark-tests', theme: 'dark', path: '/tests', ready: 'frozen-table' },
];

test.skip(!process.env.README_SHOTS, 'README screenshots run only with README_SHOTS=1');
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

for (const s of SHOTS) {
  test(s.name, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-15T20:00:00-05:00'));
    await page.emulateMedia({ colorScheme: s.theme });
    await openApp(page, s.path, { settings: { theme: s.theme } });
    await expect(page.getByTestId(s.ready)).toBeVisible();
    await page.waitForTimeout(300); // let charts measure their box
    await page.screenshot({ path: join(DIR, `${s.name}.png`) });
  });
}
