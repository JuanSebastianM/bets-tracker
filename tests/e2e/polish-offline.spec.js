// The installed app offline: the deployable site (scripts/build-site.mjs output, service worker
// stamped) is served on a second port under a made-up host name, because the app turns its service
// worker off on localhost and 127.0.0.1. After one online load the network is cut and every route
// must open from the service worker's shell and the feed copy in IndexedDB.
import { test, expect } from 'playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROUTES } from './helpers.js';

const ROOT = resolve(import.meta.dirname, '../..');
const PORT = Number(process.env.E2E_PORT || 4173) + 50;
const HOST = 'bt-offline.test';
const ORIGIN = `http://${HOST}:${PORT}`;

test.describe.configure({ mode: 'serial' });
test.use({
  serviceWorkers: 'allow',
  launchOptions: {
    args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${ORIGIN}`],
    executablePath: !process.env.CI ? '/usr/bin/google-chrome' : undefined,
  },
});

/** @type {import('node:child_process').ChildProcess | null} */
let server = null;
let dir = '';

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bt-site-'));
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-site.mjs'), dir], { stdio: 'ignore' });
  server = spawn(process.execPath, [join(ROOT, 'scripts/serve.mjs'), '--port', String(PORT), '--root', dir], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/index.html`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('site server did not start');
});

test.afterAll(() => {
  server?.kill();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('every route opens offline from the shell and the saved feed', async ({ page, context }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${ORIGIN}/?feed=fixture#/`);
  await expect(page.getByTestId('source-shadow')).toBeVisible();
  // The worker installed the whole shell and controls the page; the feed copy is in IndexedDB.
  await expect.poll(() => page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active) && Boolean(navigator.serviceWorker.controller);
  }), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('bets-tracker');
    r.onsuccess = () => {
      const g = r.result.transaction('feed').objectStore('feed').get('fixture');
      g.onsuccess = () => res(!!g.result);
      g.onerror = () => res(false);
    };
    r.onerror = () => res(false);
  }))).toBe(true);
  const shell = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((k) => k.startsWith('bt-shell-')));
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  for (const f of ['/src/lib/links.js', '/src/lib/ui/use-terms.js', '/src/content/rules.es.json', '/src/features/glossary/glossary.css', '/manifest.webmanifest']) {
    expect(shell, f).toContain(f);
  }

  await context.setOffline(true);
  for (const r of ROUTES) {
    // A full load each time (a hash change alone would not reload the page).
    await page.goto('about:blank');
    await page.goto(`${ORIGIN}/?feed=fixture#${r.path}`);
    await expect(page.getByRole('heading', { level: 1 }), r.path).toHaveText(r.title);
    await expect(page.getByTestId(r.ready), r.path).toBeVisible();
    await expect(page.getByTestId('banner-stale'), r.path).toContainText('Sin conexión');
  }
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
