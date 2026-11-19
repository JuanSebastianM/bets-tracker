// The "different feed script" banner's dismissal, for this browser session only (sessionStorage):
// dismissing hides it on the Overview and Settings until the tab is closed, or until the sheet reports
// another version (the key is the pair deployed → expected).
import { createStore } from './store.js';
import { STORAGE_PREFIX } from '../config.js';

const KEY = `${STORAGE_PREFIX}feedScriptDismissed`;

/** @returns {Storage | null} */
function ss() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** The pair a dismissal is for. @param {{ deployed: string | null, expected: string }} s */
export const scriptVersionKey = (s) => `${s.deployed || 'none'}>${s.expected}`;

function read() {
  try {
    return ss()?.getItem(KEY) || null;
  } catch {
    return null;
  }
}

/** The dismissed pair (or null). */
export const scriptVersionDismissed = createStore(/** @type {string | null} */ (read()));

/** Hide the banner for this pair until the session ends. @param {{ deployed: string | null, expected: string }} s */
export function dismissScriptVersion(s) {
  const k = scriptVersionKey(s);
  try {
    ss()?.setItem(KEY, k);
  } catch {
    /* private mode: the dismissal lasts until reload */
  }
  scriptVersionDismissed.set(k);
}
