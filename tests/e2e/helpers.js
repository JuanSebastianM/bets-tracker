// Shared e2e helpers. Every test runs on the synthetic fixture (tests/fixtures/feed.json).
import { expect } from 'playwright/test';

/** Every route of the app with something on the page to wait for. */
export const ROUTES = [
  { path: '/', title: 'Resumen', ready: 'source-shadow' },
  { path: '/explorer', title: 'Explorador', ready: 'explorer-count' },
  { path: '/simulator', title: 'Simulador', ready: 'sim-profit' },
  { path: '/tests', title: 'Tests', ready: 'frozen-table' },
  { path: '/more', title: 'Más', ready: 'more-settings' },
  { path: '/analysis', title: 'Análisis', ready: 'analysis-bars' },
  { path: '/decisions', title: 'Decisiones', ready: 'decisions-count' },
  { path: '/glossary', title: 'Glosario', ready: 'glossary-tags' },
  { path: '/settings', title: 'Ajustes', ready: 'settings-feed' },
  { path: '/decisions/14', title: 'Decisión', ready: 'decision-related' },
  { path: '/glossary/rule-29', title: 'Glosario', ready: 'glossary-term' },
  { path: '/glossary/near-value', title: 'Glosario', ready: 'glossary-term' },
];

/**
 * Open the app on the fixture feed at a hash path. Collects console errors in `errors`.
 * @param {import('playwright/test').Page} page
 * @param {string} path e.g. '/explorer?src=shadow'
 * @param {{ fixture?: boolean, settings?: object, locale?: 'es' | 'en' }} [opts]
 */
export async function openApp(page, path = '/', opts = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  if (opts.settings || opts.locale) {
    await page.addInitScript(
      ([settings, locale]) => {
        if (settings) localStorage.setItem('bt.settings', JSON.stringify(settings));
        if (locale) localStorage.setItem('bt.locale', JSON.stringify(locale));
      },
      [opts.settings || null, opts.locale || null],
    );
  }
  const search = opts.fixture === false ? '' : '?feed=fixture';
  await page.goto(`/${search}#${path}`);
  return { errors };
}

/** The page has no horizontal scroll. @param {import('playwright/test').Page} page */
export async function expectNoHorizontalScroll(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}
