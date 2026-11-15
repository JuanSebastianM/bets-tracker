import { DecisionsScreen } from './decisions-screen.js';

/** @type {import('../registry.js').Feature} */
export const feature = {
  id: 'decisions',
  titleKey: 'nav.decisions',
  icon: 'decisions',
  nav: 'more',
  order: 6,
  i18n: true,
  descKey: 'nav.desc.decisions',
  routes: [{ path: '/decisions', component: DecisionsScreen }],
};
