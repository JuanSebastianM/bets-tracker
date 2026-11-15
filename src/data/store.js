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
  const cached = await readCache(mode);
  if (cached) {
    const data = build(cached.feed);
    if (data) feedStore.set((s) => ({ ...s, status: 'ready', data, fetchedAt: cached.fetchedAt, fromCache: true, version: s.version + 1 }));
  }
  await refreshFeed({ url, fetchImpl: opts.fetchImpl });
}

/**
 * Fetch the live feed now. Keeps the shown data when it fails.
 * @param {{ url?: string, fetchImpl?: typeof fetch }} [opts]
 */
export async function refreshFeed(opts = {}) {
  const s0 = feedStore.get();
  const url = opts.url ?? feedUrl(s0.mode);
  if (!url) return;
  feedStore.set((s) => ({ ...s, refreshing: true }));
  const r = await fetchFeed(url, opts.fetchImpl);
  if (r.ok) {
    const data = build(r.feed);
    if (data) {
      const fetchedAt = new Date().toISOString();
      await writeCache(feedStore.get().mode, { feed: r.feed, fetchedAt });
      feedStore.set((s) => ({ ...s, status: 'ready', data, fetchedAt, fromCache: false, refreshing: false, error: null, version: s.version + 1 }));
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
