// App data state: the dataset built from the feed, where it came from and how fresh it is.
//
//   const { status, data, fetchedAt, fromCache, error } = useFeed();
//   const picks = usePicks();                       // Pick[] ([] until loaded)
//   startFeed();                                     // once at boot (main.js)
//   refreshFeed();                                   // the refresh button

import { createStore, useStore } from '../lib/store.js';
import { useMemo } from '../../vendor/preact.js';
import { clearCache, feedMode, feedUrl, fetchFeed, readCache, writeCache } from './feed.js';
import { normalizeFeed } from './normalize.js';

/** @typedef {import('./types').Dataset} Dataset */
/** @typedef {import('./types').Pick} Pick */

/**
 * @typedef {object} FeedState
 * @property {'live' | 'fixture'} mode
 * @property {'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'} status
 *   ready = data is shown (maybe from cache); error = nothing to show
 * @property {Dataset | null} data
 * @property {string | null} fetchedAt  when the shown data was fetched (ISO)
 * @property {boolean} fromCache        shown data is the cached copy (live fetch not done or failed)
 * @property {boolean} refreshing       a live fetch is in flight
 * @property {{ code: string, detail: string } | null} error  last fetch error (data may still be shown)
 * @property {number} version           bumps on every new dataset (memo key)
 */

/** @type {FeedState} */
const initial = {
  mode: 'live',
  status: 'idle',
  data: null,
  fetchedAt: null,
  fromCache: false,
  refreshing: false,
  error: null,
  version: 0,
};

export const feedStore = createStore(initial);

/**
 * A User Timing mark for the slow-phone measurements (scripts/perf-phone.mjs, docs/PERFORMANCE.md):
 * when the cached and the live data were handed to the screens. Free when nobody reads it.
 * @param {string} name
 */
function mark(name) {
  try {
    performance.mark(name);
  } catch {
    /* no User Timing (old engine, Node without perf_hooks globals) */
  }
}

/** @type {Worker | null | false} the normalize worker; false once it failed (then the main thread builds) */
let worker = null;
let nextId = 1;

/**
 * Build the dataset off the main thread when the browser can (src/data/normalize-worker.js), on it
 * otherwise (Node tests, a browser without module workers, any worker error): same function, same
 * result (the dataset is plain data; tests/unit/slow-phone.test.mjs checks a structured clone of it
 * equals the original).
 * @param {import('./types').Feed} feed
 * @returns {Promise<Dataset | null>}
 */
function buildDataset(feed) {
  if (worker === false || typeof Worker === 'undefined' || typeof window === 'undefined') return Promise.resolve(build(feed));
  return new Promise((resolve) => {
    try {
      if (!worker) worker = new Worker(new URL('./normalize-worker.js', import.meta.url), { type: 'module' });
    } catch {
      worker = false;
      resolve(build(feed));
      return;
    }
    const w = worker;
    const id = nextId++;
    const done = (/** @type {Dataset | null} */ value) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      resolve(value);
    };
    const onMessage = (/** @type {MessageEvent} */ e) => {
      if (!e.data || e.data.id !== id) return;
      if (e.data.ok) done(e.data.data);
      else done(build(feed)); // logs the error the same way as before
    };
    const onError = () => {
      worker = false;
      w.terminate();
      done(build(feed));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    try {
      w.postMessage({ id, feed });
    } catch {
      onError();
    }
  });
}

/** @param {import('./types').Feed} feed */
function build(feed) {
  try {
    return normalizeFeed(feed);
  } catch (e) {
    console.error('normalize failed', e);
    return null;
  }
}

/**
 * Boot: show the cache at once, then fetch the live feed and swap it in.
 * @param {{ mode?: 'live' | 'fixture', url?: string, fetchImpl?: typeof fetch }} [opts]
 */
export async function startFeed(opts = {}) {
  const mode = opts.mode || feedMode();
  const url = opts.url ?? feedUrl(mode);
  feedStore.set({ ...initial, mode, status: 'loading' });
  if (!url) {
    feedStore.set((s) => ({ ...s, status: 'unconfigured' }));
    return;
  }
  // The live fetch starts now, in parallel with reading and building the cached copy.
  const live = fetchFeed(url, opts.fetchImpl);
  const cached = await readCache(mode);
  if (cached) {
    // On the main thread: nothing is on screen yet, and handing the feed to a worker and the dataset
    // back costs more than it saves before the first paint (measured, docs/PERFORMANCE.md).
    const data = build(cached.feed);
    if (data) {
      shownFeed = cached.feed;
      feedStore.set((s) => ({ ...s, status: 'ready', data, fetchedAt: cached.fetchedAt, fromCache: true, version: s.version + 1 }));
    }
    mark('bt:cache-data');
  }
  await refreshFeed({ url, fetchImpl: opts.fetchImpl, pending: live });
}

/** The feed the shown dataset was built from (to tell whether a fetched feed is the same one). @type {import('./types').Feed | null} */
let shownFeed = null;

/**
 * Whether two feeds are the same answer of the script. `generatedAt` is when the script read the
 * sheet, and the script caches its answer (DATA_CONTRACT, "Abuse and limits"), so the same instant
 * means the same answer: nothing to rebuild or re-render.
 * @param {import('./types').Feed | null} a @param {import('./types').Feed} b
 */
export function sameFeed(a, b) {
  return !!a && !!a.generatedAt && a.generatedAt === b.generatedAt && a.schema === b.schema;
}

/**
 * Run after the next paint in a browser (writing the cache clones the whole feed on the main thread,
 * so it waits until the new data is on screen); at once elsewhere (Node tests), returning its promise.
 * @param {() => Promise<void>} fn
 * @returns {Promise<void> | undefined}
 */
function afterPaint(fn) {
  if (typeof requestAnimationFrame !== 'function') return fn();
  requestAnimationFrame(() => setTimeout(fn, 0));
  return undefined;
}

/**
 * Fetch the live feed now. Keeps the shown data when it fails.
 * @param {{ url?: string, fetchImpl?: typeof fetch, pending?: Promise<import('./feed.js').FetchResult> }} [opts]
 *   pending: a fetch already started (startFeed starts it before reading the cache)
 */
export async function refreshFeed(opts = {}) {
  const s0 = feedStore.get();
  const url = opts.url ?? feedUrl(s0.mode);
  if (!url) return;
  feedStore.set((s) => ({ ...s, refreshing: true }));
  const r = await (opts.pending || fetchFeed(url, opts.fetchImpl));
  if (r.ok && r.feed) {
    const feed = r.feed;
    const fetchedAt = new Date().toISOString();
    const mode = feedStore.get().mode;
    // The same answer as the one on screen (the usual case on a repeat open: the script caches it):
    // keep the dataset, so nothing is rebuilt or drawn again; only the sync stamp moves.
    if (feedStore.get().data && sameFeed(shownFeed, feed)) {
      feedStore.set((s) => ({ ...s, fetchedAt, fromCache: false, refreshing: false, error: null }));
      mark('bt:live-data');
      await afterPaint(() => writeCache(mode, { feed, fetchedAt }));
      return;
    }
    // A new answer while the cached one is on screen: built in the worker, so the screen keeps
    // answering taps; with nothing on screen yet, on the main thread (sooner to the first paint).
    const data = feedStore.get().data ? await buildDataset(feed) : build(feed);
    if (data) {
      shownFeed = feed;
      feedStore.set((s) => ({ ...s, status: 'ready', data, fetchedAt, fromCache: false, refreshing: false, error: null, version: s.version + 1 }));
      mark('bt:live-data');
      // Saved after the new data is on screen, not before.
      await afterPaint(() => writeCache(mode, { feed, fetchedAt }));
      return;
    }
    feedStore.set((s) => ({ ...s, refreshing: false, status: s.data ? 'ready' : 'error', error: { code: 'invalid', detail: 'normalize' } }));
    return;
  }
  feedStore.set((s) => ({ ...s, refreshing: false, status: s.data ? 'ready' : 'error', error: { code: r.code || 'invalid', detail: r.detail || '' } }));
}

/** Clear the cached feed (Settings) and fetch again. */
export async function clearFeedCache() {
  await clearCache();
  feedStore.set((s) => ({ ...s, fromCache: false }));
  await refreshFeed();
}

/** @returns {FeedState} */
export function useFeed() {
  return useStore(feedStore);
}

/** @type {Pick[]} */
const NO_PICKS = [];

/** All picks of the current dataset ([] until loaded). @returns {Pick[]} */
export function usePicks() {
  return useStore(feedStore, (s) => (s.data ? s.data.picks : NO_PICKS));
}

/** The current dataset or null. @returns {Dataset | null} */
export function useDataset() {
  return useStore(feedStore, (s) => s.data);
}

/**
 * Memoise a derived value on the dataset version plus extra keys (filter query string…).
 * @template T
 * @param {(data: Dataset) => T} fn
 * @param {any[]} [keys]
 * @returns {T | null}
 */
export function useDerived(fn, keys = []) {
  const s = useFeed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (s.data ? fn(s.data) : null), [s.version, ...keys]);
}
