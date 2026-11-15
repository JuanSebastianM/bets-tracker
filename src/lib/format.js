// Number formatting: the only place that turns figures into text (docs/ARCHITECTURE.md, Conventions).
//
//   formatPrice(1.833)            '1.833'   (2 decimals, 3 when the sheet has 3)
//   formatUnits(2.5)              '+2.50u'
//   formatPct(0.0312)             '+3.1%'   formatPct(0.55, { sign: false }) '55.0%'
//   formatRecord(summary)         '31-22-3'
//   formatMoney(2.5, settings)    units times the user's own unit value plus their currency label, or ''
//   formatDate('2026-11-15')      '15 nov 2026'
import { formatDate as i18nFormatDate, formatNumber, getLocale } from './i18n.js';

export { i18nFormatDate as formatDate };

const MINUS = '−';

/** @param {number | null | undefined} n */
const bad = (n) => n == null || !Number.isFinite(Number(n));

/** Decimal separator is always '.', the way the sheet and the books write prices. */
function fixed(/** @type {number} */ n, /** @type {number} */ d) {
  return Math.abs(n).toFixed(d);
}

/**
 * Decimal odds: 2 decimals, or 3 when the value has a third (4.333, 1.909). Averages and other
 * computed prices pass { average: true } and always get 2.
 * @param {number | null | undefined} n
 * @param {{ average?: boolean }} [opts]
 */
export function formatPrice(n, opts = {}) {
  if (bad(n)) return '–';
  const v = Number(n);
  if (opts.average) return v.toFixed(2);
  const three = Math.abs(Math.round(v * 1000) - Math.round(v * 100) * 10) > 0;
  return v.toFixed(three ? 3 : 2);
}

/**
 * Units with sign and 2 decimals: '+2.74u', '−1.00u', '0.00u'.
 * @param {number | null | undefined} n
 * @param {{ sign?: boolean, suffix?: string }} [opts]
 */
export function formatUnits(n, opts = {}) {
  if (bad(n)) return '–';
  const v = Math.round(Number(n) * 100) / 100;
  const sign = opts.sign === false || v === 0 ? (v < 0 ? MINUS : '') : v > 0 ? '+' : MINUS;
  return `${sign}${fixed(v, 2)}${opts.suffix ?? 'u'}`;
}

/**
 * A fraction as a percentage with 1 decimal: 0.0312 -> '+3.1%'. sign defaults to true.
 * @param {number | null | undefined} x
 * @param {{ sign?: boolean, digits?: number }} [opts]
 */
export function formatPct(x, opts = {}) {
  if (bad(x)) return '–';
  const d = opts.digits ?? 1;
  const v = Number(x) * 100;
  const r = Number(v.toFixed(d));
  const sign = opts.sign === false ? (r < 0 ? MINUS : '') : r > 0 ? '+' : r < 0 ? MINUS : '';
  return `${sign}${fixed(r, d)}%`;
}

/** A probability: 0.552 -> '55.2%'. @param {number | null | undefined} x */
export const formatProb = (x) => formatPct(x, { sign: false });

/**
 * Win-loss-void record: '31-22-3'; half results add a suffix: '31-22-3 (+2½)'.
 * @param {{ won: number, lost: number, void: number, halfWon?: number, halfLost?: number }} s
 */
export function formatRecord(s) {
  const base = `${s.won}-${s.lost}${s.void ? `-${s.void}` : ''}`;
  const halves = (s.halfWon || 0) + (s.halfLost || 0);
  return halves ? `${base} (+${halves}½)` : base;
}

/** An integer count with locale grouping. @param {number} n */
export const formatCount = (n) => formatNumber(n, { maximumFractionDigits: 0 });

/**
 * Money from units with the user's own unit value (Settings). '' when no unit value is set.
 * @param {number | null | undefined} units
 * @param {{ unitValue: number | null, currency: string }} settings
 * @param {{ sign?: boolean }} [opts]
 */
export function formatMoney(units, settings, opts = {}) {
  if (bad(units) || !settings || !settings.unitValue) return '';
  const v = Number(units) * settings.unitValue;
  const body = formatNumber(Math.abs(v), { maximumFractionDigits: 0 });
  const sign = opts.sign === false ? (v < 0 ? MINUS : '') : v > 0 ? '+' : v < 0 ? MINUS : '';
  return `${sign}${body}${settings.currency ? ` ${settings.currency}` : ''}`;
}

/** A plain amount of money the user typed (bankroll), no sign. */
export function formatAmount(/** @type {number | null} */ v, /** @type {string} */ currency = '') {
  if (bad(v)) return '';
  return `${formatNumber(Number(v), { maximumFractionDigits: 0 })}${currency ? ` ${currency}` : ''}`;
}

/** 'YYYY-MM' -> 'nov 2026'. @param {string} ym */
export function formatMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat(getLocale() === 'en' ? 'en-US' : 'es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/**
 * Relative time of an ISO instant ("hace 5 min").
 * @param {string | null} iso @param {number} [now]
 */
export function formatAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const s = Math.round((Date.parse(iso) - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(getLocale() === 'en' ? 'en-US' : 'es-CO', { numeric: 'auto' });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

/** Today's date (YYYY-MM-DD) in a time zone. @param {string} tz @param {Date} [d] */
export function todayIn(tz, d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * A score with a fixed number of decimals and '.' as separator (Brier: 0.244). Added by Analysis.
 * @param {number | null | undefined} x @param {number} [digits]
 */
export function formatScore(x, digits = 3) {
  if (bad(x)) return '–';
  return Number(x).toFixed(digits);
}
