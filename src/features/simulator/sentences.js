// Sentences of the Simulator, built from src/data/simulate.js results (no figure is computed here).
import { t } from '../../lib/i18n.js';
import { formatUnits } from '../../lib/format.js';
import { closeVerdictOf } from '../../data/simulate.js';
import { stakingLabel, plainUnits } from './staking-controls.js';

/** @typedef {import('../../data/simulate.js').Staking} Staking */
/** @typedef {import('../../data/simulate.js').SimResult} SimResult */

/** The headline lead-in for a plan ("Si hubieras apostado 1u en cada uno"). @param {Staking} s */
export function headlineLead(s) {
  switch (s.mode) {
    case 'percent':
      return t('simulator.lead.percent', { pct: Number(s.percent.toFixed(2)) });
    case 'staked':
      return t('simulator.lead.staked');
    case 'kelly':
      return t('simulator.lead.kelly', { label: stakingLabel(s) });
    default:
      return t('simulator.lead.flat', { stake: plainUnits(s.stake) });
  }
}

/** The one honest sentence on the result against the close. @param {SimResult['totals']} tt */
export function closeSentenceFor(tt) {
  const c = tt.closeCheck;
  const kind = closeVerdictOf(c);
  if (kind === 'no_close') return t('simulator.close.no_close');
  return t(`simulator.close.${kind}`, {
    n: c.n,
    count: c.n,
    actual: formatUnits(c.actual),
    actualAbs: formatUnits(Math.abs(/** @type {number} */ (c.actual)), { sign: false }),
    expected: formatUnits(c.expected),
    lo: formatUnits(c.lo),
    hi: formatUnits(c.hi),
  });
}

/** Picks left out of the replay, as one line (or ''). @param {SimResult['totals']} tt */
export function leftOutLine(tt) {
  const parts = [];
  if (tt.noStake) parts.push(t('simulator.leftOut.noStake', { count: tt.noStake, n: tt.noStake }));
  if (tt.noProb) parts.push(t('simulator.leftOut.noProb', { count: tt.noProb, n: tt.noProb }));
  if (tt.zeroStake) parts.push(t('simulator.leftOut.zeroStake', { count: tt.zeroStake, n: tt.zeroStake }));
  if (tt.skipped) parts.push(t('simulator.leftOut.unpriced', { count: tt.skipped, n: tt.skipped }));
  return parts.join(' ');
}

