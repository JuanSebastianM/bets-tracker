// BottomSheet (phones: slides from the bottom; wide screens: centred dialog). Modal: Escape and
// the backdrop close it, focus moves in on open and back to the opener on close, Tab stays inside.
//   <BottomSheet open=${open} title="Filtros" onClose=${() => setOpen(false)} footer=${...}>…</BottomSheet>
import { html, useEffect, useRef, useId } from '../../../vendor/preact.js';
import { IconButton } from './controls.js';
import { t } from '../i18n.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {{ open: boolean, title: any, onClose: () => void, children?: any, footer?: any, size?: 'md' | 'lg', testId?: string }} props
 */
export function BottomSheet({ open, title, onClose, children, footer, size = 'md', testId }) {
  const panel = useRef(/** @type {HTMLDivElement | null} */ (null));
  const opener = useRef(/** @type {Element | null} */ (null));
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector(FOCUSABLE);
    (/** @type {HTMLElement | null} */ (first) || panel.current)?.focus({ preventScroll: true });
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && panel.current) {
        const items = /** @type {HTMLElement[]} */ ([...panel.current.querySelectorAll(FOCUSABLE)]);
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      /** @type {HTMLElement | null} */ (opener.current)?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return html`<div class="sheet-root" data-testid=${testId}>
    <div class="sheet-backdrop" onClick=${onClose}></div>
    <div class=${`sheet sheet-${size}`} role="dialog" aria-modal="true" aria-labelledby=${id} ref=${panel} tabindex="-1">
      <header class="sheet-head">
        <h2 id=${id}>${title}</h2>
        <${IconButton} icon="close" label=${t('common.close')} onClick=${onClose} />
      </header>
      <div class="sheet-body">${children}</div>
      ${footer ? html`<footer class="sheet-foot">${footer}</footer>` : null}
    </div>
  </div>`;
}

/** Same component, named for its desktop look. */
export const Dialog = BottomSheet;
