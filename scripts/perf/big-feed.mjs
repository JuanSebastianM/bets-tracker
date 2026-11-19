// A synthetic feed of real size in the fixture's shapes (no real data): the fixture's bet tabs copied
// until there are `target` picks, copy k with rows + k·10000 and dates k·21 days earlier, then Sombra
// trimmed so the total is exact. The same construction as tests/unit/polish-perf.test.mjs.
import { readFileSync } from 'node:fs';
import { addDays } from '../../src/data/filters.js';

const fixture = JSON.parse(readFileSync(new URL('../../tests/fixtures/feed.json', import.meta.url), 'utf8'));
const TABS = ['bets', 'shadow', 'grok'];

/** @param {number} target */
export function bigFeed(target) {
  const feed = structuredClone(fixture);
  const per = TABS.reduce((n, k) => n + feed.tabs[k].rows.length, 0);
  const copies = Math.ceil(target / per);
  for (const tab of TABS) {
    const t = feed.tabs[tab];
    const iRow = t.columns.indexOf('row');
    const iDate = t.columns.indexOf('date');
    const out = [];
    for (let k = 0; k < copies; k++) {
      for (const r of t.rows) {
        const c = [...r];
        c[iRow] = r[iRow] + k * 10000;
        if (c[iDate]) c[iDate] = addDays(c[iDate], -21 * k);
        out.push(c);
      }
    }
    t.rows = out;
  }
  const total = TABS.reduce((n, k) => n + feed.tabs[k].rows.length, 0);
  feed.tabs.shadow.rows = feed.tabs.shadow.rows.slice(0, feed.tabs.shadow.rows.length - (total - target));
  return feed;
}
