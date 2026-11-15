// URL state of the Analysis section: the part in the path (#/analysis/breakdown), the shared filters
// in the query (src/data/filters.js keys), and the section's own view keys, which are kept across
// parts so switching tabs keeps the chosen dimension, sort and series.
//
//   #/analysis/breakdown?src=shadow&dim=priceBand&measure=yield&minn=20
import { toQueryString } from '../../data/filters.js';
import { DIMENSION_IDS, SORTS, sortDefaultDir, CAL_SERIES } from '../../data/analysis.js';

export const PARTS = ['breakdown', 'calibration', 'close', 'grok'];
export const MEASURES = ['ev', 'yield'];
export const SMALL_MODES = ['grey', 'hide'];
export const MIN_N_MAX = 50;

/**
 * @typedef {object} View
 * @property {string} dim      first dimension
 * @property {string} dim2     second dimension ('' = none)
 * @property {string} sort     SORTS id
 * @property {'asc' | 'desc'} dir
 * @property {string} measure  'ev' (fair-close EV) or 'yield'
 * @property {number} minn     minimum graded picks before a group counts as large enough
 * @property {string} small    'grey' or 'hide' for groups under minn
 * @property {string} series   calibration series
 */

/** @type {View} */
export const DEFAULT_VIEW = { dim: 'tag', dim2: '', sort: 'natural', dir: 'asc', measure: 'ev', minn: 10, small: 'grey', series: 'model' };

/** The part of a path param, validated. @param {string | undefined} p */
export const partOf = (p) => (p && PARTS.includes(p) ? p : 'breakdown');

/** The view of a route query, validated. @param {Record<string, string>} q @returns {View} */
export function viewOf(q = {}) {
  const dim = DIMENSION_IDS.includes(q.dim) ? q.dim : DEFAULT_VIEW.dim;
  const dim2 = DIMENSION_IDS.includes(q.dim2) && q.dim2 !== dim ? q.dim2 : '';
  const sort = SORTS.includes(q.sort) ? q.sort : DEFAULT_VIEW.sort;
  const dir = q.dir === 'asc' || q.dir === 'desc' ? q.dir : /** @type {'asc' | 'desc'} */ (sortDefaultDir(sort));
  const measure = MEASURES.includes(q.measure) ? q.measure : DEFAULT_VIEW.measure;
  const n = Math.floor(Number(q.minn));
  const minn = q.minn != null && q.minn !== '' && Number.isFinite(n) ? Math.max(0, Math.min(MIN_N_MAX, n)) : DEFAULT_VIEW.minn;
  const small = SMALL_MODES.includes(q.small) ? q.small : DEFAULT_VIEW.small;
  const series = CAL_SERIES.some((s) => s.id === q.series) ? q.series : DEFAULT_VIEW.series;
  return { dim, dim2, sort, dir, measure, minn, small, series };
}

/**
 * Query string of a filter state and a view (view keys only when not the default).
 * @param {import('../../data/filters.js').FilterState} f @param {View} v
 */
export function viewQuery(f, v) {
  const parts = [toQueryString(f)];
  if (v.dim !== DEFAULT_VIEW.dim) parts.push(`dim=${v.dim}`);
  if (v.dim2) parts.push(`dim2=${v.dim2}`);
  if (v.sort !== DEFAULT_VIEW.sort) parts.push(`sort=${v.sort}`);
  if (v.dir !== sortDefaultDir(v.sort)) parts.push(`dir=${v.dir}`);
  if (v.measure !== DEFAULT_VIEW.measure) parts.push(`measure=${v.measure}`);
  if (v.minn !== DEFAULT_VIEW.minn) parts.push(`minn=${v.minn}`);
  if (v.small !== DEFAULT_VIEW.small) parts.push(`small=${v.small}`);
  if (v.series !== DEFAULT_VIEW.series) parts.push(`series=${v.series}`);
  return parts.filter(Boolean).join('&');
}

/**
 * Hash path of a part with filters and view. `bare` keeps the plain '/analysis' path (the breakdown
 * opened without a part): changing the path remounts the screen, so a change of filters or view must
 * keep the path the screen was opened on.
 * @param {string} part @param {any} f @param {View} v @param {boolean} [bare]
 */
export function analysisPath(part, f, v, bare = false) {
  const qs = viewQuery(f, v);
  return `/analysis${bare ? '' : `/${part}`}${qs ? `?${qs}` : ''}`;
}
