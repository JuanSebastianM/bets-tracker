// App shell: header (title, sync stamp, refresh), feed banners, route outlet, bottom bar on phones,
// side rail on wide screens, the "Más" page, toasts.
import { html, useEffect, useRef } from '../vendor/preact.js';
import { t, useLocale } from './lib/i18n.js';
import { useLocation, resolveRoute, navigate, href } from './lib/router.js';
import { features, routes as featureRoutes } from './features/registry.js';
import { Icon, IconButton, Banner, Toaster, Button } from './lib/ui/index.js';
import { useFeed, refreshFeed } from './data/store.js';
import { formatAgo } from './lib/format.js';
import { formatDateTime } from './lib/i18n.js';
import { APP_TIMEZONE } from './config.js';
import { APP_VERSION } from './version.js';
import { scriptVersionStatus } from './data/feed.js';
import { useStore } from './lib/store.js';
import { scriptVersionDismissed, scriptVersionKey, dismissScriptVersion } from './lib/script-version.js';

const DEFAULT_PATH = '/';

/** The "Más" page: sections that are not in the bottom bar. */
function MorePage() {
  const more = features.filter((f) => f.nav === 'more');
  return html`<div class="more stack">
    <section class="card nav-card">
      <ul class="nav-list">
        ${more.map(
          (f) => html`<li>
            <a href=${href(f.routes[0].path)} data-testid=${`more-${f.id}`}>
              <${Icon} name=${f.icon} />
              <span class="grow"><span>${t(f.titleKey)}</span>${f.descKey ? html`<span class="muted">${t(f.descKey)}</span>` : null}</span>
              <${Icon} name="chevron-right" size=${18} />
            </a>
          </li>`,
        )}
      </ul>
    </section>
  </div>`;
}

const shellRoutes = [{ path: '/more', component: MorePage, featureId: 'more', titleKey: 'nav.more' }];
const allRoutes = [...featureRoutes, ...shellRoutes];

/** Bottom bar entries: the 'tab' features plus "Más". */
const TABS = [
  ...features.filter((f) => f.nav === 'tab').map((f) => ({ id: f.id, path: f.routes[0].path, icon: f.icon, titleKey: f.titleKey })),
  { id: 'more', path: '/more', icon: 'more', titleKey: 'nav.more' },
];
const MORE_IDS = new Set(['more', ...features.filter((f) => f.nav === 'more').map((f) => f.id)]);

/** "Sincronizado hace 2 min · hoja leída 10:05" plus the refresh button. */
function SyncStamp() {
  const s = useFeed();
  useLocale();
  const generated = s.data?.generatedAt;
  return html`<div class="sync-stamp" data-testid="sync-stamp">
    <span class="stamp-lines">
      ${s.fetchedAt ? html`<span>${t('feed.synced', { ago: formatAgo(s.fetchedAt) })}</span>` : null}
      ${generated ? html`<span>${t('feed.sheetRead', { time: formatDateTime(generated, APP_TIMEZONE) })}</span>` : null}
    </span>
    ${s.status !== 'unconfigured'
      ? html`<${IconButton}
          icon="refresh"
          label=${t('feed.refresh')}
          class=${s.refreshing ? 'is-refreshing' : ''}
          onClick=${() => refreshFeed()}
          disabled=${s.refreshing}
          data-testid="refresh"
        />`
      : null}
  </div>`;
}

/** Sections that show the "missing columns" banner (the others would only repeat it on every page). */
const MISSING_BANNER_ON = new Set(['overview', 'settings']);

/** Sections that show the "different feed script" banner (Settings says what to do). */
const SCRIPT_BANNER_ON = new Set(['overview', 'settings']);

/**
 * A calm note when the sheet runs another version of apps-script/Feed.gs than this app expects (or one
 * from before the version existed). The data keeps showing: an older script is still a valid, scrubbed
 * feed. Dismissible for the session.
 * @param {{ meta: any, featureId: string }} props
 */
function ScriptVersionBanner({ meta, featureId }) {
  const dismissed = useStore(scriptVersionDismissed);
  const v = scriptVersionStatus(meta);
  if (v.state === 'current' || dismissed === scriptVersionKey(v)) return null;
  return html`<${Banner} tone="info" testId="banner-script-version" title=${t('feed.scriptVersion.bannerTitle')}>
    <p>${t('feed.scriptVersion.bannerBody')}</p>
    <div class="row-wrap">
      ${featureId !== 'settings' ? html`<${Button} variant="secondary" href=${href('/settings')} data-testid="banner-script-version-settings">${t('feed.scriptVersion.bannerOpen')}</${Button}>` : null}
      <${Button} variant="ghost" onClick=${() => dismissScriptVersion(v)} data-testid="banner-script-version-dismiss">${t('feed.scriptVersion.bannerDismiss')}</${Button}>
    </div>
  </${Banner}>`;
}

/**
 * Fixture and offline / cached banners above every page; the missing-columns banner only on the
 * Overview and Settings.
 * @param {{ featureId: string }} props
 */
function FeedBanners({ featureId }) {
  const s = useFeed();
  useLocale();
  const out = [];
  if (s.mode === 'fixture') out.push(html`<${Banner} tone="info" testId="banner-fixture">${t('feed.fixtureBanner')}</${Banner}>`);
  if (s.data && s.error) {
    out.push(html`<${Banner}
      tone=${s.error.code === 'offline' ? 'offline' : 'warning'}
      testId="banner-stale"
      title=${s.error.code === 'offline' ? t('feed.offlineTitle') : t('feed.staleTitle')}
      action=${html`<${Button} variant="ghost" onClick=${() => refreshFeed()}>${t('feed.retry')}</${Button}>`}
      >${t('feed.showingCached', { ago: formatAgo(s.fetchedAt) })}</${Banner}>`);
  }
  const missing = s.data?.meta?.missingHeaders || [];
  if (missing.length && MISSING_BANNER_ON.has(featureId)) out.push(html`<${Banner} tone="warning" testId="banner-missing">${t('feed.missingHeaders', { list: missing.join(', ') })}</${Banner}>`);
  if (s.data && SCRIPT_BANNER_ON.has(featureId)) out.push(html`<${ScriptVersionBanner} meta=${s.data.meta} featureId=${featureId} />`);
  return out.length ? html`<div class="stack-sm banners">${out}</div>` : null;
}

function TabBar({ activeId }) {
  return html`<nav class="tabbar" aria-label=${t('nav.main')}>
    <ul>
      ${TABS.map((tab) => {
        const active = tab.id === 'more' ? MORE_IDS.has(activeId) : tab.id === activeId;
        return html`<li>
          <a class="tab" href=${href(tab.path)} aria-current=${active ? 'page' : undefined} data-tab=${tab.id}>
            <${Icon} name=${tab.icon} size=${22} />
            <span>${t(tab.titleKey)}</span>
          </a>
        </li>`;
      })}
    </ul>
  </nav>`;
}

function Rail({ activeId }) {
  const main = features.filter((f) => f.nav === 'tab');
  const more = features.filter((f) => f.nav === 'more');
  const item = (/** @type {any} */ f) => html`<li>
    <a href=${href(f.routes[0].path)} aria-current=${f.id === activeId ? 'page' : undefined} data-rail=${f.id}>
      <${Icon} name=${f.icon} size=${20} /><span>${t(f.titleKey)}</span>
    </a>
  </li>`;
  return html`<nav class="rail" aria-label=${t('nav.main')}>
    <div class="rail-brand"><img src="assets/icons/icon-192.png" alt="" width="32" height="32" /><span>${t('app.name')}</span></div>
    <ul>${main.map(item)}</ul>
    <div class="rail-sep"></div>
    <ul>${more.map(item)}</ul>
    <div class="rail-foot">${t('app.readOnly')} · ${APP_VERSION}</div>
  </nav>`;
}

function Header({ title, path }) {
  const h1 = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const first = useRef(true);
  // Move focus to the new page title on navigation (not on first load) for screen readers.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    h1.current?.focus({ preventScroll: true });
  }, [path]);
  return html`<header class="app-header">
    <div class="app-header-inner">
      <h1 class="app-title" tabindex="-1" ref=${h1}>${title}</h1>
      <${SyncStamp} />
    </div>
  </header>`;
}

export function App() {
  const locale = useLocale();
  const loc = useLocation();
  const match = resolveRoute(allRoutes, loc.path);

  useEffect(() => {
    if (!match) navigate(DEFAULT_PATH, { replace: true });
  }, [match]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.path]);
  useEffect(() => {
    if (match) document.title = `${t(match.route.titleKey)} · ${t('app.name')}`;
  }, [loc.path, locale]);

  if (!match) return null;
  const { route, params } = match;
  const Screen = route.component;
  return html`<div class="app" data-locale=${locale}>
    <a class="skip-link" href="#main" onClick=${(/** @type {Event} */ e) => {
      e.preventDefault();
      document.getElementById('main')?.focus();
    }}>${t('app.skipToContent')}</a>
    <${Rail} activeId=${route.featureId} />
    <${Header} title=${t(route.titleKey)} path=${loc.path} />
    <main id="main" class="app-main" tabindex="-1" data-route=${route.path}>
      <div class="stack">
        <${FeedBanners} featureId=${route.featureId} />
        <${Screen} key=${loc.path + locale} params=${params} query=${loc.query} />
      </div>
    </main>
    <${TabBar} activeId=${route.featureId} />
    <${Toaster} />
  </div>`;
}
