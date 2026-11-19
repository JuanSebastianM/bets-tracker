// Boot: feed (cache first, then live) alongside strings -> theme -> render -> service worker.
import { html, render } from '../vendor/preact.js';
import { loadStrings, syncDocumentLang } from './lib/i18n.js';
import { applyWaitingUpdate, registerServiceWorker } from './lib/pwa.js';
import { i18nFeatureIds } from './features/registry.js';
import { applyTheme, settingsStore, watchSystemTheme } from './data/settings.js';
import { startFeed } from './data/store.js';
import { App } from './app.js';

async function boot() {
  syncDocumentLang();
  if (await applyWaitingUpdate()) return; // page reloads into the new version
  // The feed (cached copy and live fetch) starts now, alongside the strings, not after the first
  // render: on a slow phone the data is ready sooner (docs/PERFORMANCE.md). normalize needs no strings.
  startFeed().catch((e) => console.error('feed failed', e));
  await loadStrings(i18nFeatureIds);
  applyTheme(settingsStore.get().theme);
  watchSystemTheme();
  const root = /** @type {HTMLElement} */ (document.getElementById('app'));
  root.textContent = '';
  render(html`<${App} />`, root);
  registerServiceWorker().catch((e) => console.warn('Service worker registration failed', e));
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('boot-error')?.removeAttribute('hidden');
  document.getElementById('boot-splash')?.setAttribute('hidden', '');
});
