// The slow-phone lab (docs/PERFORMANCE.md): the built site with its service worker, a synthetic feed
// of real size, Chrome with a throttled CPU and network through CDP, and the measurements. Used by
// `npm run perf:phone` (the whole table) and tests/e2e/slow-phone.spec.js (a few budgets in the check).
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createSecureServer } from 'node:http2';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { bigFeed } from './big-feed.mjs';

const ROOT = resolve(import.meta.dirname, '../..');

/**
 * Network profiles (Network.emulateNetworkConditions). Latency is the round trip added to every
 * request; throughput in bytes per second.
 *  - slow4g: Lighthouse's "slow 4G" (150 ms, 1.6 Mbps down, 750 kbps up), a weak 4G signal.
 *  - 3g: DevTools' "3G" (562.5 ms, 1.44 Mbps down, 675 kbps up), a congested or rural connection.
 */
export const NETWORKS = {
  none: null,
  slow4g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  '3g': { latency: 562.5, downloadThroughput: (1.44 * 1024 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 },
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * Build the deployable site into a temporary folder, replace the fixture the app loads with
 * ?feed=fixture by a synthetic feed of `picks` picks, and serve it gzipped (as GitHub Pages serves
 * the shell and Apps Script serves the feed), so the bytes go through the emulated network.
 * `http2` (the default, as GitHub Pages) serves HTTPS with a throwaway self-signed certificate (the
 * browser must ignore certificate errors: LAUNCH_ARGS, CONTEXT); without it, plain HTTP/1.1, where
 * the browser opens at most 6 connections and the ~115 files of the shell queue behind each other.
 * `freshFeed` (the default) gives every fetch of the feed a new sheet-read time, as when the sheet
 * was read again (the script caches its answer 5 minutes): the app must rebuild and redraw. Without
 * it every fetch returns the same answer, as when the app is reopened within those 5 minutes.
 * @param {{ picks: number, port: number, http2?: boolean, freshFeed?: boolean }} opts
 */
export async function startSite({ picks, port, http2 = true, freshFeed = true }) {
  const dir = mkdtempSync(join(tmpdir(), 'bt-perf-'));
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-site.mjs'), dir], { stdio: 'ignore' });
  const feed = JSON.stringify(bigFeed(picks));
  writeFileSync(join(dir, 'tests/fixtures/feed.json'), feed);
  /** @type {Map<string, Buffer>} */
  const gz = new Map();
  const handler = (/** @type {any} */ req, /** @type {any} */ res) => {
    const url = new URL(req.url || '/', 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(dir, rel));
    let ok = false;
    try {
      ok = file.startsWith(dir) && statSync(file).isFile();
    } catch {}
    if (!ok) {
      res.writeHead(404).end();
      return;
    }
    const type = TYPES[extname(file)] || 'application/octet-stream';
    const headers = { 'content-type': type, 'cache-control': 'no-cache' };
    if (freshFeed && rel.endsWith('/feed.json')) {
      const body = feed.replace(/"generatedAt":"[^"]*"/, `"generatedAt":"${new Date().toISOString()}"`);
      const gzipped = /gzip/.test(String(req.headers['accept-encoding']));
      res.writeHead(200, { ...headers, ...(gzipped ? { 'content-encoding': 'gzip' } : {}) }).end(gzipped ? gzipSync(body) : body);
      return;
    }
    const text = /text|json|javascript|manifest/.test(type);
    if (text && /gzip/.test(String(req.headers['accept-encoding']))) {
      if (!gz.has(file)) gz.set(file, gzipSync(readFileSync(file)));
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip' }).end(gz.get(file));
    } else {
      res.writeHead(200, headers).end(readFileSync(file));
    }
  };
  let server;
  if (http2) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
    server = createSecureServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')), allowHTTP1: true }, handler);
  } else {
    server = createServer(handler);
  }
  await new Promise((r) => server.listen(port, '127.0.0.1', () => r(null)));
  return {
    origin: `${http2 ? 'https' : 'http'}://127.0.0.1:${port}`,
    feedBytes: Buffer.byteLength(feed),
    feedGzipBytes: gzipSync(feed).length,
    stop: () => {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Chrome flags and context options the lab needs (the self-signed certificate of the HTTP/2 server). */
export const LAUNCH_ARGS = ['--ignore-certificate-errors'];
export const CONTEXT = { ignoreHTTPSErrors: true, bypassCSP: true };

/** Collects long tasks from the start of the document (installed with addInitScript). */
export const INIT_SCRIPT = `(() => {
  window.__bt = { long: [] };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__bt.long.push([e.startTime, e.duration]); })
      .observe({ type: 'longtask', buffered: true });
  } catch {}
})();`;

/**
 * Throttle the page's CPU and network.
 * @param {import('playwright').Page} page @param {{ cpu: number, net: keyof typeof NETWORKS }} p
 */
export async function throttle(page, { cpu, net }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const n = NETWORKS[net];
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', n ? { offline: false, ...n } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  return cdp;
}

/** The phone profile: a 390 px wide Android-like phone. */
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: 'America/Bogota' };

/**
 * Load one route and measure it: time to the route's content, when the cached and the live data
 * were handed over (User Timing marks from src/data/store.js), long tasks and transfer sizes.
 * @param {import('playwright').Page} page @param {string} url @param {string} ready data-testid that marks the content
 */
export async function measureLoad(page, url, ready) {
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction((id) => !!document.querySelector(`[data-testid="${id}"]`), ready, { polling: 'raf', timeout: 120_000 });
  const content = await page.evaluate(() => performance.now());
  // The live data has arrived (and been rendered) once the mark exists.
  await page.waitForFunction(() => performance.getEntriesByName('bt:live-data').length > 0, null, { timeout: 120_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  // Let tasks that follow the swap finish so they are counted.
  await page.waitForTimeout(300);
  return page.evaluate((c) => {
    const at = (/** @type {string} */ n) => performance.getEntriesByName(n)[0]?.startTime ?? null;
    const res = /** @type {PerformanceResourceTiming[]} */ (performance.getEntriesByType('resource'));
    const nav = /** @type {PerformanceNavigationTiming} */ (performance.getEntriesByType('navigation')[0]);
    const isFeed = (/** @type {string} */ u) => u.includes('feed.json') || u.includes('script.google');
    const shell = res.filter((r) => !isFeed(r.name)).reduce((n, r) => n + r.transferSize, nav ? nav.transferSize : 0);
    const feed = res.filter((r) => isFeed(r.name)).reduce((n, r) => n + r.transferSize, 0);
    const long = /** @type {any} */ (window).__bt?.long || [];
    return {
      content: Math.round(c),
      cache: at('bt:cache-data') == null ? null : Math.round(/** @type {number} */ (at('bt:cache-data'))),
      live: Math.round(/** @type {number} */ (at('bt:live-data'))),
      longTasks: long.length,
      longest: Math.round(Math.max(0, ...long.map((/** @type {number[]} */ l) => l[1]))),
      shellKB: Math.round(shell / 1024),
      feedKB: Math.round(feed / 1024),
      requests: res.length + 1,
    };
  }, content);
}

/**
 * Time one interaction inside the page: from just before the action to the first paint after the
 * screen has what the action asked for (`done`), the way a person sees it.
 * @param {import('playwright').Page} page
 * @param {{ act: string, done: string }} it  act: JS run in the page (returns nothing); done: JS predicate
 */
export async function timeInteraction(page, it) {
  return page.evaluate(
    async ({ act, done }) => {
      const doneFn = new Function(`return (${done});`);
      const t0 = performance.now();
      new Function(act)();
      const start = performance.now();
      while (!doneFn()) {
        await new Promise((r) => setTimeout(r, 0));
        if (performance.now() - start > 20_000) throw new Error(`not done: ${done}`);
      }
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      return performance.now() - t0;
    },
    { act: it.act, done: it.done },
  );
}

const $ = (/** @type {string} */ id) => `document.querySelector('[data-testid="${id}"]')`;
const click = (/** @type {string} */ sel) => `document.querySelector(${JSON.stringify(sel)}).click();`;

/**
 * The common interactions. Each starts from `path` (a hash route, loaded with the feed in place),
 * `prep` (optional, run untimed) and is timed from `act` to the paint after `done`. `reset` undoes it
 * so it can be repeated for a median.
 * @type {Array<{ id: string, name: string, path: string, ready: string, prep?: string, act: string, done: string, reset?: string, resetDone?: string }>}
 */
export const INTERACTIONS = [
  {
    id: 'route', name: 'Route change (Resumen → Explorador)', path: '/', ready: 'source-shadow',
    act: click('.tabbar a[data-tab="explorer"]'), done: `!!${$('explorer-count')}`,
    reset: click('.tabbar a[data-tab="overview"]'), resetDone: `!!${$('source-shadow')}`,
  },
  {
    id: 'sheet', name: 'Open the filter sheet', path: '/explorer', ready: 'explorer-count',
    act: click('[data-testid="filter-button"]'), done: `!!${$('filter-live-count')}`,
    reset: click('.sheet-head .icon-btn'), resetDone: `!${$('filter-sheet')}`,
  },
  {
    id: 'chip', name: 'Toggle a tag chip (sheet open)', path: '/explorer', ready: 'explorer-count',
    prep: click('[data-testid="filter-button"]'),
    act: click('[data-testid="fchip-tags-near_value"]'), done: `${$('fchip-tags-near_value')}.getAttribute('aria-pressed') === 'true'`,
    reset: click('[data-testid="fchip-tags-near_value"]'), resetDone: `${$('fchip-tags-near_value')}.getAttribute('aria-pressed') === 'false'`,
  },
  {
    // One keystroke (the list, the counts and the summary follow every letter).
    id: 'search', name: 'Type a letter in the Explorer search', path: '/explorer', ready: 'explorer-count',
    act: `const el = document.querySelector('.ex-search input'); el.focus(); el.value += 'a'; el.dispatchEvent(new Event('input', { bubbles: true })); window.__q = el.value;`,
    done: `location.hash.includes('q=' + window.__q)`,
    reset: `const el = document.querySelector('.ex-search input'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));`,
    resetDone: `!/q=/.test(location.hash)`,
  },
  {
    id: 'stake', name: 'Change the Simulator stake', path: '/simulator?src=shadow', ready: 'sim-profit',
    act: click('[data-testid="sim-stake-2"]'), done: `${$('sim-stake-2')}.getAttribute('aria-pressed') === 'true'`,
    reset: click('[data-testid="sim-stake-1"]'), resetDone: `${$('sim-stake-1')}.getAttribute('aria-pressed') === 'true'`,
  },
  {
    id: 'test', name: 'Expand a test', path: '/tests', ready: 'frozen-table',
    act: click('.tests-row-btn'), done: `document.querySelector('.tests-row-btn').getAttribute('aria-expanded') === 'true' && !!document.querySelector('.tests-panel')`,
    reset: click('.tests-row-btn'), resetDone: `document.querySelector('.tests-row-btn').getAttribute('aria-expanded') === 'false'`,
  },
  {
    id: 'pick', name: 'Open a pick', path: '/explorer', ready: 'explorer-count',
    act: click('.pick-card'), done: `!!${$('pick-notes')}`,
    reset: click('.sheet-head .icon-btn'), resetDone: `!${$('pick-sheet')} && !!document.querySelector('.pick-card')`,
  },
  {
    id: 'dim', name: 'Switch the Analysis dimension', path: '/analysis', ready: 'analysis-bars',
    act: `const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'market') && x.value !== 'market'); s.value = 'market'; s.dispatchEvent(new Event('change', { bubbles: true }));`,
    done: `/dim=market/.test(location.hash)`,
    reset: `const s = [...document.querySelectorAll('select')].find((x) => x.value === 'market'); s.value = 'tag'; s.dispatchEvent(new Event('change', { bubbles: true }));`,
    resetDone: `!/dim=market/.test(location.hash)`,
  },
  {
    id: 'page', name: 'Next page in the Explorer', path: '/explorer', ready: 'explorer-count',
    act: click('.pager button:last-child'), done: `/page=2/.test(location.hash)`,
    reset: click('.pager button:first-child'), resetDone: `!/page=2/.test(location.hash)`,
  },
];

/** @param {number[]} xs */
export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

/**
 * Run one interaction `n` times on a loaded page and return the median and the max (ms).
 * @param {import('playwright').Page} page @param {(typeof INTERACTIONS)[number]} it @param {number} [n]
 */
export async function measureInteraction(page, it, n = 3) {
  if (it.prep) await page.evaluate((js) => new Function(js)(), it.prep);
  await page.waitForTimeout(200);
  const times = [];
  for (let i = 0; i < n; i++) {
    times.push(await timeInteraction(page, it));
    if (it.reset) {
      await page.evaluate((js) => new Function(js)(), it.reset);
      await page.waitForFunction((d) => new Function(`return (${d});`)(), it.resetDone, { timeout: 30_000 });
      await page.waitForTimeout(150);
    }
  }
  return { median: Math.round(median(times)), max: Math.round(Math.max(...times)), times: times.map(Math.round) };
}
