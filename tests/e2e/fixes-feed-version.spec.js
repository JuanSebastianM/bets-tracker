// Feed script version (fixes): the banner on the Overview and Settings when the sheet runs another
// version of apps-script/Feed.gs (or one from before the version existed), and the state in Settings.
// The fixture is stamped with the expected version, so ordinary runs never show the banner.
import { test, expect } from 'playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));
const EXPECTED = FIXTURE.meta.scriptVersion;

/** Serve the fixture with meta.scriptVersion set to `v` (undefined: the field is left out). */
async function serveVersion(page, v) {
  const f = JSON.parse(JSON.stringify(FIXTURE));
  if (v === undefined) delete f.meta.scriptVersion;
  else f.meta.scriptVersion = v;
  await page.route('**/tests/fixtures/feed.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(f) }));
}

test('matching version: no banner, Settings says up to date', async ({ page }) => {
  expect(EXPECTED).toMatch(/^[0-9a-f]{12}$/);
  const { errors } = await openApp(page, '/');
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  await expect(page.getByTestId('banner-script-version')).toHaveCount(0);
  await page.goto('/?feed=fixture#/settings');
  await expect(page.getByTestId('feed-script')).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('feed-script-deployed')).toHaveText(EXPECTED);
  await expect(page.getByTestId('feed-script-expected')).toHaveText(EXPECTED);
  await expect(page.getByTestId('feed-script-state')).toContainText('Al día');
  await expect(page.getByTestId('feed-script-todo')).toHaveCount(0);
  await expect(page.getByTestId('banner-script-version')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('different version: calm banner on Overview and Settings only, data still shows, dismissible', async ({ page }) => {
  await serveVersion(page, 'aaaaaaaaaaaa');
  const { errors } = await openApp(page, '/');
  const banner = page.getByTestId('banner-script-version');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('otra versión del script');
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  await expectNoHorizontalScroll(page);
  // Not on the other sections.
  await page.goto('/?feed=fixture#/explorer');
  await expect(page.getByTestId('explorer-count')).toBeVisible();
  await expect(banner).toHaveCount(0);
  // Settings: the banner and the state, with what to do.
  await page.goto('/?feed=fixture#/');
  await banner.getByTestId('banner-script-version-settings').click();
  await expect(page).toHaveURL(/#\/settings/);
  await expect(banner).toBeVisible();
  await expect(page.getByTestId('banner-script-version-settings')).toHaveCount(0);
  const box = page.getByTestId('feed-script');
  await expect(box).toHaveAttribute('data-state', 'different');
  await expect(page.getByTestId('feed-script-deployed')).toHaveText('aaaaaaaaaaaa');
  await expect(page.getByTestId('feed-script-expected')).toHaveText(EXPECTED);
  await expect(page.getByTestId('feed-script-state')).toContainText('La hoja está corriendo otra versión del script del feed');
  await expect(page.getByTestId('feed-script-todo')).toContainText('btFeedSelfTest');
  // One cache note under the version box (round 2: the two similar notes were merged).
  await expect(page.getByTestId('feed-cache-note')).toContainText('5 minutos');
  await expect(page.getByTestId('feed-script-docs')).toHaveAttribute('href', /#5-the-feed-script$/);
  await expectNoHorizontalScroll(page);
  // Dismiss: gone on Settings and on the Overview for the session, the state in Settings stays.
  await page.getByTestId('banner-script-version-dismiss').click();
  await expect(banner).toHaveCount(0);
  await expect(box).toHaveAttribute('data-state', 'different');
  await page.goto('/?feed=fixture#/');
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  await expect(banner).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('missing version (the script deployed before it existed): banner and "no version" in Settings', async ({ page }) => {
  await serveVersion(page, undefined);
  const { errors } = await openApp(page, '/settings');
  await expect(page.getByTestId('banner-script-version')).toBeVisible();
  await expect(page.getByTestId('feed-script')).toHaveAttribute('data-state', 'missing');
  await expect(page.getByTestId('feed-script-deployed')).toHaveText('sin versión (script anterior)');
  await expect(page.getByTestId('rows-shadow')).not.toHaveText('–');
  await page.goto('/?feed=fixture#/');
  await expect(page.getByTestId('banner-script-version')).toBeVisible();
  expect(errors).toEqual([]);
});

test('English: banner and Settings state', async ({ page }) => {
  await serveVersion(page, 'bbbbbbbbbbbb');
  const { errors } = await openApp(page, '/', { locale: 'en' });
  const banner = page.getByTestId('banner-script-version');
  await expect(banner).toContainText('The sheet runs another version of the feed script');
  await expect(banner.getByTestId('banner-script-version-settings')).toHaveText('Open Settings');
  await page.goto('/?feed=fixture#/settings');
  await expect(page.getByTestId('feed-script-state')).toContainText('The sheet is running a different version of the feed script');
  await expect(page.getByTestId('feed-cache-note')).toContainText('up to 5 minutes');
  await expect(page.getByTestId('feed-script-docs')).toHaveText('Steps in the README (section 5)');
  await page.getByTestId('banner-script-version-dismiss').click();
  await expect(banner).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('English, missing version: Settings says "no version"', async ({ page }) => {
  await serveVersion(page, undefined);
  await openApp(page, '/settings', { locale: 'en' });
  await expect(page.getByTestId('feed-script-deployed')).toHaveText('no version (older script)');
  await expect(page.getByTestId('banner-script-version')).toBeVisible();
});
