// Links between sections that carry a filter state (the shared filters of src/data/filters.js).
//   explorerHref({ tags: ['near_value'] })  -> '#/explorer?tag=near_value'
import { href } from './router.js';
import { toQueryString, defaultFilters } from '../data/filters.js';

/**
 * Hash link to the Explorer with a filter state (a partial state is completed with the defaults).
 * @param {Partial<import('../data/filters.js').FilterState>} f
 */
export function explorerHref(f = {}) {
  const qs = toQueryString({ ...defaultFilters(), ...f });
  return href(qs ? `/explorer?${qs}` : '/explorer');
}

/** The media query from which the filter panel sits in a side column instead of a sheet. */
export const SIDE_PANEL_QUERY = '(min-width: 1200px)';
