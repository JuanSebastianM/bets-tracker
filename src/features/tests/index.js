import { TestsScreen } from './tests-screen.js';

/** @type {import('../registry.js').Feature} */
export const feature = {
  id: 'tests',
  titleKey: 'nav.tests',
  icon: 'tests',
  nav: 'tab',
  order: 4,
  i18n: true,
  descKey: 'nav.desc.tests',
  routes: [{ path: '/tests', component: TestsScreen }],
};
