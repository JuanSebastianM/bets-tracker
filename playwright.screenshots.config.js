// `npm run screenshots`: phone (390×844) and desktop (1280×800) screenshots of every route in both
// themes, written to $SCREENSHOT_DIR (default /home/claude/review/foundation, outside the repo).
import base from './playwright.config.js';
import { defineConfig } from 'playwright/test';

export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: /screenshots\.spec\.js$/,
  retries: 0,
  failOnFlakyTests: false,
  timeout: 60_000,
});
