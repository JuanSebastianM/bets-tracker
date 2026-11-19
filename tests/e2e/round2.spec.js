// Round 2 (second audit's screen findings): the two measures against the close under their own names,
// and every kind of link into the Explorer opening exactly the picks its row counts. On the fixture.
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T17:00:00Z'));
});

test('both measures are named on the Overview and the Tests screen, in both languages', async ({ page }) => {
  const { errors } = await openApp(page, '/');
  const shadow = page.getByTestId('source-shadow');
  await expect(shadow.getByTestId('price-close-shadow')).toContainText('Precio vs cierre');
  await expect(shadow.getByTestId('review-ev-shadow')).toContainText('EV justo (revisión)');
  await expect(shadow.getByTestId('review-ev-shadow')).toContainText(/n \d+/);
  // Apuestas and Grok show price vs close only.
  await expect(page.getByTestId('review-ev-bets')).toHaveCount(0);
  await expect(page.getByTestId('overview-tags-legend').getByRole('link', { name: 'Precio vs cierre' })).toHaveAttribute('href', '#/glossary/price-vs-close');
  await expect(page.getByTestId('overview-tags-legend').getByRole('link', { name: 'EV justo (revisión)' })).toHaveAttribute('href', '#/glossary/fair-ev-review');
  await expect(page.getByTestId('tag-table')).toContainText('EV justo (revisión)');
  await expect(page.locator('body')).not.toContainText('EV vs cierre');

  await page.goto('/?feed=fixture#/tests');
  await expect(page.getByTestId('frozen-list')).toContainText('Precio vs cierre');
  await expect(page.getByTestId('price-first-value')).toContainText('EV justo (revisión)');
  await expect(page.getByTestId('price-first-prop_value')).toContainText('EV vs bet365 (power)');
  await page.goto('/?feed=fixture#/tests?open=near_value');
  await expect(page.getByTestId('detail-near_value')).toContainText('EV justo (revisión): la apertura contra el cierre');
  await expect(page.locator('body')).not.toContainText('EV vs cierre');
  expect(errors).toEqual([]);
});

test('English names, and the old glossary link still opens the price-vs-close entry', async ({ page }) => {
  const { errors } = await openApp(page, '/', { locale: 'en' });
  await expect(page.getByTestId('price-close-shadow')).toContainText('Price vs close');
  await expect(page.getByTestId('review-ev-shadow')).toContainText('Fair-close EV (review)');
  await page.goto('/?feed=fixture#/tests');
  await expect(page.getByTestId('frozen-list')).toContainText('Price vs close');
  await expect(page.getByTestId('price-first-near_value')).toContainText('Fair-close EV (review)');
  // Test names are the sheet's own Spanish labels, marked for the screen reader.
  await expect(page.getByTestId('frozen-cards_under').locator('[lang="es"]').first()).toBeVisible();
  await page.goto('/?feed=fixture#/glossary/fair-close-ev');
  await expect(page.getByTestId('glossary-term')).toHaveAttribute('data-slug', 'price-vs-close');
  await expect(page.getByTestId('glossary-term')).toContainText('Price vs close');
  await page.goto('/?feed=fixture#/glossary/fair-ev-review');
  await expect(page.getByTestId('glossary-term')).toContainText('Example');
  expect(errors).toEqual([]);
});

test('team corners have their own glossary link under "Sombra por mercado"', async ({ page }) => {
  await openApp(page, '/');
  const links = page.getByTestId('overview-market-glossary');
  await expect(links.getByRole('link', { name: 'Córners de equipo' })).toHaveAttribute('href', '#/glossary/corners-team');
  await expect(links.getByRole('link', { name: 'Córners totales' })).toHaveAttribute('href', '#/glossary/corners');
});

test('the date presets: the last graded slate, the pending slate, rolling periods that keep upcoming slates', async ({ page }) => {
  await openApp(page, '/explorer?date=last_slate');
  await page.getByTestId('filter-button').click();
  const sheet = page.getByTestId('filter-sheet');
  await expect(sheet.getByTestId('fp-date-note')).toContainText('Último slate calificado:');
  await sheet.getByTestId('fchip-date-pending_slate').click();
  await expect(sheet.getByTestId('fp-date-note')).toContainText('Slate más reciente con picks pendientes:');
  await sheet.getByTestId('fchip-date-7d').click();
  await expect(sheet.getByTestId('fp-date-note')).toContainText('en adelante, con los próximos slates incluidos');
  // The Overview's last slate and the Explorer's preset are the same picks.
  await openApp(page, '/?date=last_slate');
  const n = Number(await page.getByTestId('quick-picks').getAttribute('data-count'));
  await page.goto('/?feed=fixture#/explorer?date=last_slate');
  await expect(page.getByTestId('explorer-count')).toHaveText(`${n} ${n === 1 ? 'pick' : 'picks'}`);
  // 7 days includes the pending picks of upcoming slates.
  await page.goto('/?feed=fixture#/?date=7d');
  await expect(page.getByTestId('period-note')).toContainText('en adelante');
});

// ---------------------------------------------------------------- links: count at both ends

/** Hash hrefs and the count each origin says it opens, read from the page. */
async function collect(page, selector, attr = 'data-count') {
  return page.locator(selector).evaluateAll((els, a) => els.map((e) => ({ href: e.getAttribute('href'), n: Number(e.getAttribute(a)), what: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 60) })), attr);
}

/** Open each href in the Explorer and compare its count with the origin's. */
async function follow(page, kind, links) {
  expect(links.length, `${kind}: links found`).toBeGreaterThan(0);
  const bad = [];
  for (const l of links) {
    await page.evaluate((h) => { location.hash = h; }, l.href);
    const count = page.getByTestId('explorer-count');
    await expect(count).toBeVisible();
    await expect(count).toHaveText(new RegExp(`^${l.n} picks?$`), { timeout: 3000 }).catch(async () => bad.push(`${kind} ${l.what}: row ${l.n}, Explorer "${await count.innerText()}"`));
  }
  expect(bad).toEqual([]);
}

test('every kind of link into the Explorer opens exactly what its row counts', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  // Overview, all time and the last slate: tag, line and market rows, source cards, pending, quick links.
  for (const period of ['', '?date=last_slate', '?date=30d']) {
    await openApp(page, `/${period}`);
    await expect(page.getByTestId('source-shadow')).toBeVisible();
    const kinds = {
      tag: await collect(page, '[data-testid="tag-table"] a.ov-grow'),
      line: await collect(page, '[data-testid="tag-table"] a.ov-lrow'),
      market: await collect(page, '[data-testid="market-table"] a.ov-grow'),
      source: await collect(page, '[data-testid^="source-link-"]'),
      pending: await collect(page, '[data-testid="pending-link"]'),
      quick: await collect(page, '[data-testid="quick-picks"]'),
    };
    for (const [kind, links] of Object.entries(kinds)) {
      if (!links.length && (kind === 'pending' || kind === 'line' || period)) continue;
      await follow(page, `overview${period} ${kind}`, links);
    }
  }
  // Tests: every frozen and price-first card, and the stopped categories.
  await page.goto('/?feed=fixture#/tests');
  await expect(page.getByTestId('frozen-table')).toBeVisible();
  const ids = await page.locator('[data-testid^="frozen-"][data-state], [data-testid^="price-first-"][data-state]').evaluateAll((els) => els.map((e) => e.id.replace(/^test-/, '')));
  const cards = [];
  for (const id of ids) {
    await page.evaluate((h) => { location.hash = h; }, `#/tests?open=${id}`);
    await expect(page.getByTestId(`explorer-${id}`)).toBeVisible();
    cards.push(...(await collect(page, `[data-testid="explorer-${id}"]`, 'data-rows')));
  }
  await page.getByText(/Categorías detenidas/).click();
  cards.push(...(await collect(page, '[data-testid="stopped"] [data-testid^="explorer-"]', 'data-rows')));
  await follow(page, 'tests', cards);
  // Analysis: breakdown rows (list and table) and the cells of a two-way table; Grok by market.
  await page.goto('/?feed=fixture#/analysis?dim=tag&dim2=market');
  await expect(page.getByTestId('analysis-bars')).toBeVisible();
  const rows = await collect(page, '[data-testid="bd-link"]');
  const cells = await collect(page, '[data-testid="bd-cell-link"]');
  await follow(page, 'analysis rows', rows);
  await follow(page, 'analysis cells', cells);
  await page.goto('/?feed=fixture#/analysis/grok');
  await expect(page.getByTestId('grok-markets')).toBeVisible();
  await follow(page, 'analysis grok markets', await collect(page, '[data-testid="grok-market-link"]'));
  // Simulator breakdown rows, by tag and by market.
  await page.goto('/?feed=fixture#/simulator');
  await expect(page.getByTestId('sim-profit')).toBeVisible();
  const sim = await collect(page, '[data-testid="sim-breakdown-rows"] a.sim-row', 'data-n');
  await follow(page, 'simulator rows', sim);
  // Glossary tag entries.
  for (const slug of ['near-value', 'value', 'team-corners', 'cards-under', 'grok-priced']) {
    await page.goto(`/?feed=fixture#/glossary/${slug}`);
    await expect(page.getByTestId('glossary-term')).toBeVisible();
    const g = await collect(page, '[data-testid="glossary-tag-link"]');
    if (g.length) await follow(page, `glossary ${slug}`, g);
  }
});

test('real bets: no flat break-even beside uneven stakes, the worst drop by day, halves in words', async ({ page }) => {
  await openApp(page, '/');
  const bets = page.getByTestId('source-bets');
  await expect(page.getByTestId('summary-bets')).not.toContainText('que necesita para no perder');
  await expect(page.getByTestId('overview-real')).toContainText('Peor caída (por día)');
  await expect(page.locator('body')).not.toContainText('½');
  await expectNoHorizontalScroll(page);
  await expect(bets).toBeVisible();
});

test('Decisions: a month header counts the whole month under the filters', async ({ page }) => {
  await openApp(page, '/decisions');
  await expect(page.getByTestId('decisions-timeline')).toBeVisible();
  const heads = await page.locator('.dmonth-h').evaluateAll((els) => els.map((e) => ({ total: Number(e.getAttribute('data-count')), text: e.textContent })));
  for (const h of heads) expect(h.text).toContain(String(h.total));
});
