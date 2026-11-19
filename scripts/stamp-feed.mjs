// Stamps the feed script's version (npm run feed:stamp).
//
// The version is the first 12 hex characters of the SHA-256 of apps-script/Feed.gs with the value of
// BT_FEED_SCRIPT_VERSION left empty (line endings normalised to \n), so it changes whenever anything
// else in the file changes and cannot be forgotten. This script writes it into:
//   - apps-script/Feed.gs        (var BT_FEED_SCRIPT_VERSION = '…';)  what the deployed script reports
//   - src/feed-version.js        (FEED_SCRIPT_VERSION)                 what the app expects
//   - tests/fixtures/feed.json   (meta.scriptVersion)                  so the fixture matches the app
// `node scripts/stamp-feed.mjs --check` writes nothing and exits 1 when any of them is stale;
// tests/unit/fixes-feed-version.test.mjs runs the same check.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
export const FEED_GS = join(root, 'apps-script/Feed.gs');
export const APP_MODULE = join(root, 'src/feed-version.js');
export const FIXTURE = join(root, 'tests/fixtures/feed.json');

/** The constant in Feed.gs (one line, single quotes). */
const GS_CONSTANT = /^(var BT_FEED_SCRIPT_VERSION = ')([0-9a-f]*)(';)$/m;
/** The export in src/feed-version.js. */
const APP_CONSTANT = /^(export const FEED_SCRIPT_VERSION = ')([0-9a-f]*)(';)$/m;
/** meta.scriptVersion in the fixture (the generator writes meta on one line per key). */
const FIXTURE_FIELD = /("scriptVersion": ")([0-9a-f]*)(")/;

/**
 * The version of a Feed.gs source: SHA-256 of the source with the constant's value blanked.
 * @param {string} source
 * @returns {string} 12 lower-case hex characters
 */
export function feedScriptVersion(source) {
  const text = String(source).replace(/\r\n?/g, '\n');
  if (!GS_CONSTANT.test(text)) throw new Error('Feed.gs has no BT_FEED_SCRIPT_VERSION constant');
  const blank = text.replace(GS_CONSTANT, (_, head, _value, tail) => head + tail);
  return createHash('sha256').update(blank, 'utf8').digest('hex').slice(0, 12);
}

/** The value written in a file, by its pattern; null when absent. @param {string} text @param {RegExp} re */
const stamped = (text, re) => {
  const m = re.exec(text);
  return m ? m[2] : null;
};

/** What each file holds now and what it should hold. */
export function stampStatus() {
  const gs = readFileSync(FEED_GS, 'utf8');
  const version = feedScriptVersion(gs);
  return {
    version,
    feedGs: stamped(gs, GS_CONSTANT),
    app: stamped(readFileSync(APP_MODULE, 'utf8'), APP_CONSTANT),
    fixture: stamped(readFileSync(FIXTURE, 'utf8'), FIXTURE_FIELD),
  };
}

function main() {
  const check = process.argv.includes('--check');
  const s = stampStatus();
  const stale = ['feedGs', 'app', 'fixture'].filter((k) => s[/** @type {'feedGs'|'app'|'fixture'} */ (k)] !== s.version);
  if (check) {
    if (stale.length) {
      console.error(`feed script version ${s.version}: stale in ${stale.join(', ')}. Run npm run feed:stamp.`);
      process.exit(1);
    }
    console.log(`feed script version ${s.version}: up to date`);
    return;
  }
  const write = (/** @type {string} */ file, /** @type {RegExp} */ re) => {
    const text = readFileSync(file, 'utf8');
    if (!re.test(text)) throw new Error(`${file}: no version field to stamp`);
    writeFileSync(file, text.replace(re, (_, head, _value, tail) => head + s.version + tail));
  };
  write(FEED_GS, GS_CONSTANT);
  write(APP_MODULE, APP_CONSTANT);
  write(FIXTURE, FIXTURE_FIELD);
  // Stamping Feed.gs must not change its own version (the value is blanked before hashing).
  if (feedScriptVersion(readFileSync(FEED_GS, 'utf8')) !== s.version) throw new Error('stamp is not stable');
  console.log(`feed script version ${s.version} stamped in Feed.gs, src/feed-version.js and the fixture`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
