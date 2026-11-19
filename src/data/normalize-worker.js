// Builds the dataset from a feed off the main thread (src/data/store.js buildDataset), so a slow
// phone keeps drawing and answering taps while thousands of picks are parsed. Same code as on the
// main thread: normalizeFeed. Messages: { id, feed } in, { id, ok, data } out.
import { normalizeFeed } from './normalize.js';

self.onmessage = (/** @type {MessageEvent<{ id: number, feed: import('./types').Feed }>} */ e) => {
  const { id, feed } = e.data;
  try {
    self.postMessage({ id, ok: true, data: normalizeFeed(feed) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
