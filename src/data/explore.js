// Explorer helpers on Pick[]: sort orders, the Pinnacle row of a pick, previous / next in a list.
// Pure functions; the Explorer and the Simulator share them.
//
//   sortPicks(list, 'price', 'asc')
//   pinnacleFor(data.pinnacle, pick)        // the Pinnacle 1X2 row joined by parsed.pin.id, or null
//   neighbours(list, uid)                   // { prev, next, index }

import { byDate } from './normalize.js';
import { tagLabel } from './tags.js';

/** @typedef {import('./types').Pick} Pick */
/** @typedef {import('./types').PinnacleRow} PinnacleRow */

const STATUS_ORDER = { won: 0, half_won: 1, void: 2, half_lost: 3, lost: 4, pending: 5, other: 6 };
const fold = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Sortable fields: the value a pick sorts by (null sorts last in both directions).
 * @type {Record<string, (p: Pick) => number | string | null>}
 */
export const SORT_VALUES = {
  date: (p) => p.date || null,
  match: (p) => (p.match ? fold(p.match) : null),
  tag: (p) => fold(tagLabel(p.tag)),
  market: (p) => (p.marketRaw ? fold(p.marketRaw) : null),
  selection: (p) => (p.selection ? fold(p.selection) : null),
  price: (p) => p.price,
  close: (p) => p.closePrice,
  ev: (p) => p.ev,
  fairCloseEv: (p) => p.fairCloseEv,
  clv: (p) => p.clv,
  status: (p) => STATUS_ORDER[p.status] ?? 9,
};

/** Sort keys in menu order. */
export const SORT_KEYS = Object.keys(SORT_VALUES);

/** Default direction of each key (newest, highest first for numbers; A–Z for text). */
export const SORT_DEFAULT_DIR = /** @type {Record<string, 'asc' | 'desc'>} */ ({
  date: 'desc', match: 'asc', tag: 'asc', market: 'asc', selection: 'asc', price: 'desc', close: 'desc', ev: 'desc',
  fairCloseEv: 'desc', clv: 'desc', status: 'asc',
});

/**
 * A sorted copy. Ties keep chronological order (date, source, row), reversed with the direction.
 * @param {Pick[]} picks @param {string} [key] @param {'asc' | 'desc'} [dir]
 */
export function sortPicks(picks, key = 'date', dir = 'desc') {
  const get = SORT_VALUES[key] || SORT_VALUES.date;
  const k = dir === 'asc' ? 1 : -1;
  return [...picks].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
    if (va != null && vb != null && va !== vb) return va < vb ? -k : k;
    return k * byDate(a, b);
  });
}

/**
 * The Pinnacle row of a pick (joined by the notes' `pin id`), or null.
 * @param {PinnacleRow[]} pinnacle @param {Pick} p
 * @returns {PinnacleRow | null}
 */
export function pinnacleFor(pinnacle, p) {
  const id = p.parsed && p.parsed.pin ? p.parsed.pin.id : null;
  if (!id || !Array.isArray(pinnacle)) return null;
  return pinnacle.find((r) => String(r.id) === String(id)) || null;
}

/**
 * Previous and next pick around `uid` in a list.
 * @param {Pick[]} list @param {string} uid
 * @returns {{ index: number, prev: Pick | null, next: Pick | null }}
 */
export function neighbours(list, uid) {
  const index = list.findIndex((p) => p.uid === uid);
  if (index < 0) return { index, prev: null, next: null };
  return { index, prev: list[index - 1] || null, next: list[index + 1] || null };
}
