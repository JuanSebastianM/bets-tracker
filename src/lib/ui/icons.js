// Line icons (24×24, stroke = currentColor). <Icon name="refresh" size={20} />.
// Add new icons here; never rotate an existing one to fake another.
import { html } from '../../../vendor/preact.js';

/** @type {Record<string, string>} SVG inner markup */
const PATHS = {
  overview: '<path d="M4 13h4v7H4zM10 4h4v16h-4zM16 9h4v11h-4z"/>',
  explorer: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  simulator: '<path d="M3 17l5-6 4 4 4-7 5 5"/><path d="M3 21h18"/>',
  tests: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  analysis: '<path d="M12 3v9l7.5 4.5"/><circle cx="12" cy="12" r="9"/>',
  decisions: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  glossary: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
  filter: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  'chevron-down': '<path d="M5 9l7 7 7-7"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  won: '<path d="M5 12l5 5 9-10"/>',
  lost: '<path d="M6 6l12 12M18 6L6 18"/>',
  void: '<path d="M5 12h14"/>',
  pending: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  half: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warning: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  offline: '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><path d="M3 3l18 18"/><circle cx="12" cy="19" r="1"/>',
  table: '<path d="M3 5h18v14H3zM3 10h18M3 15h18M9 5v14"/>',
  chart: '<path d="M3 20h18"/><path d="M4 16l5-5 4 3 7-8"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  sort: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
};

export const ICON_NAMES = Object.keys(PATHS);

/**
 * @param {{ name: string, size?: number, class?: string, label?: string }} props
 *   label: accessible name; without it the icon is decorative (aria-hidden).
 */
export function Icon({ name, size = 22, class: cls = '', label }) {
  const inner = PATHS[name] || PATHS.info;
  return html`<svg
    class=${`icon ${cls}`}
    width=${size}
    height=${size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden=${label ? undefined : 'true'}
    role=${label ? 'img' : undefined}
    aria-label=${label}
    dangerouslySetInnerHTML=${{ __html: inner }}
  ></svg>`;
}
