// The whole slow-phone table (docs/PERFORMANCE.md). Opt-in, a few minutes:
//   npm run perf:phone                                   # 1,500 and 5,000 picks, 4x and 6x CPU, slow 4G and 3G
//   npm run perf:phone -- --picks 5000 --cpu 4 --net slow4g --json /tmp/perf.json
//   npm run perf:phone -- --only interactions            # loads | interactions | memory
//   npm run perf:phone -- --routes all                   # every route at every CPU and network (long)
//   npm run perf:phone -- --http1                        # plain HTTP/1.1 instead of HTTP/2 (GitHub Pages)
//   npm run perf:phone -- --same-feed                    # every fetch is the same answer (reopened within 5 min)
// Uses /usr/bin/google-chrome when present (agent workspace), else Playwright's Chromium.
import { existsSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ROUTES } from '../tests/e2e/helpers.js';
import { CONTEXT, INIT_SCRIPT, INTERACTIONS, LAUNCH_ARGS, PHONE, measureInteraction, measureLoad, startSite, throttle } from './perf/phone-lab.mjs';

const args = process.argv.slice(2);
const opt = (/** @type {string} */ name, /** @type {string} */ fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const PICKS = opt('picks', '1500,5000').split(',').map(Number);
const CPUS = opt('cpu', '4,6').split(',').map(Number);
const NETS = /** @type {Array<'slow4g' | '3g'>} */ (opt('net', 'slow4g,3g').split(','));
const ONLY = opt('only', 'loads,interactions,memory').split(',');
const PORT = Number(opt('port', String(Number(process.env.E2E_PORT || 4173) + 60)));
const JSON_OUT = opt('json', '');
/** Every route at the first CPU and network; the four busiest at the other combinations (time). */
const MAIN = ['/', '/explorer', '/simulator', '/analysis'];
const ROUTES_ALL = opt('routes', 'first') === 'all';
/** Interactions and memory do not depend on the network: measured at the first network only. */

const exe = !process.env.CI && existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
const browser = await chromium.launch({ executablePath: exe, args: LAUNCH_ARGS });
const results = [];

/** @param {any[]} rows @param {string[]} cols */
function table(rows, cols) {
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '–').length)));
  const line = (/** @type {any} */ r) => cols.map((c, i) => String(r[c] ?? '–').padStart(w[i])).join('  ');
  console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  for (const r of rows) console.log(line(r));
}

for (const picks of PICKS) {
  const site = await startSite({ picks, port: PORT, http2: !args.includes('--http1'), freshFeed: !args.includes('--same-feed') });
  console.log(`\n## ${picks.toLocaleString('en-US')} picks — feed ${Math.round(site.feedBytes / 1024)} KB (${Math.round(site.feedGzipBytes / 1024)} KB gzipped)`);
  try {
    for (const cpu of CPUS) {
      for (const net of NETS) {
        if (ONLY.includes('loads')) {
          const rows = [];
          const first = cpu === CPUS[0] && net === NETS[0];
          for (const r of ROUTES) {
            if (!first && !ROUTES_ALL && !MAIN.includes(r.path)) continue;
            const context = await browser.newContext({ ...PHONE, ...CONTEXT, serviceWorkers: 'allow' });
            await context.addInitScript(INIT_SCRIPT);
            const page = await context.newPage();
            await throttle(page, { cpu, net });
            const url = `${site.origin}/?sw=on&feed=fixture#${r.path}`;
            const cold = await measureLoad(page, url, r.ready);
            // The worker has the shell and IndexedDB has the feed: a repeat open.
            await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60_000 }).catch(() => {});
            await page.goto('about:blank');
            const warm = await measureLoad(page, url, r.ready);
            await context.close();
            const row = {
              route: r.path, cold: cold.content, coldLive: cold.live, warm: warm.content, warmCache: warm.cache, warmLive: warm.live,
              long: `${warm.longTasks}/${warm.longest}`, coldLong: `${cold.longTasks}/${cold.longest}`, shellKB: cold.shellKB, feedKB: cold.feedKB, reqs: cold.requests,
            };
            rows.push(row);
            results.push({ kind: 'load', picks, cpu, net, ...row });
          }
          console.log(`\n### loads at ${cpu}x CPU, ${net} (ms from navigation; long = count/longest ms)`);
          table(rows, ['route', 'cold', 'coldLive', 'coldLong', 'warm', 'warmCache', 'warmLive', 'long', 'shellKB', 'feedKB', 'reqs']);
        }
        if (net !== NETS[0]) continue;
        if (ONLY.includes('interactions')) {
          const context = await browser.newContext({ ...PHONE, ...CONTEXT, serviceWorkers: 'allow' });
          const page = await context.newPage();
          await throttle(page, { cpu, net });
          const rows = [];
          for (const it of INTERACTIONS) {
            await page.goto('about:blank');
            await page.goto(`${site.origin}/?sw=on&feed=fixture#${it.path}`);
            await page.waitForFunction((id) => !!document.querySelector(`[data-testid="${id}"]`), it.ready, { timeout: 120_000 });
            await page.waitForFunction(() => performance.getEntriesByName('bt:live-data').length > 0, null, { timeout: 120_000 });
            await page.waitForTimeout(500);
            try {
              const m = await measureInteraction(page, it, 5);
              rows.push({ interaction: it.name, median: m.median, max: m.max, runs: m.times.join(' ') });
              results.push({ kind: 'interaction', picks, cpu, id: it.id, ...m });
            } catch (e) {
              rows.push({ interaction: it.name, median: 'failed', max: '', runs: String(e).split('\n')[0].slice(0, 80) });
            }
          }
          await context.close();
          console.log(`\n### interactions at ${cpu}x CPU (ms to the paint after the result; 5 runs)`);
          table(rows, ['interaction', 'median', 'max', 'runs']);
        }
        if (ONLY.includes('memory') && cpu === CPUS[0]) {
          const context = await browser.newContext({ ...PHONE, ...CONTEXT, serviceWorkers: 'allow' });
          const page = await context.newPage();
          const cdp = await throttle(page, { cpu: 1, net: 'none' });
          await page.goto(`${site.origin}/?sw=on&feed=fixture#/`);
          await page.waitForFunction(() => performance.getEntriesByName('bt:live-data').length > 0, null, { timeout: 120_000 });
          for (const r of ROUTES) {
            await page.evaluate((p) => { location.hash = p; }, r.path);
            await page.waitForFunction((id) => !!document.querySelector(`[data-testid="${id}"]`), r.ready, { timeout: 60_000 });
          }
          await cdp.send('HeapProfiler.collectGarbage');
          const heap = await cdp.send('Runtime.getHeapUsage');
          const dom = await page.evaluate(() => document.getElementsByTagName('*').length);
          await context.close();
          console.log(`\n### memory after every route: JS heap ${Math.round(heap.usedSize / 1048576)} MB, ${dom} DOM elements on the last route`);
          results.push({ kind: 'memory', picks, heapMB: Math.round(heap.usedSize / 1048576), dom });
        }
      }
    }
  } finally {
    site.stop();
  }
}
await browser.close();
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
