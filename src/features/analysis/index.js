import { AnalysisScreen } from './analysis-screen.js';

/** @type {import('../registry.js').Feature} */
export const feature = {
  id: 'analysis',
  titleKey: 'nav.analysis',
  icon: 'analysis',
  nav: 'more',
  order: 5,
  i18n: true,
  descKey: 'nav.desc.analysis',
  routes: [
    { path: '/analysis', component: AnalysisScreen },
    { path: '/analysis/:part', component: AnalysisScreen },
  ],
};
