// Spoken forms of figures for screen readers (docs/ACCESSIBILITY.md, "Spoken forms"). The visible
// figure stays as it is; these strings go into sr-only text or an aria-label next to it.
//
//   spokenRecord({ won: 7, lost: 10, void: 2 })   '7 ganadas, 10 perdidas, 2 nulas'
//   spokenRecord({ won: 15, lost: 19, void: 0, halfWon: 1 })  '15 ganadas, 19 perdidas, 1 media'
import { t } from './i18n.js';

/**
 * A record in words: the parts that are not zero, each with its noun ("7–10–2" alone is read as a
 * date, a subtraction or a phone number). Wins and losses are always said, even at 0.
 * @param {{ won: number, lost: number, void?: number, halfWon?: number, halfLost?: number }} s
 */
export function spokenRecord(s) {
  const won = s.won || 0;
  const lost = s.lost || 0;
  const voids = s.void || 0;
  const halves = (s.halfWon || 0) + (s.halfLost || 0);
  if (!won && !lost && !voids && !halves) return t('a11y.recordEmpty');
  const parts = [t('a11y.won', { count: won, n: won }), t('a11y.lost', { count: lost, n: lost })];
  if (voids) parts.push(t('a11y.void', { count: voids, n: voids }));
  if (halves) parts.push(t('a11y.halves', { count: halves, n: halves }));
  return parts.join(', ');
}

/**
 * The `lang` to put on an element that shows sheet text (notes, decisions, the sheet's own tag
 * labels), which is always Spanish: 'es' when the UI is in another language, so a screen reader
 * switches voice; undefined when the UI is already Spanish (the page's own lang covers it).
 * @param {string} locale the UI locale (useLocale() / getLocale())
 */
export const sheetLang = (locale) => (locale === 'es' ? undefined : 'es');
