import { SettingsScreen } from './settings-screen.js';

/** @type {import('../registry.js').Feature} */
export const feature = {
  id: 'settings',
  titleKey: 'nav.settings',
  icon: 'settings',
  nav: 'more',
  order: 8,
  i18n: true,
  descKey: 'nav.desc.settings',
  routes: [{ path: '/settings', component: SettingsScreen }],
};
