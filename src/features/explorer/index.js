import { ExplorerScreen } from './explorer-screen.js';

/** @type {import('../registry.js').Feature} */
export const feature = {
  id: 'explorer',
  titleKey: 'nav.explorer',
  icon: 'explorer',
  nav: 'tab',
  order: 2,
  i18n: true,
  routes: [{ path: '/explorer', component: ExplorerScreen }],
};
