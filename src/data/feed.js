// Loads the feed: cached copy (IndexedDB) at once, then the live feed (stale-while-revalidate).
// The live URL is FEED_URL (src/config.js); '?feed=fixture' loads the synthetic fixture instead and
// keeps its own cache entry, so fixture data never mixes with real data.

import { FEED_SCHEMA, FEED_URL, FIXTURE_URL } from '../config.js';

/** @typedef {import('./types').Feed} Feed */

/**
 * @typedef {'ok' | 'invalid' | 'schema_newer' | 'schema_older' | 'feed_error'} ValidationCode
 */

/**
 * Check a parsed JSON value against schema 1's shape. Never throws.
 * @param {unknown} json
 * @returns {{ ok: true, feed: Feed } | { ok: false, code: ValidationCode, detail: string }}
 */
export function validateFeed(json) {
  const j = /** @type {any} */ (json);
  if (!j || typeof j !== 'object') return { ok: false, code: 'invalid', detail: 'not an object' };
  if (typeof j.error === 'string') return { ok: false, code: 'feed_error', detail: j.error };
  if (typeof j.schema !== 'number') return { ok: false, code: 'invalid', detail: 'no schema' };
  if (j.schema > FEED_SCHEMA) return { ok: false, code: 'schema_newer', detail: `schema ${j.schema}` };
  if (j.schema < FEED_SCHEMA) return { ok: false, code: 'schema_older', detail: `schema ${j.schema}` };
  if (!j.tabs || typeof j.tabs !== 'object') return { ok: false, code: 'invalid', detail: 'no tabs' };
  for (const k of ['bets', 'shadow', 'grok', 'decisions', 'pinnacle']) {
    const t = j.tabs[k];
    if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows) || t.columns[0] !== 'row') {
      return { ok: false, code: 'invalid', detail: `tab ${k}` };
    }
  }
  if (!Array.isArray(j.tabs.rules)) return { ok: false, code: 'invalid', detail: 'tab rules' };
  if (!j.meta || typeof j.meta !== 'object') j.meta = { rows: {}, redactions: 0, missingHeaders: [] };
  if (!Array.isArray(j.meta.missingHeaders)) j.meta.missingHeaders = [];
  if (typeof j.meta.redactions !== 'number') j.meta.redactions = 0;
  return { ok: true, feed: j };
}

/** Which feed the page asked for: 'fixture' with ?feed=fixture, else 'live'. @param {string} [search] */
export function feedMode(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search).get('feed') === 'fixture' ? 'fixture' : 'live';
}

/** The URL to fetch for a mode, or '' when the live feed is not configured. @param {'live' | 'fixture'} mode */
export function feedUrl(mode, liveUrl = FEED_URL) {
  return mode === 'fixture' ? FIXTURE_URL : liveUrl;
}

/**
 * @typedef {object} FetchResult
 * @property {boolean} ok
 * @property {Feed} [feed]
 * @property {'offline' | 'http' | 'parse' | ValidationCode} [code]
 * @property {string} [detail]
 */

/**
 * Fetch and validate a feed. Apps Script answers /exec with a redirect to googleusercontent.com,
 * so redirects are followed; nothing is cached by the browser.
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<FetchResult>}
 */
export async function fetchFeed(url, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(url, { redirect: 'follow', cache: 'no-store', credentials: 'omit' });
  } catch (e) {
    return { ok: false, code: 'offline', detail: String(e) };
  }
  if (!res.ok) return { ok: false, code: 'http', detail: `HTTP ${res.status}` };
  let json;
  try {
    json = await res.json();
  } catch (e) {
    return { ok: false, code: 'parse', detail: String(e) };
  }
  const v = validateFeed(json);
  return v.ok ? { ok: true, feed: v.feed } : { ok: false, code: v.code, detail: v.detail };
}

// ---------------------------------------------------------------- IndexedDB cache

const DB_NAME = 'bets-tracker';
const STORE = 'feed';
/** In-memory fallback when IndexedDB is unavailable (Node tests, private modes). */
const memory = new Map();

/** @returns {Promise<IDBDatabase | null>} */
function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * @typedef {object} CachedFeed
 * @property {Feed} feed
 * @property {string} fetchedAt ISO instant of the fetch
 */

/** @param {'live' | 'fixture'} mode @returns {Promise<CachedFeed | null>} */
export async function readCache(mode) {
  const db = await openDb();
  if (!db) return memory.get(mode) || null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(mode);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** @param {'live' | 'fixture'} mode @param {CachedFeed} value */
export async function writeCache(mode, value) {
  const db = await openDb();
  if (!db) {
    memory.set(mode, value);
    return;
  }
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, mode);
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Remove every cached feed. */
export async function clearCache() {
  memory.clear();
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
