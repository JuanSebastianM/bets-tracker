// Speed at real volume: a synthetic dataset of 5,000 picks in the fixture's shapes (the fixture's rows
// copied with new row numbers and earlier dates; no real data) and generous time budgets for the work
// one screen does on one change. The live sheet has about 900 picks and grows by 30–60 a day; the
// budgets are for a slow phone's worth of headroom on a CI machine, not micro-benchmarks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { normalizeFeed } from '../../src/data/normalize.js';
import { applyFilters, defaultFilters, facetCounts, addDays } from '../../src/data/filters.js';
import { summarize } from '../../src/data/stats.js';
import { simulate } from '../../src/data/simulate.js';
import { DIMENSION_IDS, breakdown, exactRowFilter } from '../../src/data/analysis.js';
import {
  shadowTagRows, shadowMarketRows, sourceSummary, cumulativeUnits, realBetsExtras, upcomingPending, overduePending, lastGradedSlate,
  slateReport, shadowTagLineRows, picksInPeriod, SOURCES,
} from '../../src/data/overview.js';
import { loadAllStrings } from './helpers/strings.mjs';

loadAllStrings('es');
const fixture = JSON.parse(readFileSync(new URL('../fixtures/feed.json', import.meta.url), 'utf8'));
const TARGET = 5000;
const ctx = { today: '2026-11-15' };

/** The fixture's bet tabs copied until there are TARGET picks: copy k has rows + k·10000 and dates k·21 days earlier. */
export function bigFeed(target = TARGET) {
  const feed = structuredClone(fixture);
  const per = ['bets', 'shadow', 'grok'].reduce((n, k) => n + feed.tabs[k].rows.length, 0);
  const copies = Math.ceil(target / per);
  for (const tab of ['bets', 'shadow', 'grok']) {
    const t = feed.tabs[tab];
    const iRow = t.columns.indexOf('row');
    const iDate = t.columns.indexOf('date');
    const base = t.rows;
    const out = [];
    for (let k = 0; k < copies; k++) {
      for (const r of base) {
        const c = [...r];
        c[iRow] = r[iRow] + k * 10000;
        if (c[iDate]) c[iDate] = addDays(c[iDate], -21 * k);
        out.push(c);
      }
    }
    t.rows = out;
  }
  // Trim Sombra so the total is exactly the target.
  const total = ['bets', 'shadow', 'grok'].reduce((n, k) => n + feed.tabs[k].rows.length, 0);
  feed.tabs.shadow.rows = feed.tabs.shadow.rows.slice(0, feed.tabs.shadow.rows.length - (total - target));
  return feed;
}

const time = (fn) => {
  const t0 = performance.now();
  const out = fn();
  return { ms: performance.now() - t0, out };
};

test('5,000 picks: normalize, one filter change, summaries, Overview, Analysis and Simulator stay fast', () => {
  const feed = bigFeed();
  const n = time(() => normalizeFeed(feed));
  const data = n.out;
  assert.equal(data.picks.length, TARGET);
  const report = { normalize: n.ms };

  // One filter change in the Explorer: the list and every facet count of the panel.
  const f = { ...defaultFilters(), sources: ['shadow'], tags: ['value', 'near_value'] };
  report.filterAndFacets = time(() => {
    const list = applyFilters(data.picks, f, ctx);
    facetCounts(data.picks, f, ctx);
    return list;
  }).ms;

  report.summarize = time(() => summarize(data.picks)).ms;

  // The Overview's figures for the "all" period.
  report.overview = time(() => {
    const picks = picksInPeriod(data.picks, 'all', ctx);
    const shadow = picks.filter((p) => p.source === 'shadow');
    for (const s of SOURCES) {
      const mine = picks.filter((p) => p.source === s);
      sourceSummary(mine, s);
      cumulativeUnits(mine);
    }
    shadowTagRows(shadow);
    shadowMarketRows(shadow);
    shadowTagLineRows(shadow);
    realBetsExtras(picks.filter((p) => p.source === 'bets'), 100);
    upcomingPending(data.picks, ctx.today);
    overduePending(data.picks, ctx.today);
    slateReport(data.picks, lastGradedSlate(data.picks));
  }).ms;

  // The Analysis breakdown: every dimension, plus the links of the first 20 rows of one.
  report.analysis = time(() => {
    for (const d of DIMENSION_IDS) breakdown(data.picks, d);
    const rows = breakdown(data.picks, 'league').rows.slice(0, 20);
    for (const r of rows) exactRowFilter(data.picks, data.picks, defaultFilters(), 'league', r.key, ctx);
  }).ms;

  report.simulate = time(() => {
    simulate(data.picks, { mode: 'flat', stake: 1, bankroll: 100 });
    simulate(data.picks, { mode: 'percent', percent: 2, bankroll: 100 });
    simulate(data.picks, { mode: 'kelly', kellyFraction: 0.25, kellyCap: 2, bankroll: 100 });
  }).ms;

  // Roughly ten times what an idle machine needs: the test failed once at the earlier, tighter budgets
  // while several agents were running on the same machine. It guards against a regression in kind
  // (a pass per row turning into a pass per row per option), not against a slow runner.
  const BUDGET_MS = { normalize: 4000, filterAndFacets: 1800, summarize: 500, overview: 1800, analysis: 4000, simulate: 1800 };
  console.log(`# 5,000 picks (ms): ${Object.entries(report).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}`);
  for (const [k, budget] of Object.entries(BUDGET_MS)) assert.ok(report[k] < budget, `${k}: ${report[k].toFixed(0)} ms (budget ${budget} ms)`);
});
