// Registers the real dictionaries (shared and per feature) so t() works in Node tests.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { registerStrings, setLocale } from '../../../src/lib/i18n.js';

const root = resolve(import.meta.dirname, '../../..');
export function loadAllStrings(locale = 'es') {
  for (const l of ['es', 'en']) {
    registerStrings(l, null, JSON.parse(readFileSync(join(root, `src/i18n/${l}.json`), 'utf8')));
    for (const id of readdirSync(join(root, 'src/features'))) {
      const p = join(root, `src/features/${id}/i18n/${l}.json`);
      if (existsSync(p)) registerStrings(l, id, JSON.parse(readFileSync(p, 'utf8')));
    }
  }
  setLocale(locale);
}
