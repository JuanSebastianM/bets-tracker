// Opt-in: writes the speech stream and the audit of every route (phone and desktop, Spanish and
// English, light and dark) to $A11Y_DUMP, for reading by hand. `A11Y_DUMP=/tmp/ax npm run test:e2e -- tests/e2e/a11y-dump.spec.js`
import { test } from 'playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTES, openApp } from './helpers.js';
import { auditPage, speechStream } from './a11y-audit.js';

const DIR = process.env.A11Y_DUMP;
test.skip(!DIR, 'set A11Y_DUMP=<dir> to write the dumps');

const VIEWS = [
  { name: 'phone', width: 390, height: 844, phone: true },
  { name: 'desktop', width: 1280, height: 900, phone: false },
];
for (const v of VIEWS) {
  for (const locale of /** @type {const} */ (['es', 'en'])) {
    for (const theme of ['light', 'dark']) {
      test(`dump ${v.name} ${locale} ${theme}`, async ({ page }) => {
        test.setTimeout(180_000);
        await page.setViewportSize({ width: v.width, height: v.height });
        mkdirSync(DIR, { recursive: true });
        const all = [];
        for (const r of ROUTES) {
          await openApp(page, r.path, { locale, settings: { theme } });
          await page.getByTestId(r.ready).first().waitFor();
          const { issues } = await auditPage(page, { locale, phone: v.phone });
          all.push(`## ${r.path}`, ...issues.map((i) => `${i.rule}\t${i.where}\t${i.detail}`));
          if (theme === 'light') {
            const lines = await speechStream(page);
            const slug = r.path.replace(/[^a-z0-9]+/gi, '_') || 'root';
            writeFileSync(join(DIR, `speech-${v.name}-${locale}${slug}.txt`), lines.join('\n'));
          }
        }
        writeFileSync(join(DIR, `issues-${v.name}-${locale}-${theme}.txt`), all.join('\n'));
      });
    }
  }
}
