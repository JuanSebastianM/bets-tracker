import { GlossaryScreen } from './glossary-screen.js';

/** @type {import('../registry.js').Feature} */
export const feature = {
  id: 'glossary',
  titleKey: 'nav.glossary',
  icon: 'glossary',
  nav: 'more',
  order: 7,
  i18n: true,
  descKey: 'nav.desc.glossary',
  routes: [{ path: '/glossary', component: GlossaryScreen }, { path: '/glossary/:term', component: GlossaryScreen }],
};
