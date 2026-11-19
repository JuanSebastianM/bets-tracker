// A slow phone in the normal check (docs/PERFORMANCE.md): 1,500 synthetic picks served as the feed,
// the CPU slowed down 4x, and the interactions people use most timed from the action to the paint
// after the result. Budgets are about three times what the lab measures, the median of five runs is
// compared, and an over-budget median is measured once more before failing, so a busy CI runner does
// not make it flaky. The whole table (every route, cold and repeat loads, 3G) is `npm run perf:phone`.
import { test, expect } from 'playwright/test';
import { bigFeed } from '../../scripts/perf/big-feed.mjs';
import { INTERACTIONS, measureInteraction } from '../../scripts/perf/phone-lab.mjs';

const PICKS = 1500;
const CPU = 4;
/** Budget per interaction (ms, median of 5 at 4x CPU, 1,500 picks). */
const BUDGETS = { route: 600, sheet: 600, chip: 500, pick: 600, search: 450 };

const feed = JSON.stringify(bigFeed(PICKS));

test.describe.configure({ mode: 'serial' });
test.use({ bypassCSP: true });

for (const [id, budget] of Object.entries(BUDGETS)) {
  test(`slow phone: ${id} stays under ${budget} ms at ${CPU}x CPU with ${PICKS} picks`, async ({ page }) => {
    test.setTimeout(120_000);
    const it = /** @type {(typeof INTERACTIONS)[number]} */ (INTERACTIONS.find((x) => x.id === id));
    await page.route('**/tests/fixtures/feed.json', (r) => r.fulfill({ body: feed, contentType: 'application/json' }));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await page.goto(`/?feed=fixture#${it.path}`);
    await expect(page.getByTestId(it.ready).first()).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName('bt:live-data').length), { timeout: 60_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    let m = await measureInteraction(page, it, 5);
    if (m.median > budget) m = await measureInteraction(page, it, 5); // one retry of the measurement
    test.info().annotations.push({ type: 'median', description: `${id}: ${m.median} ms (runs ${m.times.join(', ')})` });
    expect(m.median, `${it.name}: runs ${m.times.join(', ')} ms`).toBeLessThanOrEqual(budget);
  });
}
