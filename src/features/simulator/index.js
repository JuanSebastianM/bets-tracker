import { SimulatorScreen } from './simulator-screen.js';

/** @type {import('../registry.js').Feature} */
export const feature = {
  id: 'simulator',
  titleKey: 'nav.simulator',
  icon: 'simulator',
  nav: 'tab',
  order: 3,
  i18n: true,
  descKey: 'nav.desc.simulator',
  routes: [{ path: '/simulator', component: SimulatorScreen }],
};
