// Accessibility checks written by hand (no rule engine is available in the workspace or in CI):
// what a screen-reader, keyboard or low-vision user would meet on one rendered page.
//
//   const report = await auditPage(page, { locale: 'es', phone: true });
//   expect(report.issues).toEqual([]);
//   const lines = await speechStream(page);      // the page as a screen reader would read it, line by line
//
// Each issue is { rule, where, detail }: `where` is a short CSS path of the element. The rules are
// listed in docs/ACCESSIBILITY.md. The in-page part runs in the browser (page.evaluate), the
// accessible names come from Chrome's own accessibility tree (CDP Accessibility.getFullAXTree), so a
// name is what a screen reader would get, not a guess from the DOM.

/** Roles a user can operate: each one needs a name. */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'tab',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'listbox', 'treeitem', 'DisclosureTriangle',
]);
/** Form control roles: their name is their label. */
const FIELD_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'listbox']);
/** Names that say nothing: an icon id, a raw i18n key, the role itself. */
const ICON_IDS = [
  'overview', 'explorer', 'simulator', 'tests', 'more', 'analysis', 'decisions', 'glossary', 'settings', 'refresh', 'filter', 'search', 'close',
  'chevron-left', 'chevron-right', 'chevron-down', 'check', 'won', 'lost', 'void', 'pending', 'half', 'info', 'warning', 'offline', 'table',
  'chart', 'trash', 'save', 'link', 'sort', 'arrow-up', 'arrow-down',
];
const MEANINGLESS = new Set(['button', 'botón', 'link', 'enlace', 'icon', 'icono', 'x', '×', '›', '‹', '…', 'undefined', 'null', '[object object]']);
const I18N_KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/;

/**
 * Chrome's accessibility tree as a flat list of non-ignored nodes, in document order.
 * @param {import('playwright/test').Page} page
 * @returns {Promise<Array<{ role: string, name: string, props: Record<string, any>, depth: number, backendId?: number, description?: string, value?: string }>>}
 */
export async function axNodes(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    /** @type {Map<string, any>} */
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const root = nodes[0];
    /** @type {any[]} */
    const out = [];
    const walk = (/** @type {any} */ n, /** @type {number} */ depth) => {
      if (!n) return;
      let d = depth;
      if (!n.ignored) {
        /** @type {Record<string, any>} */
        const props = {};
        for (const p of n.properties || []) props[p.name] = p.value?.value;
        out.push({
          role: n.role?.value || '',
          name: (n.name?.value || '').trim(),
          description: n.description?.value || '',
          value: n.value?.value,
          props,
          depth,
          backendId: n.backendDOMNodeId,
        });
        d = depth + 1;
      }
      for (const c of n.childIds || []) walk(byId.get(c), d);
    };
    walk(root, 0);
    return out;
  } finally {
    await cdp.detach().catch(() => {});
  }
}

const STATE_KEYS = ['expanded', 'pressed', 'checked', 'selected', 'disabled', 'current', 'invalid', 'required', 'modal', 'level', 'busy', 'live', 'sort', 'hasPopup'];
/** Roles that only group content: read their children, not the role. */
const PASS_THROUGH = new Set(['generic', 'none', 'presentation', 'paragraph', 'Section', 'LineBreak', 'InlineTextBox', 'RootWebArea', 'group', 'list', 'listitem', 'ListMarker', 'strong', 'emphasis', 'superscript', 'subscript', 'time', 'mark', 'code', 'Abbr', 'DescriptionListDetail', 'DescriptionListTerm', 'term', 'definition', 'blockquote', 'caption', 'LabelText', 'figure', 'Canvas']);

/**
 * The page as a linear stream, the way a screen reader in browse mode would speak it: text runs are
 * joined, controls and landmarks are announced as "[role] name (states)".
 * @param {import('playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export async function speechStream(page) {
  const nodes = await axNodes(page);
  /** @type {string[]} */
  const lines = [];
  let text = '';
  const flush = () => {
    const s = text.replace(/\s+/g, ' ').trim();
    if (s) lines.push(s);
    text = '';
  };
  /** depth below which children are already spoken by a named control */
  let skipBelow = Infinity;
  for (const n of nodes) {
    if (n.depth <= skipBelow) skipBelow = Infinity;
    else continue;
    if (n.role === 'StaticText') {
      text += ` ${n.name}`;
      continue;
    }
    if (PASS_THROUGH.has(n.role) && !(n.role === 'group' && n.name)) {
      if (n.role === 'paragraph' || n.role === 'listitem' || n.role === 'LineBreak') flush();
      continue;
    }
    flush();
    const states = STATE_KEYS.filter((k) => n.props[k] !== undefined && n.props[k] !== false && n.props[k] !== 'false' && !(k === 'live' && n.props[k] === 'off'))
      .map((k) => (n.props[k] === true ? k : `${k}=${n.props[k]}`));
    const value = n.value != null && n.value !== '' && n.value !== n.name ? ` = "${n.value}"` : '';
    const desc = n.description ? ` — ${n.description}` : '';
    lines.push(`[${n.role}] ${n.name || '∅'}${value}${states.length ? ` (${states.join(', ')})` : ''}${desc}`);
    // A control's name already says its content: do not read the children twice.
    if (n.name && (INTERACTIVE_ROLES.has(n.role) || n.role === 'heading' || n.role === 'image' || n.role === 'img' || n.role === 'cell' || n.role === 'columnheader' || n.role === 'rowheader' || n.role === 'status')) {
      skipBelow = n.depth;
    }
  }
  flush();
  return lines;
}

/**
 * Names and roles from the accessibility tree: every control and image named, no name that is an
 * icon id, a raw key or the role itself, no name in the other language.
 * @param {Awaited<ReturnType<typeof axNodes>>} nodes
 * @param {{ otherLanguage?: (name: string) => boolean }} [opts]
 */
export function axIssues(nodes, opts = {}) {
  /** @type {Array<{ rule: string, where: string, detail: string }>} */
  const issues = [];
  let mains = 0;
  for (const n of nodes) {
    if (n.role === 'main') mains++;
    const name = n.name.toLowerCase();
    if (INTERACTIVE_ROLES.has(n.role) && n.props.hidden !== true) {
      if (!n.name) issues.push({ rule: FIELD_ROLES.has(n.role) ? 'field-label' : 'control-name', where: `${n.role}#${n.backendId}`, detail: 'no accessible name' });
      else if (MEANINGLESS.has(name) || ICON_IDS.includes(n.name) || I18N_KEY.test(n.name)) {
        issues.push({ rule: 'control-name', where: `${n.role}#${n.backendId}`, detail: `meaningless name "${n.name}"` });
      }
    }
    if ((n.role === 'image' || n.role === 'img') && !n.name) issues.push({ rule: 'image-name', where: `img#${n.backendId}`, detail: 'image with no text alternative' });
    if (n.name && I18N_KEY.test(n.name)) issues.push({ rule: 'raw-key', where: `${n.role}#${n.backendId}`, detail: `raw key "${n.name}"` });
    if (n.name && opts.otherLanguage && INTERACTIVE_ROLES.has(n.role) && opts.otherLanguage(n.name)) {
      issues.push({ rule: 'name-language', where: `${n.role}#${n.backendId}`, detail: `name in the other language "${n.name}"` });
    }
  }
  if (mains !== 1) issues.push({ rule: 'one-main', where: 'document', detail: `${mains} main landmarks` });
  return issues;
}

/**
 * DOM checks in the page: positive tabindex, duplicate ids, headings, lang, landmarks, tables,
 * target size (phone), text and non-text contrast, focus ring contrast, hover-only content.
 * @param {import('playwright/test').Page} page
 * @param {{ locale: 'es' | 'en', phone: boolean, targetSize?: boolean, contrast?: boolean }} opts
 */
export async function domIssues(page, opts) {
  // Measure the settled page: an opening sheet fades in, and half-faded text is not a contrast failure.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  return page.evaluate((o) => {
    /** @type {Array<{ rule: string, where: string, detail: string }>} */
    const issues = [];
    const push = (/** @type {string} */ rule, /** @type {Element | null} */ el, /** @type {string} */ detail) => issues.push({ rule, where: el ? cssPath(el) : 'document', detail });

    function cssPath(/** @type {Element} */ el) {
      const parts = [];
      let e = /** @type {Element | null} */ (el);
      while (e && e !== document.body && parts.length < 4) {
        let s = e.tagName.toLowerCase();
        const tid = e.getAttribute('data-testid');
        if (e.id && !/^[:P]/.test(e.id)) s += `#${e.id}`;
        else if (tid) s += `[data-testid="${tid}"]`;
        else if (e.classList.length) s += `.${[...e.classList].slice(0, 2).join('.')}`;
        parts.unshift(s);
        if (tid || (e.id && !/^[:P]/.test(e.id))) break;
        e = e.parentElement;
      }
      const label = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${parts.join(' > ')}${label ? ` "${label}"` : ''}`;
    }

    /** Hidden from everyone (display none, visibility hidden, inert or aria-hidden subtree). */
    function hiddenFromAT(/** @type {Element} */ el) {
      for (let e = /** @type {Element | null} */ (el); e; e = e.parentElement) {
        if (e.getAttribute('aria-hidden') === 'true' || e.hasAttribute('inert') || e.hasAttribute('hidden')) return true;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      }
      return false;
    }
    const isSrOnly = (/** @type {Element} */ el) => {
      for (let e = /** @type {Element | null} */ (el); e; e = e.parentElement) {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        if ((r.width <= 1 || r.height <= 1) && (cs.overflow === 'hidden' || cs.clip !== 'auto')) return true;
      }
      return false;
    };
    const visible = (/** @type {Element} */ el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      return !hiddenFromAT(el) && !isSrOnly(el);
    };

    // ---- tabindex, ids
    for (const el of document.querySelectorAll('[tabindex]')) {
      if (Number(el.getAttribute('tabindex')) > 0) push('tabindex-positive', el, `tabindex=${el.getAttribute('tabindex')}`);
    }
    const seen = new Map();
    for (const el of document.querySelectorAll('[id]')) {
      if (!el.id) continue;
      if (seen.has(el.id)) push('duplicate-id', el, `id "${el.id}" used more than once`);
      seen.set(el.id, el);
    }
    for (const el of document.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls]')) {
      for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
        for (const ref of (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(ref)) push('aria-ref', el, `${attr} points to missing id "${ref}"`);
        }
      }
    }

    // ---- language
    if (document.documentElement.lang !== o.locale) push('lang', document.documentElement, `html lang="${document.documentElement.lang}", UI is ${o.locale}`);

    // ---- headings (what a screen reader lists: hidden ones excluded, sr-only ones included)
    const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter((h) => !hiddenFromAT(h));
    const level = (/** @type {Element} */ h) => Number(h.getAttribute('aria-level') || h.tagName.slice(1)) || 2;
    const h1s = heads.filter((h) => level(h) === 1);
    if (h1s.length !== 1) push('one-h1', null, `${h1s.length} h1 on the page`);
    let prev = 0;
    for (const h of heads) {
      const l = level(h);
      if (!(h.textContent || '').trim()) push('heading-empty', h, 'empty heading');
      if (prev && l > prev + 1) push('heading-order', h, `h${l} after h${prev}`);
      prev = l;
    }
    if (heads.length && level(heads[0]) !== 1) push('heading-order', heads[0], `first heading is h${level(heads[0])}`);

    // ---- landmarks
    const mains = [...document.querySelectorAll('main, [role="main"]')].filter((m) => !hiddenFromAT(m));
    if (mains.length !== 1) push('one-main', null, `${mains.length} main`);
    for (const nav of document.querySelectorAll('nav')) {
      if (!hiddenFromAT(nav) && !nav.getAttribute('aria-label') && !nav.getAttribute('aria-labelledby')) push('landmark-name', nav, 'nav without a name');
    }
    const navNames = [...document.querySelectorAll('nav')].filter((n) => !hiddenFromAT(n)).map((n) => n.getAttribute('aria-label'));
    const dupNav = navNames.filter((n, i) => n && navNames.indexOf(n) !== i);
    for (const n of dupNav) push('landmark-name', null, `two visible nav landmarks named "${n}"`);

    // ---- tables
    for (const table of document.querySelectorAll('table')) {
      if (hiddenFromAT(table)) continue;
      if (!table.querySelector('th')) push('table-headers', table, 'table without header cells');
      if (!table.querySelector('caption') && !table.getAttribute('aria-label') && !table.getAttribute('aria-labelledby')) push('table-name', table, 'table without caption or name');
    }

    // ---- figures: svg charts need a name, decorative svg must be hidden
    for (const svg of document.querySelectorAll('svg')) {
      if (hiddenFromAT(svg)) continue;
      const named = svg.getAttribute('aria-label') || svg.getAttribute('aria-labelledby') || svg.querySelector(':scope > title');
      if (!named) push('svg-name', svg, 'svg neither hidden nor named');
    }
    for (const img of document.querySelectorAll('img')) {
      if (!img.hasAttribute('alt')) push('image-name', img, 'img without alt');
    }

    // ---- hover-only content: rules that reveal something on :hover alone
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const scan = (/** @type {CSSRuleList} */ list) => {
        for (const r of list) {
          if (r instanceof CSSMediaRule || (typeof CSSSupportsRule !== 'undefined' && r instanceof CSSSupportsRule)) scan(r.cssRules);
          if (!(r instanceof CSSStyleRule)) continue;
          if (!/:hover/.test(r.selectorText) || /:focus/.test(r.selectorText)) continue;
          const st = r.style;
          if (st.display && st.display !== 'none') push('hover-only', null, `${r.selectorText} { display: ${st.display} } without a :focus twin`);
          if (st.visibility === 'visible') push('hover-only', null, `${r.selectorText} { visibility: visible } without a :focus twin`);
          if (st.opacity && Number(st.opacity) > 0.5) push('hover-only', null, `${r.selectorText} { opacity: ${st.opacity} } without a :focus twin`);
        }
      };
      scan(rules);
    }

    // ---- colour helpers: any CSS colour to [r,g,b,a] through a 1×1 canvas
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 1;
    const ctx = /** @type {CanvasRenderingContext2D} */ (cvs.getContext('2d', { willReadFrequently: true }));
    /** @type {Map<string, number[]>} */
    const cache = new Map();
    function rgba(/** @type {string} */ c) {
      if (cache.has(c)) return /** @type {number[]} */ (cache.get(c));
      let out = [0, 0, 0, 0];
      if (c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        out = [d[0], d[1], d[2], d[3] / 255];
      }
      cache.set(c, out);
      return out;
    }
    const over = (/** @type {number[]} */ top, /** @type {number[]} */ bottom) => {
      const a = top[3];
      return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
    };
    const lum = (/** @type {number[]} */ c) => {
      const ch = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const ratio = (/** @type {number[]} */ a, /** @type {number[]} */ b) => {
      const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const hex = (/** @type {number[]} */ c) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    /** Effective opaque background behind an element: its own and its ancestors' colours composited. */
    function backgroundOf(/** @type {Element} */ el) {
      /** @type {number[][]} */
      const layers = [];
      for (let e = /** @type {Element | null} */ (el); e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null;
        const c = rgba(cs.backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let bg = [255, 255, 255, 1];
      const root = rgba(getComputedStyle(document.body).backgroundColor);
      if (root[3] > 0) bg = over(root, bg);
      for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
      return bg;
    }
    const opacityOf = (/** @type {Element} */ el) => {
      let a = 1;
      for (let e = /** @type {Element | null} */ (el); e; e = e.parentElement) a *= Number(getComputedStyle(e).opacity);
      return a;
    };
    const disabledCtl = (/** @type {Element} */ el) => !!el.closest('button:disabled, input:disabled, select:disabled, [aria-disabled="true"], fieldset:disabled');

    // ---- text contrast (every text node with visible glyphs)
    if (o.contrast !== false) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const checked = new Set();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        const el = /** @type {Element} */ (n.parentElement);
        if (!el || checked.has(el)) continue;
        checked.add(el);
        if (el.closest('svg') && !(el instanceof SVGTextElement || el.closest('text'))) continue;
        if (hiddenFromAT(el) && getComputedStyle(el).visibility === 'hidden') continue;
        if (!visible(el) && !el.closest('[aria-hidden="true"]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (disabledCtl(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const bg = backgroundOf(el);
        if (!bg) continue;
        let fg = rgba(el.closest('svg') ? cs.fill : cs.color);
        const op = opacityOf(el);
        fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
        const size = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        const need = large ? 3 : 4.5;
        const got = ratio(fg, bg);
        if (got < need - 0.005) push('contrast-text', el, `${got.toFixed(2)}:1 < ${need}:1 (text ${hex(fg)} on ${hex(bg)}, ${size}px)`);
      }
      // placeholders
      for (const inp of document.querySelectorAll('input[placeholder]:not(:disabled), textarea[placeholder]')) {
        if (!visible(inp) || /** @type {HTMLInputElement} */ (inp).value) continue;
        const bg = backgroundOf(inp);
        if (!bg) continue;
        const fg = over(rgba(getComputedStyle(inp, '::placeholder').color), bg);
        const got = ratio(fg, bg);
        if (got < 4.495) push('contrast-text', inp, `placeholder ${got.toFixed(2)}:1 < 4.5:1 (${hex(fg)} on ${hex(bg)})`);
      }

      // ---- non-text contrast: the boundary of a control against what is around it, icons, chart marks
      const parentBg = (/** @type {Element} */ el) => (el.parentElement ? backgroundOf(el.parentElement) : null);
      const CONTROLS = 'input:not([type="hidden"]):not([type="range"]), select, textarea, .fchip, .seg, .segmented, .btn-secondary, .search';
      for (const el of document.querySelectorAll(CONTROLS)) {
        if (!visible(el) || disabledCtl(el)) continue;
        if (el.matches('input[type="checkbox"], input[type="radio"]')) continue; // the browser draws these at 3:1 or more
        // A control inside a wrapper that draws the boundary is judged by the wrapper.
        if (el.matches('input, select') && el.closest('.search')) continue;
        if (el.matches('.seg') && el.closest('.segmented')) continue;
        const outside = parentBg(el);
        if (!outside) continue;
        const cs = getComputedStyle(el);
        const own = over(rgba(cs.backgroundColor), outside);
        const bw = parseFloat(cs.borderTopWidth) || 0;
        const border = bw > 0 && cs.borderTopStyle !== 'none' ? over(rgba(cs.borderTopColor), outside) : null;
        const best = Math.max(ratio(own, outside), border ? ratio(border, outside) : 0, border ? ratio(border, own) : 0);
        if (best < 2.995) push('contrast-ui', el, `control boundary ${best.toFixed(2)}:1 < 3:1 (border ${border ? hex(border) : 'none'}, fill ${hex(own)}, around ${hex(outside)})`);
      }
      for (const svg of document.querySelectorAll('button svg.icon, a svg.icon')) {
        if (!visible(svg.closest('button, a') || svg) || disabledCtl(svg)) continue;
        const host = /** @type {Element} */ (svg.closest('button, a'));
        if ((host.textContent || '').trim()) continue; // icon beside a visible word: decoration
        const bg = backgroundOf(host);
        if (!bg) continue;
        const fg = over(rgba(getComputedStyle(svg).color), bg);
        const got = ratio(fg, bg);
        if (got < 2.995) push('contrast-ui', host, `icon-only control ${got.toFixed(2)}:1 < 3:1 (${hex(fg)} on ${hex(bg)})`);
      }
      for (const mark of document.querySelectorAll('.chart svg .line, .chart svg .dot, .chart .bar-fill, .chart .bar, .spark path, .chart svg .pt')) {
        if (!visible(mark)) {
          if (!mark.closest('[aria-hidden="true"]')) continue;
        }
        const r = mark.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const cs = getComputedStyle(mark);
        const isSvg = mark instanceof SVGElement;
        const useFill = isSvg && (mark.matches('.dot, circle, rect') || !cs.stroke || cs.stroke === 'none');
        const paint = isSvg ? (useFill ? cs.fill : cs.stroke) : cs.backgroundColor;
        const c = rgba(paint);
        if (c[3] === 0) continue;
        const bg = backgroundOf(isSvg ? /** @type {Element} */ (mark.closest('svg')) : /** @type {Element} */ (mark.parentElement));
        if (!bg) continue;
        const fg = over([c[0], c[1], c[2], c[3] * opacityOf(mark) * (isSvg ? Number((useFill ? cs.fillOpacity : cs.strokeOpacity) || 1) : 1)], bg);
        const got = ratio(fg, bg);
        if (got < 2.995) push('contrast-ui', mark, `chart mark ${got.toFixed(2)}:1 < 3:1 (${hex(fg)} on ${hex(bg)})`);
      }
      // the focus ring on every surface the page uses
      const ring = rgba(getComputedStyle(document.documentElement).getPropertyValue('--c-focus').trim());
      const surfaces = ['--c-bg', '--c-surface', '--c-surface-2', '--c-raised', '--c-accent-soft'];
      for (const s of surfaces) {
        const bg = over(rgba(getComputedStyle(document.documentElement).getPropertyValue(s).trim()), [255, 255, 255, 1]);
        const got = ratio(ring, bg);
        if (got < 2.995) push('contrast-focus', null, `focus ring ${hex(ring)} on ${s} ${hex(bg)} is ${got.toFixed(2)}:1 < 3:1`);
      }
    }

    // ---- target size on the phone (WCAG 2.5.5 at 44 px, the app's own rule); inline links in prose are exempt
    if (o.phone && o.targetSize !== false) {
      const TARGETS = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [tabindex="0"]';
      for (const el of document.querySelectorAll(TARGETS)) {
        if (!visible(el)) continue;
        if (el.matches('main, h1, [tabindex="-1"]')) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === 'inline' && el.matches('a')) {
          // An inline link inside a sentence: exempt when the line has other text.
          const block = el.parentElement;
          const own = (el.textContent || '').trim().length;
          const all = (block?.textContent || '').trim().length;
          if (all > own + 2) continue;
        }
        if (el.matches('.skip-link')) continue;
        // A field inside a wrapper that is the visible box (the search box) is judged by the wrapper, a
        // checkbox or radio by the label that wraps it (tapping the label toggles it).
        const wrapper = el.matches('input, select') ? el.closest('.search') : null;
        const label = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label') : null;
        const box = (wrapper || label || el).getBoundingClientRect();
        // The real touch area includes an absolutely placed ::before / ::after that extends it (the
        // kit's "44 px tap area" pattern: `.fchip::after { inset: -4px 0 }`).
        let [w, h] = [box.width, box.height];
        if (cs.position !== 'static') {
          for (const pseudo of ['::before', '::after']) {
            const ps = getComputedStyle(el, pseudo);
            if (ps.content === 'none' || ps.position !== 'absolute' || ps.pointerEvents === 'none') continue;
            const px = (/** @type {string} */ v) => (v === 'auto' ? 0 : parseFloat(v) || 0);
            const bw = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
            const bh = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
            const pw = ps.width !== 'auto' && ps.left === 'auto' ? parseFloat(ps.width) : box.width - bw - px(ps.left) - px(ps.right);
            const ph = ps.height !== 'auto' && ps.top === 'auto' ? parseFloat(ps.height) : box.height - bh - px(ps.top) - px(ps.bottom);
            w = Math.max(w, pw);
            h = Math.max(h, ph);
          }
        }
        if (w < 43.5 || h < 43.5) push('target-size', el, `${Math.round(w)}×${Math.round(h)} px < 44×44`);
      }
    }
    return issues;
  }, opts);
}

/**
 * The whole audit of the current page.
 * @param {import('playwright/test').Page} page
 * @param {{ locale: 'es' | 'en', phone: boolean, targetSize?: boolean, contrast?: boolean, otherLanguage?: (s: string) => boolean }} opts
 */
export async function auditPage(page, opts) {
  const dom = await domIssues(page, { locale: opts.locale, phone: opts.phone, targetSize: opts.targetSize, contrast: opts.contrast });
  const ax = axIssues(await axNodes(page), { otherLanguage: opts.otherLanguage });
  return { issues: [...dom, ...ax] };
}

/**
 * The element that has focus, as a short description (for keyboard tests).
 * @param {import('playwright/test').Page} page
 */
export function focused(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'body';
    const tid = el.getAttribute('data-testid');
    return `${el.tagName.toLowerCase()}${tid ? `[${tid}]` : ''}${el.id ? `#${el.id}` : ''} ${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}`;
  });
}

/**
 * Whether the focused element shows a visible focus indicator (outline or box-shadow).
 * @param {import('playwright/test').Page} page
 */
export function focusVisible(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    // The ring may be drawn by a wrapper through :focus-within (the search box draws it around the field).
    for (let e = /** @type {Element | null} */ (el), up = 0; e && up < 3; e = e.parentElement, up++) {
      if (up > 0 && !e.matches(':focus-within')) break;
      const cs = getComputedStyle(e);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1;
      const shadow = cs.boxShadow && cs.boxShadow !== 'none';
      if (outline || shadow) return true;
    }
    return false;
  });
}
