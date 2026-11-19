// Settings (complete in the foundation): language, theme, the user's own bankroll and unit value
// (this device only), default stake, saved filter presets, feed status, about.
import { html } from '../../../vendor/preact.js';
import { t, setLocale, useLocale, formatDateTime } from '../../lib/i18n.js';
import { Card, SegmentedControl, NumberField, TextField, Button, Banner, Chip, Icon } from '../../lib/ui/index.js';
import { formatAgo, formatAmount, formatCount, formatUnits } from '../../lib/format.js';
import { useSettings, updateSettings, clearMoney, bankrollUnits, deletePreset } from '../../data/settings.js';
import { useFeed, refreshFeed, clearFeedCache } from '../../data/store.js';
import { toast } from '../../lib/toast.js';
import { href } from '../../lib/router.js';
import { APP_TIMEZONE, FEED_SCHEMA, FEED_URL, FEED_SCRIPT_DOCS_URL } from '../../config.js';
import { scriptVersionStatus } from '../../data/feed.js';
import { APP_VERSION } from '../../version.js';
import { updateStore, applyUpdate, isServiceWorkerDisabled, isStandalone } from '../../lib/pwa.js';
import { useStore } from '../../lib/store.js';

function Appearance() {
  const locale = useLocale();
  const s = useSettings();
  return html`<${Card} title=${t('settings.appearance')} testId="settings-appearance">
    <${SegmentedControl}
      label=${t('settings.language')}
      name="language"
      value=${locale}
      onValue=${(/** @type {any} */ v) => setLocale(v)}
      options=${[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]}
    />
    <${SegmentedControl}
      label=${t('settings.theme')}
      name="theme"
      value=${s.theme}
      onValue=${(/** @type {any} */ v) => updateSettings({ theme: v })}
      options=${['auto', 'light', 'dark'].map((v) => ({ value: v, label: t(`settings.themes.${v}`) }))}
    />
  </${Card}>`;
}

function Money() {
  const s = useSettings();
  const units = bankrollUnits(s);
  return html`<${Card} title=${t('settings.money')} subtitle=${t('settings.moneyIntro')} testId="settings-money">
    <${Banner} tone="info">${t('settings.deviceOnly')}</${Banner}>
    <div class="grid-2">
      <${NumberField} label=${t('settings.bankroll')} value=${s.bankroll} onValue=${(/** @type {number | null} */ v) => updateSettings({ bankroll: v })} testId="input-bankroll" />
      <${NumberField} label=${t('settings.unitValue')} value=${s.unitValue} onValue=${(/** @type {number | null} */ v) => updateSettings({ unitValue: v })} testId="input-unit" />
    </div>
    <${TextField}
      label=${t('settings.currency')}
      value=${s.currency}
      maxLength=${8}
      placeholder=${t('settings.currencyPlaceholder')}
      hint=${t('settings.currencyHint')}
      onValue=${(/** @type {string} */ v) => updateSettings({ currency: v })}
    />
    <p class="small muted" data-testid="bankroll-units">
      ${units != null
        ? t('settings.bankrollInUnits', { units: formatUnits(units, { sign: false }), bankroll: formatAmount(s.bankroll, s.currency) })
        : t('settings.bankrollUnset')}
    </p>
    <${NumberField}
      label=${t('settings.defaultStake')}
      value=${s.defaultStake}
      unit="u"
      hint=${t('settings.defaultStakeHint')}
      onValue=${(/** @type {number | null} */ v) => updateSettings({ defaultStake: v ?? 1 })}
    />
    ${s.bankroll || s.unitValue || s.currency
      ? html`<div><${Button} variant="danger" icon="trash" onClick=${() => { clearMoney(); toast(t('settings.moneyCleared')); }}>${t('settings.clearMoney')}</${Button}></div>`
      : null}
  </${Card}>`;
}

function Presets() {
  const s = useSettings();
  return html`<${Card} title=${t('settings.presets')} subtitle=${t('settings.presetsIntro')}>
    ${s.presets.length
      ? html`<ul class="settings-presets">
          ${s.presets.map(
            (p) => html`<li>
              <a href=${href(`/explorer?${p.query}`)}>${p.name}</a>
              <${Button} variant="ghost" icon="trash" onClick=${() => deletePreset(p.id)} aria-label=${t('settings.deletePreset', { name: p.name })}>${t('common.delete')}</${Button}>
            </li>`,
          )}
        </ul>`
      : html`<p class="muted small">${t('settings.presetsEmpty')}</p>`}
  </${Card}>`;
}

/**
 * Whether the sheet runs the feed script this app expects (meta.scriptVersion), and what to do when not.
 * @param {{ meta: any }} props
 */
function ScriptVersion({ meta }) {
  const v = scriptVersionStatus(meta);
  const ok = v.state === 'current';
  return html`<div class=${`settings-script${ok ? ' is-current' : ''}`} data-testid="feed-script" data-state=${v.state}>
    <h3 class="settings-script-title">${t('settings.scriptVersion')}</h3>
    <dl class="kv">
      <dt>${t('settings.scriptDeployed')}</dt>
      <dd class="num" data-testid="feed-script-deployed">${v.deployed ? html`<code>${v.deployed}</code>` : t('settings.scriptNone')}</dd>
      <dt>${t('settings.scriptExpected')}</dt>
      <dd class="num" data-testid="feed-script-expected"><code>${v.expected}</code></dd>
    </dl>
    <p class="settings-script-state" data-testid="feed-script-state">
      <${Icon} name=${ok ? 'check' : 'info'} size=${18} />
      <span>${ok ? t('settings.scriptCurrent') : v.state === 'missing' ? t('settings.scriptMissing') : t('settings.scriptDifferent')}</span>
    </p>
    ${ok
      ? null
      : html`<p class="small">${t('settings.scriptStillValid')}</p>
          <p class="small" data-testid="feed-script-todo">${t('settings.scriptWhatToDo')}</p>
          <p class="small"><a href=${FEED_SCRIPT_DOCS_URL} target="_blank" rel="noopener noreferrer" data-testid="feed-script-docs">${t('settings.scriptDocs')}</a></p>`}
  </div>`;
}

/**
 * One note about the script's five-minute cache (round 2: when the versions differed there were two
 * similar ones): how old a refresh can be and, when the script version differs, when to check again.
 * @param {{ meta: any }} props
 */
function CacheNote({ meta }) {
  const minutes = Math.round((meta.cacheTtlSeconds || 300) / 60);
  const differs = scriptVersionStatus(meta).state !== 'current';
  if (!meta.cacheTtlSeconds && !differs) return null;
  return html`<p class="small muted" data-testid="feed-cache-note">${t('settings.cacheNote', { minutes })}${differs ? ` ${t('settings.scriptCacheNote', { minutes })}` : ''}</p>`;
}

function FeedStatus() {
  const f = useFeed();
  useLocale();
  const meta = f.data?.meta;
  const rows = meta?.rows || {};
  const missing = meta?.missingHeaders || [];
  const source = f.status === 'unconfigured' ? t('settings.feedSourceNone') : f.mode === 'fixture' ? t('settings.feedSourceFixture') : t('settings.feedSourceLive');
  return html`<${Card} title=${t('settings.feed')} testId="settings-feed">
    <dl class="kv">
      <dt>${t('settings.feedSource')}</dt><dd data-testid="feed-source">${source}</dd>
      <dt>${t('settings.feedSynced')}</dt><dd>${f.fetchedAt ? `${formatDateTime(f.fetchedAt, APP_TIMEZONE)} (${formatAgo(f.fetchedAt)})` : '–'}</dd>
      <dt>${t('settings.feedGenerated')}</dt><dd data-testid="feed-generated">${f.data ? formatDateTime(f.data.generatedAt, APP_TIMEZONE) : '–'}</dd>
      <dt>${t('settings.feedFromCache')}</dt><dd>${f.data ? (f.fromCache ? t('common.yes') : t('common.no')) : '–'}</dd>
      ${['bets', 'shadow', 'grok', 'decisions', 'pinnacle', 'rules'].map(
        (k) => html`<dt>${t(`settings.tabs.${k}`)}</dt><dd class="num" data-testid=${`rows-${k}`}>${rows[k] != null ? formatCount(rows[k]) : '–'}</dd>`,
      )}
      <dt>${t('settings.redactions')}</dt><dd class="num" data-testid="feed-redactions">${meta ? meta.redactions : '–'}</dd>
      <dt>${t('settings.missingHeaders')}</dt>
      <dd data-testid="feed-missing">${meta ? (missing.length ? html`<span class="row-wrap kv-chips">${missing.map((m) => html`<${Chip} tone="pending">${m}</${Chip}>`)}</span>` : t('settings.none')) : '–'}</dd>
    </dl>
    ${meta ? html`<${ScriptVersion} meta=${meta} />` : null}
    ${meta ? html`<${CacheNote} meta=${meta} />` : null}
    ${meta && meta.redactions ? html`<${Banner} tone="warning">${t('settings.redactionsNote', { count: meta.redactions, n: meta.redactions })}</${Banner}>` : null}
    ${f.error ? html`<${Banner} tone="warning" title=${t('settings.lastError')}>${t(`feed.error.${f.error.code}`, { detail: f.error.detail })}</${Banner}>` : null}
    <div class="row-wrap">
      <${Button} variant="primary" icon="refresh" onClick=${() => refreshFeed()} disabled=${f.refreshing || f.status === 'unconfigured'}>${t('feed.refresh')}</${Button}>
      <${Button}
        variant="secondary"
        icon="trash"
        disabled=${f.status === 'unconfigured'}
        onClick=${async () => {
          await clearFeedCache();
          toast(t('settings.cacheCleared'));
        }}
      >${t('settings.clearCache')}</${Button}>
    </div>
  </${Card}>`;
}

/** Whether this copy of the app is the newest one (the service worker's update flow, src/lib/pwa.js). */
function AppStatus() {
  const { ready } = useStore(updateStore);
  const off = isServiceWorkerDisabled() || !('serviceWorker' in navigator);
  const text = off ? t('settings.appOffline') : ready ? t('settings.appUpdate') : isStandalone() ? t('settings.appUpToDateInstalled') : t('settings.appUpToDate');
  return html`<dt>${t('settings.appStatus')}</dt>
    <dd data-testid="app-status">
      <span>${text}</span>
      ${ready && !off ? html` <${Button} variant="primary" icon="refresh" onClick=${() => applyUpdate()} data-testid="app-update">${t('pwa.reload')}</${Button}>` : null}
    </dd>`;
}

function About() {
  return html`<${Card} title=${t('settings.about')}>
    <p class="small">${t('settings.aboutBody')}</p>
    <dl class="kv">
      <dt>${t('settings.version')}</dt><dd class="num" data-testid="app-version">${APP_VERSION}</dd>
      <${AppStatus} />
      <dt>${t('settings.schema')}</dt><dd class="num">${FEED_SCHEMA}</dd>
      <dt>${t('settings.feedUrl')}</dt><dd>${FEED_URL ? t('settings.feedUrlSet') : t('settings.feedUrlUnset')}</dd>
    </dl>
  </${Card}>`;
}

export function SettingsScreen() {
  return html`<div class="settings stack">
    <${Appearance} />
    <${Money} />
    <${Presets} />
    <${FeedStatus} />
    <${About} />
  </div>`;
}
