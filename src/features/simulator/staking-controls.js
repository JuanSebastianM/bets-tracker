// The staking plan of one scenario: mode, its options and the starting bankroll, each mode with a
// one-line explanation. Controlled: `staking` + `onChange(next)`; the screen keeps it in the URL.
import { html } from '../../../vendor/preact.js';
import { t } from '../../lib/i18n.js';
import { SegmentedControl, FilterChip, NumberField } from '../../lib/ui/index.js';
import { STAKE_MODES, QUICK_STAKES } from '../../data/simulate.js';

/** @typedef {import('../../data/simulate.js').Staking} Staking */

/** Kelly fractions offered as chips. */
export const KELLY_FRACTIONS = [0.125, 0.25, 0.5, 1];

/** '1/4' for 0.25, '1/8', '1/2', 'completo' for 1; other values as a decimal. @param {number} f */
export function fractionLabel(f) {
  if (f === 1) return t('simulator.kellyFull');
  const inv = 1 / f;
  return Math.abs(inv - Math.round(inv)) < 1e-9 ? `1/${Math.round(inv)}` : String(f);
}

/** Units without the sign ('1u', '0.25u'). @param {number} v */
export const plainUnits = (v) => `${Number(v.toFixed(2))}u`;

/** Short name of a plan: '1u fija', '2% de la banca', 'Stake registrado', 'Kelly 1/4, máx. 2u'. @param {Staking} s */
export function stakingLabel(s) {
  switch (s.mode) {
    case 'percent':
      return t('simulator.label.percent', { pct: Number(s.percent.toFixed(2)) });
    case 'staked':
      return t('simulator.label.staked');
    case 'kelly':
      return t('simulator.label.kelly', { frac: fractionLabel(s.kellyFraction), cap: plainUnits(s.kellyCap) });
    default:
      return t('simulator.label.flat', { stake: plainUnits(s.stake) });
  }
}

/**
 * @param {{ staking: Staking, onChange: (s: Staking) => void, idPrefix?: string, compact?: boolean }} props
 */
export function StakingControls({ staking: s, onChange, idPrefix = 'sim', compact = false }) {
  const set = (/** @type {Partial<Staking>} */ patch) => onChange({ ...s, ...patch });
  const num = (/** @type {keyof Staking} */ k, /** @type {number} */ max = Infinity) => (/** @type {number | null} */ v) => {
    if (v != null && v > 0 && v <= max) set({ [k]: v });
  };
  return html`<div class=${`sim-staking${compact ? ' sim-staking-compact' : ''}`} data-testid=${`${idPrefix}-staking`}>
    <${SegmentedControl}
      label=${t('simulator.modeLabel')}
      hideLabel
      value=${s.mode}
      options=${STAKE_MODES.map((m) => ({ value: m, label: t(`simulator.mode.${m}`) }))}
      onValue=${(/** @type {any} */ mode) => set({ mode })}
    />
    <p class="sim-mode-help small" data-testid=${`${idPrefix}-mode-help`}>${t(`simulator.modeHelp.${s.mode}`)}</p>

    ${s.mode === 'flat'
      ? html`<div class="sim-fields">
          <div class="sim-quick" role="group" aria-label=${t('simulator.quickStakes')}>
            ${QUICK_STAKES.map((v) => html`<${FilterChip} label=${plainUnits(v)} selected=${s.stake === v} onToggle=${() => set({ stake: v })} testId=${`${idPrefix}-stake-${v}`} />`)}
          </div>
          <${NumberField} label=${t('simulator.stakeField')} value=${s.stake} unit="u" onValue=${num('stake')} testId=${`${idPrefix}-stake`} />
        </div>`
      : null}
    ${s.mode === 'percent'
      ? html`<div class="sim-fields sim-fields-2">
          <${NumberField} label=${t('simulator.percentField')} value=${s.percent} unit="%" onValue=${num('percent', 100)} testId=${`${idPrefix}-percent`} />
        </div>`
      : null}
    ${s.mode === 'kelly'
      ? html`<div class="sim-fields">
          <div class="sim-quick" role="group" aria-label=${t('simulator.kellyFraction')}>
            <span class="field-label">${t('simulator.kellyFraction')}</span>
            ${KELLY_FRACTIONS.map((f) => html`<${FilterChip} label=${fractionLabel(f)} selected=${s.kellyFraction === f} onToggle=${() => set({ kellyFraction: f })} testId=${`${idPrefix}-kf-${f}`} />`)}
          </div>
          <${NumberField} label=${t('simulator.kellyCap')} value=${s.kellyCap} unit="u" onValue=${num('kellyCap')} testId=${`${idPrefix}-kcap`} />
        </div>`
      : null}
    ${s.mode !== 'staked'
      ? html`<${NumberField}
          label=${t('simulator.bankField')}
          value=${s.bankroll}
          unit="u"
          onValue=${num('bankroll')}
          hint=${compact ? undefined : s.mode === 'flat' ? t('simulator.bankHintFlat') : t('simulator.bankHint')}
          testId=${`${idPrefix}-bank`}
        />`
      : null}
  </div>`;
}
