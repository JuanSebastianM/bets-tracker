// Feature registry: each section exports `feature` from src/features/<id>/index.js. The shell builds
// the routes, the bottom bar (nav 'tab'), the "Más" list (nav 'more') and the side rail from it.
import { feature as overview } from './overview/index.js';
import { feature as explorer } from './explorer/index.js';
import { feature as simulator } from './simulator/index.js';
import { feature as tests } from './tests/index.js';
import { feature as analysis } from './analysis/index.js';
import { feature as decisions } from './decisions/index.js';
import { feature as glossary } from './glossary/index.js';
import { feature as settings } from './settings/index.js';

/**
 * @typedef {object} Route
 * @property {string} path            e.g. '/glossary/:term'
 * @property {(props: { params: Record<string, string>, query: Record<string, string> }) => any} component
 * @property {string} [titleKey]      header title (defaults to the feature's titleKey)
 */

/**
 * @typedef {object} Feature
 * @property {string} id              folder name, i18n namespace, CSS scope class
 * @property {string} titleKey        e.g. 'nav.overview'
 * @property {string} icon            icon name (src/lib/ui/icons.js)
 * @property {'tab' | 'more'} nav     bottom bar on phones, or the "Más" page
 * @property {number} order
 * @property {Route[]} routes
 * @property {boolean} [i18n]         has src/features/<id>/i18n/{es,en}.json (keys under t('<id>.…'))
 * @property {string} [descKey]       one line shown in the "Más" list
 */

/** @type {Feature[]} */
export const features = [overview, explorer, simulator, tests, analysis, decisions, glossary, settings].sort((a, b) => a.order - b.order);

/** Every route with its feature id. */
export const routes = features.flatMap((f) => f.routes.map((r) => ({ ...r, featureId: f.id, titleKey: r.titleKey || f.titleKey })));

/** Feature ids that ship their own strings. */
export const i18nFeatureIds = features.filter((f) => f.i18n).map((f) => f.id);
