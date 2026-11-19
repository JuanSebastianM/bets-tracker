// Results that survive a screen's remount. A screen is keyed on its path, so opening a pick
// (#/explorer/:uid) or coming back to a section builds the screen again; without this every list,
// summary and curve of the whole dataset would be computed again on a slow phone.
//
//   const list = memoLast('explorer.list', [data, queryString, sort, dir, today], () => sortPicks(...));
//
// Keys are compared by identity (the dataset object changes with every new feed, so nothing stale
// is ever returned). Each slot keeps its last few results.

/** @type {Map<string, Array<{ keys: any[], value: any }>>} */
const slots = new Map();

/**
 * @template T
 * @param {string} slot   a name unique to the computation
 * @param {any[]} keys    everything the result depends on
 * @param {() => T} compute
 * @param {number} [size] results kept per slot
 * @returns {T}
 */
export function memoLast(slot, keys, compute, size = 4) {
  let list = slots.get(slot);
  if (!list) slots.set(slot, (list = []));
  const i = list.findIndex((e) => e.keys.length === keys.length && e.keys.every((k, j) => k === keys[j]));
  if (i >= 0) {
    const hit = list[i];
    if (i > 0) list.splice(0, 0, ...list.splice(i, 1));
    return hit.value;
  }
  const value = compute();
  list.unshift({ keys, value });
  if (list.length > size) list.length = size;
  return value;
}

/** Forget every slot (tests). */
export function clearMemo() {
  slots.clear();
}
