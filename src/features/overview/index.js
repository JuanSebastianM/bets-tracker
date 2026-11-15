import { OverviewScreen } from './overview-screen.js';

/** @type {import('../registry.js').Feature} */
export const feature = {
  id: 'overview',
  titleKey: 'nav.overview',
  icon: 'overview',
  nav: 'tab',
  order: 1,
  i18n: true,
  routes: [{ path: '/', component: OverviewScreen }],
};
