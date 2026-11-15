// App-wide constants.

/**
 * URL of the Apps Script web app that serves the feed (apps-script/Feed.gs), ending in /exec.
 * Empty until the script is deployed: the app then shows "feed not configured" unless the page is
 * opened with ?feed=fixture (synthetic data from tests/fixtures/feed.json).
 */
export const FEED_URL = '';

/** Feed schema this app understands. A newer schema is refused with a clear message. */
export const FEED_SCHEMA = 1;

/** Path of the synthetic fixture feed, relative to the app root. */
export const FIXTURE_URL = 'tests/fixtures/feed.json';

/** The sheet's time zone for "today" (slate dates are Bogotá match dates). */
export const APP_TIMEZONE = 'America/Bogota';

export const LOCALES = /** @type {const} */ (['es', 'en']);
export const DEFAULT_LOCALE = 'es';
/** BCP-47 tags used for Intl formatting per app locale. */
export const INTL_LOCALE = { es: 'es-CO', en: 'en-US' };

/** localStorage key prefix for everything the app stores on the device. */
export const STORAGE_PREFIX = 'bt.';

/** Rows per page in lists. */
export const PAGE_SIZE = 50;
