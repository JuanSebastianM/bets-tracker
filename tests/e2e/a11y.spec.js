// Accessibility as a screen-reader, keyboard or low-vision user meets the app (docs/ACCESSIBILITY.md):
// the hand-written audit (tests/e2e/a11y-audit.js) on every route and open state, phone and desktop,
// Spanish and English, light and dark; keyboard-only flows; reflow at 320 px and at 200% text;
// reduced motion. All on the synthetic fixture.
import { test, expect } from 'playwright/test';
import { ROUTES, openApp, expectNoHorizontalScroll } from './helpers.js';
import { auditPage, focused, focusVisible, axNodes } from './a11y-audit.js';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

/** @param {Array<{ rule: string, where: string, detail: string }>} issues */
const report = (issues) => issues.map((i) => `${i.rule}: ${i.where} — ${i.detail}`);

/**
 * Open the app with a full page load (a second openApp on the same page is only a hash change, which
 * keeps the old locale, theme and state).
 * @param {import('playwright/test').Page} page @param {string} path @param {Parameters<typeof openApp>[2]} [opts]
 */
async function fresh(page, path, opts) {
  await page.goto('about:blank');
  return openApp(page, path, opts);
}

// ---------------------------------------------------------------- every route

for (const view of [{ name: 'phone', size: PHONE, phone: true }, { name: 'desktop', size: DESKTOP, phone: false }]) {
  for (const locale of /** @type {const} */ (['es', 'en'])) {
    for (const theme of ['light', 'dark']) {
      test(`audit: every route, ${view.name}, ${locale}, ${theme}`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize(view.size);
        const found = [];
        for (const r of ROUTES) {
          const { errors } = await openApp(page, r.path, { locale, settings: { theme } });
          await expect(page.getByTestId(r.ready).first()).toBeVisible();
          // Contrast in both themes; the rest does not depend on the theme, so only in light.
          const { issues } = await auditPage(page, { locale, phone: view.phone, targetSize: theme === 'light' });
          found.push(...report(issues).map((s) => `${r.path} ${s}`));
          expect(errors, r.path).toEqual([]);
        }
        expect(found).toEqual([]);
      });
    }
  }
}

// ---------------------------------------------------------------- open states

/**
 * States that only exist after an action: each one opens its state and the audit runs on it.
 * @type {Array<{ name: string, path: string, phoneOnly?: boolean, open?: (page: import('playwright/test').Page) => Promise<void> }>}
 */
const STATES = [
  {
    name: 'filter sheet with every section open and saved filters',
    path: '/explorer?tag=near_value',
    phoneOnly: true,
    open: async (page) => {
      await page.getByTestId('filter-button').click();
      const sheet = page.getByTestId('filter-sheet');
      await expect(sheet).toBeVisible();
      const closed = sheet.locator('.fp-toggle[aria-expanded="false"]');
      while (await closed.count()) await closed.first().click();
      const shut = sheet.locator('details:not([open]) > summary');
      while (await shut.count()) await shut.first().click();
    },
  },
  { name: 'pick detail', path: '/explorer/shadow%3A169' },
  { name: 'expanded test', path: '/tests?open=corner_rejects' },
  { name: 'glossary search', path: '/glossary?q=cierre' },
  { name: 'glossary rules tab', path: '/glossary?tab=rules' },
  { name: 'decision page', path: '/decisions/14' },
  {
    name: 'decisions with filters open',
    path: '/decisions',
    open: async (page) => {
      await page.locator('.dfilter-toggle').click();
      await expect(page.locator('#decision-filters')).toBeVisible();
    },
  },
  {
    name: 'simulator with every block open and scenario B',
    path: '/simulator?src=shadow&b=src%3Dshadow%26price%3Dle200',
    open: async (page) => {
      await expect(page.getByTestId('sim-b-profit')).toBeVisible();
      const closed = page.locator('details.disclosure:not([open]) > summary');
      while (await closed.count()) await closed.first().click();
    },
  },
  { name: 'analysis as a table, two dimensions', path: '/analysis?dim=market&dim2=price' },
  {
    name: 'toast after saving a filter',
    path: '/explorer?tag=near_value',
    phoneOnly: true,
    open: async (page) => {
      await page.getByTestId('filter-button').click();
      const sheet = page.getByTestId('filter-sheet');
      await sheet.locator('details:not([open]) > summary').first().click();
      await sheet.getByLabel(/Nombre del filtro|Filter name/).fill('A11y');
      await sheet.getByRole('button', { name: /Guardar este filtro|Save this filter/ }).click();
      await expect(page.locator('.toast')).toBeVisible();
    },
  },
  {
    name: 'offline banner after a refresh',
    path: '/',
    open: async (page) => {
      await page.context().setOffline(true);
      await page.getByTestId('refresh').click();
      await expect(page.getByTestId('banner-stale')).toBeVisible();
    },
  },
];

for (const view of [{ name: 'phone', size: PHONE, phone: true, locale: 'es', theme: 'light' }, { name: 'desktop', size: DESKTOP, phone: false, locale: 'en', theme: 'dark' }]) {
  test(`audit: open states, ${view.name}, ${view.locale}, ${view.theme}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(view.size);
    const found = [];
    for (const s of STATES) {
      if (s.phoneOnly && !view.phone) continue;
      await fresh(page, s.path, { locale: /** @type {'es' | 'en'} */ (view.locale), settings: { theme: view.theme } });
      await expect(page.locator('main [data-testid]').first()).toBeVisible();
      await expect(page.getByTestId('feed-loading')).toHaveCount(0);
      if (s.open) await s.open(page);
      const { issues } = await auditPage(page, { locale: /** @type {'es' | 'en'} */ (view.locale), phone: view.phone });
      found.push(...report(issues).map((x) => `${s.name}: ${x}`));
      await page.context().setOffline(false);
    }
    expect(found).toEqual([]);
  });
}

// ---------------------------------------------------------------- what a screen reader hears

test('screen reader: names that carry the meaning (record, filter count, price, sheet language)', async ({ page }) => {
  await openApp(page, '/');
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  // The record is said in words, never as "73–87–4".
  const shadow = await page.getByTestId('source-shadow').locator('.scoreboard .sr-only').textContent();
  expect(shadow).toMatch(/^\d+ ganadas?, \d+ perdidas?(, \d+ nulas?)?$/);

  await openApp(page, '/explorer?tag=near_value&src=shadow');
  await expect(page.getByTestId('explorer-count')).toBeVisible();
  const card = page.locator('.pick-card').first();
  await expect(card).toHaveAccessibleName(/cuota \d+\.\d{2,3}/);
  // A filter section with active filters says how many, not a bare "2".
  await page.getByTestId('filter-button').click();
  const toggle = page.getByTestId('filter-sheet').locator('.fp-toggle', { hasText: /Etiqueta/ });
  await expect(toggle).toHaveAccessibleName(/Etiqueta.*1 activo/);

  // In English the sheet's own Spanish text is marked so the voice switches.
  await fresh(page, '/decisions/14', { locale: 'en' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#d-title')).toHaveAttribute('lang', 'es');
  await fresh(page, '/explorer/shadow%3A169', { locale: 'en' });
  await expect(page.getByTestId('pick-notes').locator('[lang="es"]')).toBeVisible();
  await expect(page.getByTestId('pick-sheet').locator('a.tag')).toHaveAttribute('lang', 'es');
});

test('screen reader: one live region per changing count, and the sync state is announced', async ({ page }) => {
  await openApp(page, '/explorer');
  await expect(page.getByTestId('explorer-count')).toHaveAttribute('aria-live', 'polite');
  await page.getByTestId('filter-button').click();
  await expect(page.getByTestId('filter-live-count')).toHaveAttribute('aria-live', 'polite');
  await page.keyboard.press('Escape');
  for (const [path, id] of [['/glossary', 'glossary-count'], ['/decisions', 'decisions-results'], ['/simulator', 'sim-count'], ['/analysis', 'analysis-count']]) {
    await openApp(page, path);
    await expect(page.getByTestId(id)).toHaveAttribute('aria-live', 'polite');
  }
  // A refresh the user asked for is announced, and so is a failed one.
  await openApp(page, '/');
  const announcer = page.getByTestId('sync-announcer');
  await expect(announcer).toHaveAttribute('aria-live', 'polite');
  await page.getByTestId('refresh').click();
  await expect(announcer).toHaveText(/Datos actualizados|Actualizando/);
  await page.context().setOffline(true);
  await page.getByTestId('refresh').click();
  await expect(announcer).toHaveText('Sin conexión: se ve la copia guardada.');
  await page.context().setOffline(false);
  // The toasts' container is a live region that exists before any toast.
  await expect(page.locator('.toaster')).toHaveAttribute('aria-live', 'polite');
});

test('screen reader: every route has its own title, one main and one h1', async ({ page }) => {
  for (const r of ROUTES) {
    await openApp(page, r.path);
    await expect(page.getByTestId(r.ready).first()).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(`^${r.title} · `));
    const ax = await axNodes(page);
    expect(ax.filter((n) => n.role === 'main').length, r.path).toBe(1);
    expect(ax.filter((n) => n.role === 'heading' && n.props.level === 1).length, r.path).toBe(1);
  }
});

// ---------------------------------------------------------------- keyboard only

test.describe('keyboard', () => {
  test.use({ isMobile: false, hasTouch: false, viewport: DESKTOP });

  test('skip link, then the side rail moves to a section and focus lands on its title', async ({ page }) => {
    await openApp(page, '/');
    await expect(page.getByTestId('source-shadow')).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await focused(page)).toMatch(/^a .*Saltar al contenido/);
    expect(await focusVisible(page)).toBe(true);
    await page.keyboard.press('Enter');
    expect(await focused(page)).toMatch(/^main#main/);
    // Back to the rail: Shift+Tab from main reaches the last rail link first.
    await page.locator('[data-rail="explorer"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('explorer-count')).toBeVisible();
    await expect.poll(() => focused(page)).toMatch(/^h1 Explorador/);
    await expect(page.locator('[data-rail="explorer"]')).toHaveAttribute('aria-current', 'page');
  });

  test('every Tab stop on every route is visible and in a sensible place, never the page body', async ({ page }) => {
    test.setTimeout(90_000);
    for (const r of ROUTES) {
      await openApp(page, r.path);
      await expect(page.getByTestId(r.ready).first()).toBeVisible();
      const seen = [];
      for (let i = 0; i < 25; i++) {
        const wasLast = await page.evaluate(() => {
          const all = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex="0"]')]
            .filter((e) => e.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }) && e.getAttribute('tabindex') !== '-1' && !e.closest('details:not([open]) > :not(summary)'));
          return all.length > 0 && all[all.length - 1] === document.activeElement;
        });
        await page.keyboard.press('Tab');
        const f = await focused(page);
        if (f === 'body' && wasLast) break; // past the last control: the browser's own UI is next
        if (f === 'body') throw new Error(`${r.path}: focus fell to the body after ${i + 1} Tabs (after ${seen[seen.length - 1]})`);
        const box = await page.evaluate(() => {
          const el = /** @type {HTMLElement} */ (document.activeElement);
          const b = el.getBoundingClientRect();
          return { w: b.width, h: b.height, inView: b.bottom > 0 && b.top < innerHeight };
        });
        expect(box.w * box.h, `${r.path} ${f}`).toBeGreaterThan(0);
        expect(box.inView, `${r.path} ${f} scrolled into view`).toBe(true);
        expect(await focusVisible(page), `${r.path} ${f} shows focus`).toBe(true);
        seen.push(f);
      }
      expect(new Set(seen).size, r.path).toBeGreaterThan(3);
    }
  });

  test('filter panel: chips, sections and the sheet on a phone-width window', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openApp(page, '/explorer');
    await expect(page.getByTestId('explorer-count')).toHaveText('247 picks');
    const opener = page.getByTestId('filter-button');
    await opener.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByTestId('filter-sheet');
    await expect(sheet).toBeVisible();
    // Focus moved into the dialog.
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    // Space toggles a chip and its state is exposed.
    const chip = sheet.getByTestId('fchip-sources-shadow');
    await chip.focus();
    await page.keyboard.press('Space');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByTestId('filter-live-count')).not.toHaveText('247 picks con estos filtros');
    // A section heading button opens with Enter and says so.
    const toggle = sheet.locator('.fp-toggle[aria-expanded="false"]').first();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(sheet.locator('.fp-toggle').filter({ has: page.locator(':focus') }).or(sheet.locator('.fp-toggle:focus'))).toHaveAttribute('aria-expanded', 'true');
    // Tab never leaves the dialog, either way.
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), `tab ${i}`).toBe(true);
    }
    // Escape closes it and focus is back on the opener.
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('segmented controls: one Tab stop, arrows choose', async ({ page }) => {
    await openApp(page, '/');
    await expect(page.getByTestId('source-shadow')).toBeVisible();
    const group = page.getByTestId('overview-period').getByRole('radiogroup');
    const radios = group.getByRole('radio');
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
    expect(await radios.evaluateAll((els) => els.map((e) => e.getAttribute('tabindex')))).toEqual(['0', '-1', '-1', '-1']);
    await radios.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(radios.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(radios.nth(3)).toHaveAttribute('aria-checked', 'true');
    await expect(radios.nth(3)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
  });

  test('pagination and pick detail keep focus on a control', async ({ page }) => {
    await openApp(page, '/explorer');
    await expect(page.getByTestId('explorer-count')).toHaveText('247 picks');
    const next = page.getByRole('button', { name: 'Página siguiente' });
    await next.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
    await expect(page.locator('.pager-info')).toContainText('Página 5 de 5');
    // The last page disables "next": focus moved to "previous", not lost.
    await expect(page.getByRole('button', { name: 'Página anterior' })).toBeFocused();

    // Open a pick with Enter, walk with next / previous, close with Escape.
    await fresh(page, '/explorer');
    const first = page.locator('.ex-match-link').first();
    await first.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByTestId('pick-sheet');
    await expect(sheet).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await sheet.getByTestId('pick-next').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('pick-position')).toHaveText(/^2 de/);
    await expect(sheet.getByTestId('pick-next')).toBeFocused();
    await sheet.getByTestId('pick-prev').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('pick-position')).toHaveText(/^1 de/);
    // "Previous" is now disabled: focus went to "next", still in the dialog.
    await expect(sheet.getByTestId('pick-next')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => focused(page)).not.toBe('body');
  });

  test('table sorting exposes aria-sort; disclosures and accordions open with the keyboard', async ({ page }) => {
    await openApp(page, '/analysis?dim=market');
    const table = page.locator('.an-table table').first();
    await expect(table).toBeVisible();
    const sortable = table.locator('th button.th-sort, th button').first();
    await sortable.focus();
    await page.keyboard.press('Enter');
    await expect(table.locator('th[aria-sort]')).toHaveCount(1);

    await openApp(page, '/tests');
    const btn = page.locator('.tests-row-btn').first();
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const panel = await btn.getAttribute('aria-controls');
    await expect(page.locator(`#${panel}`)).toBeVisible();

    await openApp(page, '/simulator?src=shadow');
    const summary = page.locator('details.disclosure > summary').first();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details.disclosure').first()).toHaveAttribute('open', '');
  });

  test('glossary search and the decisions timeline by keyboard', async ({ page }) => {
    await openApp(page, '/glossary');
    await expect(page.getByTestId('glossary-tags')).toBeVisible();
    const search = page.getByRole('searchbox').first();
    await search.focus();
    await page.keyboard.type('cierre');
    await expect(page.getByTestId('glossary-count')).not.toHaveText(/^143/);
    await page.keyboard.press('Tab');
    expect(await focused(page)).not.toBe('body');

    await openApp(page, '/decisions');
    await expect(page.getByTestId('decisions-count')).toBeVisible();
    const topic = page.locator('.dtopic a').first();
    await topic.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('decision-related')).toBeVisible();
    await expect.poll(() => focused(page)).toMatch(/^h1 /);
  });
});

// ---------------------------------------------------------------- reflow, text size, motion

test('reflow: every route at 320 px and at 200% text has no sideways scroll', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const r of ROUTES) {
    await openApp(page, r.path);
    await expect(page.getByTestId(r.ready).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  await page.setViewportSize(PHONE);
  for (const r of ROUTES) {
    await fresh(page, r.path);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.getByTestId(r.ready).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

test('reduced motion: sheets and toasts do not animate, nothing scrolls smoothly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, '/explorer');
  await expect(page.getByTestId('explorer-count')).toBeVisible();
  await page.getByTestId('filter-button').click();
  await expect(page.getByTestId('filter-sheet')).toBeVisible();
  const longest = await page.evaluate(() => Math.max(0, ...document.getAnimations().map((a) => Number(a.effect?.getComputedTiming().duration) || 0)));
  expect(longest).toBeLessThan(1);
  const smooth = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).scrollBehavior === 'smooth').length);
  expect(smooth).toBe(0);
});
