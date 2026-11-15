// Simulator: arriving from the Explorer with filters, stake changes, each staking mode, URL state,
// scenario B, saved scenarios, money from Settings, both languages and no horizontal scroll.
// Figures come from the synthetic fixture (tests/fixtures/feed.json).
import { test, expect } from 'playwright/test';
import { openApp, expectNoHorizontalScroll } from './helpers.js';

const profit = (/** @type {import('playwright/test').Page} */ page) => page.getByTestId('sim-profit');
const mode = (/** @type {import('playwright/test').Page} */ page, /** @type {string} */ name) =>
  page.getByTestId('sim-staking').getByRole('radio', { name });

test('opened with no query: Sombra, every tag, 1u flat', async ({ page }) => {
  const { errors } = await openApp(page, '/simulator');
  await expect(page).toHaveURL(/#\/simulator\?src=shadow$/);
  await expect(page.getByTestId('sim-count')).toHaveText('164 picks calificados, 19 pendientes');
  await expect(page.getByTestId('sim-lead')).toHaveText('Si hubieras apostado 1u en cada uno:');
  await expect(profit(page)).toHaveText('+5.42u');
  await expect(page.getByTestId('sim-money')).toHaveCount(0);
  await expect(page.getByTestId('sim-chart').getByRole('img')).toHaveCount(1);
  await expect(page.getByTestId('sim-close-sentence')).toContainText('104 picks con cierre de dos lados');
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('from the Explorer link with filters; changing the stake changes the headline', async ({ page }) => {
  await openApp(page, '/explorer?tag=near_value');
  await page.getByTestId('simulate-these').click();
  await expect(page).toHaveURL(/#\/simulator\?tag=near_value$/);
  await expect(page.getByTestId('active-filters')).toContainText('VALOR CASI');
  await expect(page.getByTestId('sim-count')).toHaveText('16 picks calificados, 2 pendientes');
  await expect(profit(page)).toHaveText('+5.69u');
  await page.getByTestId('sim-stake-2').click();
  await expect(page).toHaveURL(/stake=2/);
  await expect(page.getByTestId('sim-lead')).toHaveText('Si hubieras apostado 2u en cada uno:');
  await expect(profit(page)).toHaveText('+11.39u');
  await page.getByTestId('sim-stake').fill('0,5');
  await expect(page).toHaveURL(/stake=0\.5/);
  await expect(profit(page)).toHaveText('+2.85u');
});

test('each staking mode explains itself and changes the result', async ({ page }) => {
  await openApp(page, '/simulator?src=shadow');
  await mode(page, '% banca').click();
  await expect(page).toHaveURL(/mode=percent/);
  await expect(page.getByTestId('sim-mode-help')).toContainText('banca con que empezó ese día');
  await page.getByTestId('sim-percent').fill('2');
  await expect(profit(page)).toHaveText('+5.49u');
  await expect(page.getByTestId('sim-final-bank')).toContainText('105.49u');

  await mode(page, 'Kelly').click();
  await expect(page).toHaveURL(/mode=kelly/);
  await expect(profit(page)).toHaveText('−4.32u');
  await expect(page.getByTestId('sim-left-out')).toHaveText('23 picks sin ventaja tuvieron stake 0 y no se apostaron.');
  await page.getByTestId('sim-kf-0.5').click();
  await expect(page).toHaveURL(/kf=0\.5/);
  await expect(page.getByTestId('sim-lead')).toHaveText('Con Kelly 1/2, máx. 2u:');

  await mode(page, 'Registrado').click();
  await expect(page.getByTestId('sim-empty')).toBeVisible(); // Sombra has no stake
  await expect(page.getByTestId('sim-left-out')).toHaveCount(0);
  await expect(page.getByText('164 picks sin stake quedaron fuera.')).toBeVisible();
});

test('as staked on real bets uses the sheet profit', async ({ page }) => {
  await openApp(page, '/simulator?src=bets&mode=staked');
  await expect(page.getByTestId('sim-lead')).toHaveText('Con el stake con que se registró cada uno:');
  await expect(profit(page)).toHaveText('−6.07u');
});

test('the whole state survives a reload; the detail blocks open', async ({ page }) => {
  await openApp(page, '/simulator?src=shadow&price=le200&mode=percent&pct=3&bank=50');
  const before = await profit(page).textContent();
  await page.reload();
  await expect(profit(page)).toHaveText(before || '');
  await expect(mode(page, '% banca')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('sim-percent')).toHaveValue('3');
  await expect(page.getByTestId('sim-bank')).toHaveValue('50');
  await page.getByTestId('sim-risk').getByText('Caídas y rachas').click();
  await expect(page.getByTestId('sim-max-dd')).toContainText('de la banca inicial');
  await page.getByTestId('sim-breakdown').getByText('Desglose').click();
  const first = page.getByTestId('sim-breakdown-rows').getByRole('link').first();
  await expect(first).toHaveAttribute('href', /#\/explorer\?src=shadow&tag=/);
  await page.getByTestId('sim-price').getByText('Lo que dice el precio').click();
  await expect(page.getByTestId('sim-expected')).toContainText('u');
  await expectNoHorizontalScroll(page);
});

test('scenario B: compare, change B, survive a reload, swap and remove', async ({ page }) => {
  const { errors } = await openApp(page, '/simulator?src=shadow');
  await page.getByTestId('sim-compare').getByText('Comparar con otro escenario').click();
  await page.getByTestId('b-le200').click();
  await expect(page).toHaveURL(/b=src%3Dshadow%26price%3Dle200/);
  await expect(page.getByTestId('sim-a-profit')).toHaveText('+5.42u');
  await expect(page.getByTestId('sim-b-profit')).toHaveText('+11.61u');
  await expect(page.getByTestId('sim-compare-table')).toContainText('+6.19u');
  await page.getByTestId('simb-stake-2').click();
  await expect(page.getByTestId('sim-b-profit')).toHaveText('+23.22u');
  await page.reload();
  await expect(page.getByTestId('sim-b-profit')).toHaveText('+23.22u');
  await expect(page.getByTestId('sim-b-text')).toContainText('2u fija');
  // B's filters in their own sheet
  await page.getByTestId('sim-compare').getByTestId('filter-button').click();
  await page.getByTestId('b-filter-sheet').getByTestId('fchip-price-le200').click();
  await page.getByTestId('b-filter-show').click();
  await expect(page.getByTestId('sim-b-profit')).toHaveText('+10.84u');
  await page.getByTestId('b-swap').click();
  await expect(profit(page)).toHaveText('+10.84u');
  await page.getByTestId('b-remove').click();
  await expect(page).not.toHaveURL(/b=/);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('save a scenario and apply it again', async ({ page }) => {
  await openApp(page, '/simulator?tag=near_value&stake=2');
  await page.getByTestId('sim-scenarios').getByText('Escenarios guardados').click();
  await page.getByLabel('Nombre del escenario').fill('Casi a 2u');
  await page.getByTestId('sim-save').click();
  await expect(page.getByText('Escenario «Casi a 2u» guardado.')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bt.settings') || '{}').presets);
  expect(stored).toEqual([expect.objectContaining({ name: 'Casi a 2u', query: 'tag=near_value&mode=flat&stake=2&bank=100' })]);

  await page.getByTestId('sim-stake-0.5').click();
  await expect(profit(page)).toHaveText('+2.85u');
  await page.getByRole('button', { name: 'Aplicar «Casi a 2u»' }).click();
  await expect(profit(page)).toHaveText('+11.39u');
  await page.getByRole('button', { name: 'Usar «Casi a 2u» como B' }).click();
  await expect(page.getByTestId('sim-b-profit')).toHaveText('+11.39u');
});

test('bankroll and unit value from Settings: money next to the units, bankroll in units', async ({ page }) => {
  await openApp(page, '/simulator?src=shadow&mode=percent&pct=2', { settings: { bankroll: 500, unitValue: 5, currency: 'pts', defaultStake: 1 } });
  await expect(profit(page)).toHaveText('+5.49u');
  await expect(page.getByTestId('sim-money')).toHaveText('≈ +27 pts con tu valor de unidad');
  await expect(page.getByTestId('sim-bank')).toHaveValue('100');
});

test('default stake from Settings', async ({ page }) => {
  await openApp(page, '/simulator?src=shadow', { settings: { defaultStake: 0.5 } });
  await expect(profit(page)).toHaveText('+2.71u');
  await expect(page.getByTestId('sim-lead')).toHaveText('Si hubieras apostado 0.5u en cada uno:');
});

test('English', async ({ page }) => {
  await openApp(page, '/simulator?src=shadow&mode=kelly', { locale: 'en' });
  await expect(page.getByTestId('sim-lead')).toHaveText('With Kelly 1/4, max 2u:');
  await expect(page.getByTestId('sim-count')).toHaveText('164 graded picks, 19 pending');
  await expect(page.getByTestId('sim-mode-help')).toContainText('Fractional Kelly');
});

test('empty set says so', async ({ page }) => {
  await openApp(page, '/simulator?q=zzzz-nada');
  await expect(page.getByTestId('sim-empty')).toBeVisible();
  await expect(profit(page)).toHaveText('0.00u');
});

test.describe('wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('side filter panel filters in place; compare and no horizontal scroll', async ({ page }) => {
    const { errors } = await openApp(page, '/simulator?src=shadow&b=src%3Dshadow%26mode%3Dkelly');
    const panel = page.getByTestId('filter-panel').first();
    await expect(panel).toBeVisible();
    await panel.getByTestId('fchip-tags-near_value').click();
    await expect(page).toHaveURL(/tag=near_value/);
    await expect(profit(page)).toHaveText('+5.69u');
    await expect(page.getByTestId('sim-b-profit')).toHaveText('−4.32u');
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
