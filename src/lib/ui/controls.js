// Controls: buttons, chips, segmented control, select, number range, search, number field.
// Every input takes a visible `label` (or `aria-label` via `label` + `hideLabel`) and reports values
// with `onValue`. Touch targets are at least 44 px.
import { html, useId, useState, useEffect, useRef } from '../../../vendor/preact.js';
import { Icon } from './icons.js';
import { t } from '../i18n.js';

/**
 * A control that becomes disabled while it has focus (a "Quitar todos" that empties the filters, a
 * refresh that runs, a chip whose count drops to 0 when it is turned off) would drop focus to the page
 * body: from there Tab starts over, or leaves an open dialog. While focused it stays enabled and is
 * marked aria-disabled (clicks do nothing); it becomes really disabled once focus moves on (round 2).
 * @param {boolean | undefined} disabled
 * @returns {{ ref: any, disabled: boolean | undefined, ariaDisabled: 'true' | undefined, onBlur: () => void, held: boolean }}
 */
export function useFocusSafeDisabled(disabled) {
  const ref = useRef(/** @type {HTMLElement | null} */ (null));
  const [held, setHeld] = useState(false);
  const focused = !!disabled && typeof document !== 'undefined' && !!ref.current && ref.current === document.activeElement;
  const hold = !!disabled && (focused || held);
  useEffect(() => {
    if (hold !== held) setHeld(hold);
  }, [hold]);
  return { ref, disabled: hold ? undefined : disabled, ariaDisabled: hold ? 'true' : undefined, onBlur: () => held && setHeld(false), held: hold };
}

/**
 * @param {{ children?: any, onClick?: (e: Event) => void, variant?: 'primary' | 'secondary' | 'ghost' | 'danger',
 *   icon?: string, type?: string, disabled?: boolean, href?: string, class?: string, [k: string]: any }} props
 */
export function Button({ children, variant = 'secondary', icon, type = 'button', href, class: cls = '', disabled, onClick, ...rest }) {
  const c = `btn btn-${variant} ${cls}`;
  const inner = html`${icon ? html`<${Icon} name=${icon} size=${18} />` : null}<span>${children}</span>`;
  const safe = useFocusSafeDisabled(disabled);
  if (href) return html`<a class=${c} href=${href} onClick=${onClick} ...${rest}>${inner}</a>`;
  return html`<button type=${type} class=${c} ref=${safe.ref} disabled=${safe.disabled} aria-disabled=${safe.ariaDisabled} onBlur=${safe.onBlur}
    onClick=${(/** @type {Event} */ e) => {
      if (safe.held) {
        e.preventDefault();
        return;
      }
      if (onClick) onClick(e);
    }} ...${rest}>${inner}</button>`;
}

/** Icon-only button; `label` is its accessible name and tooltip. */
export function IconButton({ icon, label, onClick, class: cls = '', size = 20, ...rest }) {
  return html`<button type="button" class=${`icon-btn ${cls}`} aria-label=${label} title=${label} onClick=${onClick} ...${rest}>
    <${Icon} name=${icon} size=${size} />
  </button>`;
}

/**
 * Static chip (a label, a count). tone: neutral | accent | won | lost | void | pending | info.
 * @param {{ children?: any, tone?: string, class?: string, title?: string }} props
 */
export function Chip({ children, tone = 'neutral', class: cls = '', title }) {
  return html`<span class=${`chip chip-${tone} ${cls}`} title=${title}>${children}</span>`;
}

/**
 * Toggle chip for filters (aria-pressed). Shows an optional count.
 * @param {{ label: any, selected: boolean, onToggle: () => void, count?: number, disabled?: boolean, testId?: string }} props
 */
export function FilterChip({ label, selected, onToggle, count, disabled, testId }) {
  const safe = useFocusSafeDisabled(disabled);
  return html`<button
    type="button"
    class=${`fchip${selected ? ' fchip-on' : ''}`}
    aria-pressed=${selected ? 'true' : 'false'}
    onClick=${() => !safe.held && onToggle()}
    ref=${safe.ref}
    disabled=${safe.disabled}
    aria-disabled=${safe.ariaDisabled}
    onBlur=${safe.onBlur}
    data-testid=${testId}
  >
    ${selected ? html`<${Icon} name="check" size=${14} />` : null}
    <span>${label}</span>
    ${count != null ? html`<span class="fchip-count num">${count}</span>` : null}
  </button>`;
}

/**
 * Arrow keys in a radio group (the ARIA radio pattern: one Tab stop, arrows move and select, Home /
 * End jump), with focus following the new choice once it has rendered.
 * @param {KeyboardEvent} e @param {Array<{ value: string }>} options @param {string} value @param {(v: string) => void} onValue
 */
export function onRadioKey(e, options, value, onValue) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };
  const k = /** @type {Record<string, any>} */ (keys)[e.key];
  if (k == null || !options.length) return;
  e.preventDefault();
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const next = k === 'first' ? 0 : k === 'last' ? options.length - 1 : (at + k + options.length) % options.length;
  const group = /** @type {HTMLElement} */ (e.currentTarget);
  onValue(options[next].value);
  requestAnimationFrame(() => /** @type {HTMLElement | undefined} */ (group.querySelectorAll('[role="radio"]')[next])?.focus());
}

/**
 * One choice among a few (radio group).
 * @param {{ label: string, value: string, options: Array<{ value: string, label: any }>, onValue: (v: string) => void, hideLabel?: boolean, name?: string }} props
 */
export function SegmentedControl({ label, value, options, onValue, hideLabel = false, name }) {
  const id = useId();
  return html`<div class="field">
    <span class=${hideLabel ? 'sr-only' : 'field-label'} id=${id}>${label}</span>
    <div class="segmented" role="radiogroup" aria-labelledby=${id} data-name=${name} onKeyDown=${(/** @type {KeyboardEvent} */ e) => onRadioKey(e, options, value, onValue)}>
      ${options.map(
        (o, i) => html`<button
          type="button"
          role="radio"
          aria-checked=${o.value === value ? 'true' : 'false'}
          tabindex=${o.value === value || (!options.some((x) => x.value === value) && i === 0) ? '0' : '-1'}
          class=${o.value === value ? 'seg seg-on' : 'seg'}
          onClick=${() => onValue(o.value)}
        >
          ${o.label}
        </button>`,
      )}
    </div>
  </div>`;
}

/**
 * Native select.
 * @param {{ label: string, value: string, options: Array<{ value: string, label: string }>, onValue: (v: string) => void, hideLabel?: boolean }} props
 */
export function Select({ label, value, options, onValue, hideLabel = false }) {
  const id = useId();
  return html`<div class="field">
    <label class=${hideLabel ? 'sr-only' : 'field-label'} for=${id}>${label}</label>
    <div class="select-wrap">
      <select id=${id} value=${value} onChange=${(/** @type {any} */ e) => onValue(e.currentTarget.value)}>
        ${options.map((o) => html`<option value=${o.value} selected=${o.value === value}>${o.label}</option>`)}
      </select>
      <${Icon} name="chevron-down" size=${16} />
    </div>
  </div>`;
}

/** Parse a typed number ('1,85' or '1.85'); '' -> null. @param {string} s */
export function parseNumberInput(s) {
  const t = String(s).trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/**
 * A single number field (accepts ',' as decimal separator). onValue(number | null).
 * @param {{ label: string, value: number | null, onValue: (v: number | null) => void, unit?: string, hint?: string,
 *   min?: number, step?: string, placeholder?: string, testId?: string }} props
 */
export function NumberField({ label, value, onValue, unit, hint, placeholder, testId }) {
  const id = useId();
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    if (parseNumberInput(text) !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return html`<div class="field">
    <label class="field-label" for=${id}>${label}${unit ? html`<span class="sr-only">, ${unit === 'u' ? t('a11y.inUnits') : unit}</span>` : null}</label>
    <div class="input-wrap">
      <input
        id=${id}
        inputmode="decimal"
        autocomplete="off"
        value=${text}
        placeholder=${placeholder}
        data-testid=${testId}
        aria-describedby=${hint ? `${id}-hint` : undefined}
        onInput=${(/** @type {any} */ e) => {
          setText(e.currentTarget.value);
          onValue(parseNumberInput(e.currentTarget.value));
        }}
      />
      ${unit ? html`<span class="input-unit" aria-hidden="true">${unit}</span>` : null}
    </div>
    ${hint ? html`<p class="field-hint" id=${`${id}-hint`}>${hint}</p>` : null}
  </div>`;
}

/**
 * Min / max pair. onValue({ min, max }).
 * @param {{ label: string, value: { min: number | null, max: number | null }, onValue: (v: { min: number | null, max: number | null }) => void,
 *   minLabel: string, maxLabel: string, unit?: string }} props
 */
export function RangeInput({ label, value, onValue, minLabel, maxLabel, unit }) {
  const id = useId();
  return html`<fieldset class="field range-input" aria-labelledby=${id}>
    <legend class="field-label" id=${id}>${label}</legend>
    <div class="grid-2">
      <${NumberField} label=${minLabel} value=${value.min} unit=${unit} onValue=${(/** @type {number | null} */ min) => onValue({ ...value, min })} />
      <${NumberField} label=${maxLabel} value=${value.max} unit=${unit} onValue=${(/** @type {number | null} */ max) => onValue({ ...value, max })} />
    </div>
  </fieldset>`;
}

/**
 * Search box with a clear button.
 * @param {{ label: string, value: string, onValue: (v: string) => void, placeholder?: string, clearLabel: string }} props
 */
export function SearchInput({ label, value, onValue, placeholder, clearLabel }) {
  const id = useId();
  return html`<div class="search">
    <label class="sr-only" for=${id}>${label}</label>
    <${Icon} name="search" size=${18} />
    <input id=${id} type="search" value=${value} placeholder=${placeholder} onInput=${(/** @type {any} */ e) => onValue(e.currentTarget.value)} />
    ${value ? html`<${IconButton} icon="close" size=${16} label=${clearLabel} onClick=${() => onValue('')} />` : null}
  </div>`;
}

/**
 * Text field.
 * @param {{ label: string, value: string, onValue: (v: string) => void, hint?: string, maxLength?: number, placeholder?: string }} props
 */
export function TextField({ label, value, onValue, hint, maxLength, placeholder }) {
  const id = useId();
  return html`<div class="field">
    <label class="field-label" for=${id}>${label}</label>
    <div class="input-wrap">
      <input id=${id} value=${value} maxlength=${maxLength} placeholder=${placeholder} autocomplete="off" onInput=${(/** @type {any} */ e) => onValue(e.currentTarget.value)} />
    </div>
    ${hint ? html`<p class="field-hint">${hint}</p>` : null}
  </div>`;
}
