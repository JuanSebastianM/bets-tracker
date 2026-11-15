// Display labels of the Analysis groups: the sheet's own labels for tags (tagLabel), shared filter
// labels where the filter panel has them, and the section's own strings for bands and weekdays.
import { t } from '../../lib/i18n.js';
import { formatMonth, formatPct } from '../../lib/format.js';
import { tagLabel } from '../../data/tags.js';
import { PRICE_PRESETS } from '../../data/filters.js';
import { PROB_BANDS, EV_BANDS } from '../../data/analysis.js';
import { optionLabel } from '../../lib/ui/index.js';
import { lineLabel } from '../../data/lines.js';

/** A band as text ("40–50%", "< 0%", "≥ 20%"). @param {{ min: number, max: number }} b @param {boolean} signed */
function bandText(b, signed) {
  const f = (/** @type {number} */ v) => (signed ? formatPct(v, { digits: 0 }) : formatPct(v, { sign: false, digits: 0 }));
  if (!Number.isFinite(b.min) || (!signed && b.min === 0)) return `< ${f(b.max)}`;
  if (!Number.isFinite(b.max) || (!signed && b.max === 1)) return `≥ ${f(b.min)}`;
  return t('analysis.band', { lo: f(b.min), hi: f(b.max) });
}

/**
 * Label of one group of a dimension.
 * @param {string} dimId @param {string} key
 */
export function groupLabel(dimId, key) {
  switch (dimId) {
    case 'tag':
      return tagLabel(/** @type {any} */ (key));
    case 'market':
      return t(`markets.${key}`);
    case 'source':
      return t(`sources.${key}`);
    case 'priceBand':
      return PRICE_PRESETS.find((p) => p.id === key)?.label || key;
    case 'month':
      return formatMonth(key);
    case 'weekday':
      return t(`analysis.weekday.${key}`);
    case 'probBand': {
      const b = PROB_BANDS.find((x) => x.id === key);
      return b ? bandText(b, false) : key;
    }
    case 'evBand': {
      const b = EV_BANDS.find((x) => x.id === key);
      return b ? bandText(b, true) : key;
    }
    case 'ref':
      return optionLabel('refs', key);
    case 'fuerza':
      return optionLabel('fuerza', key);
    case 'reason':
      return optionLabel('reasons', key);
    case 'sample':
      return key === '6-9' ? '6–9' : key;
    case 'line':
      return lineLabel(key, { scope: true });
    default:
      return key;
  }
}

/** Name of a dimension ("Etiqueta", "Banda de cuota"). @param {string} dimId */
export const dimLabel = (dimId) => t(`analysis.dim.${dimId}`);
