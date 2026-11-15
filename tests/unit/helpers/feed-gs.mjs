// Loads apps-script/Feed.gs into a fresh node:vm context (no Apps Script globals), so its pure
// builder and its cache wrapper can be tested in Node.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

export const FEED_GS_PATH = join(resolve(import.meta.dirname, '../../..'), 'apps-script/Feed.gs');
export const FEED_GS_SOURCE = readFileSync(FEED_GS_PATH, 'utf8');

/** @returns {Record<string, any>} the script's globals */
export function loadFeedGs(extraGlobals = {}) {
  const ctx = vm.createContext({ ...extraGlobals });
  vm.runInContext(FEED_GS_SOURCE, ctx, { filename: 'Feed.gs' });
  return ctx;
}

/** Header rows exactly as the sheet has them, for building synthetic tab values. */
export function headerOf(gs, tabKey) {
  return gs.BT_FEED_TABS[tabKey].columns.map((c) => c[0]);
}
