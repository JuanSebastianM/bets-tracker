// Every formula shown to the user lives here (docs/DATA_CONTRACT.md section 7). Pure functions on
// Pick[]. Reference: review.py v1.0 (betting-review) and milestone-reviewer.

/** @typedef {import('./types').Pick} Pick */
/** @typedef {import('./types').Status} Status */

/**
 * @typedef {object} MeanStat
 * @property {number} n
 * @property {number | null} mean
 * @property {number | null} median
 * @property {number | null} se       standard error (clustered by match when clusters are given)
 * @property {number | null} lo       mean − 2 SE
 * @property {number | null} hi       mean + 2 SE
 * @property {number | null} z        mean / SE
 * @property {number | null} shareAbove share of values above zero
 */

/**
 * @typedef {object} Summary
 * @property {number} n           graded picks with a price (the base of every rate)
 * @property {number} pending
 * @property {number} won
 * @property {number} lost
 * @property {number} void
 * @property {number} halfWon
 * @property {number} halfLost
 * @property {number} unpriced    graded picks without a price (left out of every figure)
 * @property {number} staked      units staked
 * @property {number} profit      units won or lost
 * @property {number | null} yield profit / staked
 * @property {number | null} yieldSe SE of the per-pick flat profit (SD / √n)
 * @property {number | null} yieldZ  yield / SE
 * @property {number | null} hitRate won / (won + lost), halves count 0.5
 * @property {number | null} avgPrice
 * @property {number | null} breakEven mean of 1 / price (review.py)
 * @property {MeanStat} clv
 * @property {MeanStat} fairCloseEv
 * @property {number | null} meanProbModel
 */

export const GRADED = /** @type {Status[]} */ (['won', 'lost', 'void', 'half_won', 'half_lost']);

/** @param {Pick} p */
export const isGraded = (p) => GRADED.includes(p.status);

/** Picks that count in stats: everything except PUBLICADA Y APOSTADA (it is in Apuestas) and unknown statuses. */
export const isCountable = (/** @type {Pick} */ p) => p.tag !== 'published_bet' && p.status !== 'other';

/**
 * Flat profit of a graded pick at stake `s` (units). null when ungraded or without a price.
 * won s(p−1), lost −s, void 0, half_won s(p−1)/2, half_lost −s/2.
 * @param {Pick} p @param {number} [s]
 */
export function flatProfit(p, s = 1) {
  if (p.price == null) return null;
  switch (p.status) {
    case 'won':
      return s * (p.price - 1);
    case 'lost':
      return -s;
    case 'void':
      return 0;
    case 'half_won':
      return (s * (p.price - 1)) / 2;
    case 'half_lost':
      return -s / 2;
    default:
      return null;
  }
}

/**
 * Profit of a pick as the sheet records it (Apuestas `Ganancia (u)`, which knows about free bets),
 * else the flat profit at its own stake.
 * @param {Pick} p
 */
export function sheetProfit(p) {
  if (p.source === 'bets' && p.profitU != null && isGraded(p)) return p.profitU;
  return flatProfit(p, p.stakeU ?? 1);
}

/** Win weight for the hit rate: won 1, half_won 0.5, lost 0, half_lost 0.5 of a loss. */
function hitParts(/** @type {Status} */ s) {
  if (s === 'won') return [1, 0];
  if (s === 'lost') return [0, 1];
  if (s === 'half_won') return [0.5, 0];
  if (s === 'half_lost') return [0, 0.5];
  return [0, 0];
}

/** @param {number[]} xs */
export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** @param {number[]} xs */
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** SE = SD / √n with the population SD (review.py's plain_se). @param {number[]} xs */
export function plainSe(xs) {
  const n = xs.length;
  if (n < 2) return null;
  const mu = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - mu) ** 2, 0) / n) / Math.sqrt(n);
}

/**
 * Cluster-robust SE (rows of the same date + match form one cluster):
 * SE = sqrt(G/(G−1)) × sqrt(Σ_g (Σ_{i∈g}(x_i − mean))²) / n.
 * @param {Array<[string, number]>} pairs [cluster key, value]
 */
export function clusterSe(pairs) {
  const n = pairs.length;
  if (n < 2) return null;
  const mu = pairs.reduce((a, [, x]) => a + x, 0) / n;
  /** @type {Map<string, number>} */
  const g = new Map();
  for (const [k, x] of pairs) g.set(k, (g.get(k) || 0) + (x - mu));
  const G = g.size;
  if (G < 2) return null;
  let ss = 0;
  for (const v of g.values()) ss += v * v;
  return (Math.sqrt(G / (G - 1)) * Math.sqrt(ss)) / n;
}

/** Cluster key of a pick (review.py's ck): date + match. @param {Pick} p */
export const matchKey = (p) => `${p.date}|${p.match}`;

/**
 * Mean with n, median, SE (clustered by match when `keys` is given), ±2 SE and z.
 * @param {number[]} xs
 * @param {string[]} [keys] cluster key per value
 * @returns {MeanStat}
 */
export function meanStat(xs, keys) {
  const n = xs.length;
  const mu = mean(xs);
  const se = keys ? clusterSe(xs.map((x, i) => [keys[i], x])) : plainSe(xs);
  return {
    n,
    mean: mu,
    median: median(xs),
    se,
    lo: se == null || mu == null ? null : mu - 2 * se,
    hi: se == null || mu == null ? null : mu + 2 * se,
    z: se ? mu / se : null,
    shareAbove: n ? xs.filter((x) => x > 0).length / n : null,
  };
}

/**
 * Mean of a per-pick measure over the graded picks that have it, SE clustered by match.
 * @param {Pick[]} picks @param {(p: Pick) => number | null} get
 */
export function measureStat(picks, get) {
  const xs = [];
  const keys = [];
  for (const p of picks) {
    if (!isGraded(p)) continue;
    const v = get(p);
    if (v == null || !Number.isFinite(v)) continue;
    xs.push(v);
    keys.push(matchKey(p));
  }
  return meanStat(xs, keys);
}

/**
 * Record and rates of a set of picks.
 * @param {Pick[]} picks
 * @param {{ stake?: number, profit?: 'flat' | 'sheet' }} [opts] profit 'sheet' uses Apuestas' own
 *   Ganancia (u) and each pick's stake (real bets); 'flat' (default) stakes `stake` units on every pick.
 * @returns {Summary}
 */
export function summarize(picks, opts = {}) {
  const stake = opts.stake ?? 1;
  const useSheet = opts.profit === 'sheet';
  let won = 0, lost = 0, voids = 0, halfWon = 0, halfLost = 0, pending = 0, unpriced = 0;
  let staked = 0, profit = 0, hitW = 0, hitL = 0;
  /** @type {number[]} */
  const pls = [];
  /** @type {number[]} */
  const prices = [];
  /** @type {number[]} */
  const probs = [];
  const graded = [];
  for (const p of picks) {
    if (!isCountable(p)) continue;
    if (p.status === 'pending') {
      pending++;
      continue;
    }
    if (!isGraded(p)) continue;
    const s = useSheet ? p.stakeU ?? 1 : stake;
    const pl = useSheet ? sheetProfit(p) : flatProfit(p, s);
    if (pl == null || p.price == null) {
      unpriced++;
      continue;
    }
    graded.push(p);
    if (p.status === 'won') won++;
    else if (p.status === 'lost') lost++;
    else if (p.status === 'void') voids++;
    else if (p.status === 'half_won') halfWon++;
    else if (p.status === 'half_lost') halfLost++;
    const [w, l] = hitParts(p.status);
    hitW += w;
    hitL += l;
    staked += s;
    profit += pl;
    pls.push(s ? pl / s : 0);
    prices.push(p.price);
    if (p.probModel != null) probs.push(p.probModel);
  }
  const n = graded.length;
  const se = plainSe(pls);
  const y = staked ? profit / staked : null;
  return {
    n,
    pending,
    won,
    lost,
    void: voids,
    halfWon,
    halfLost,
    unpriced,
    staked,
    profit,
    yield: y,
    yieldSe: se,
    yieldZ: se && y != null ? y / se : null,
    hitRate: hitW + hitL ? hitW / (hitW + hitL) : null,
    avgPrice: mean(prices),
    breakEven: prices.length ? mean(prices.map((x) => 1 / x)) : null,
    clv: measureStat(graded, (p) => p.clv),
    fairCloseEv: measureStat(graded, (p) => p.fairCloseEv),
    meanProbModel: mean(probs),
  };
}

/**
 * Peak-to-trough of a cumulative curve (units), and as % of `bankroll` units when given.
 * @param {number[]} cum cumulative profit after each pick
 * @param {number} [bankroll] starting bankroll in units
 */
export function drawdown(cum, bankroll) {
  let peak = 0;
  let peakIdx = -1;
  let maxU = 0;
  let from = -1;
  let to = -1;
  let maxPct = 0;
  cum.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      peakIdx = i;
    }
    const dd = peak - v;
    if (dd > maxU) {
      maxU = dd;
      from = peakIdx;
      to = i;
    }
    if (bankroll) {
      const pct = dd / (bankroll + peak);
      if (pct > maxPct) maxPct = pct;
    }
  });
  return { maxU, maxPct: bankroll ? maxPct : null, from, to };
}

/**
 * Longest winning and losing runs (voids and halves are skipped, they do not break a run), and the current run.
 * @param {Pick[]} picks in chronological order
 */
export function streaks(picks) {
  let longestWin = 0, longestLoss = 0, run = 0;
  /** @type {'won' | 'lost' | null} */
  let kind = null;
  for (const p of picks) {
    if (p.status !== 'won' && p.status !== 'lost') continue;
    if (p.status === kind) run++;
    else {
      kind = p.status;
      run = 1;
    }
    if (kind === 'won') longestWin = Math.max(longestWin, run);
    else longestLoss = Math.max(longestLoss, run);
  }
  return { longestWin, longestLoss, current: kind ? { kind, length: run } : null };
}

/**
 * Group picks and summarize each group, largest first.
 * @template {string} K
 * @param {Pick[]} picks
 * @param {(p: Pick) => K | K[] | null} key one key, several (a pick in several groups) or null (left out)
 * @param {Parameters<typeof summarize>[1]} [opts]
 * @returns {Array<{ key: K, picks: Pick[], summary: Summary }>}
 */
export function groupBy(picks, key, opts) {
  /** @type {Map<K, Pick[]>} */
  const m = new Map();
  for (const p of picks) {
    const k = key(p);
    if (k == null) continue;
    for (const kk of Array.isArray(k) ? k : [k]) {
      if (!m.has(kk)) m.set(kk, []);
      m.get(kk).push(p);
    }
  }
  return [...m.entries()]
    .map(([k, ps]) => ({ key: k, picks: ps, summary: summarize(ps, opts) }))
    .sort((a, b) => b.summary.n - a.summary.n || b.picks.length - a.picks.length);
}

/** Price bands used by breakdowns (same edges as the filter presets). */
export const PRICE_BANDS = [
  { id: 'le170', max: 1.7 },
  { id: '170_200', max: 2.0 },
  { id: '200_250', max: 2.5 },
  { id: '250_400', max: 4.0 },
  { id: 'gt400', max: Infinity },
];

/** Band id of a price ('le170', '170_200', …) or null. @param {number | null} price */
export function priceBand(price) {
  if (price == null) return null;
  if (price < 1.7) return 'le170';
  return PRICE_BANDS.find((b) => price <= b.max).id;
}

/** 'YYYY-MM' of a pick. @param {Pick} p */
export const monthOf = (p) => p.date.slice(0, 7);

/** ISO weekday 1 (Monday) … 7 (Sunday) of a pick's date. @param {Pick} p */
export function weekdayOf(p) {
  const [y, m, d] = p.date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/**
 * Calibration: predicted probability vs hit rate in buckets (wins and losses only).
 * @param {Pick[]} picks
 * @param {(p: Pick) => number | null} [prob] defaults to the model probability
 * @param {number[]} [edges] bucket edges in [0, 1]
 */
export function calibration(picks, prob = (p) => p.probModel, edges = [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1]) {
  const buckets = edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1], n: 0, wins: 0, sumProb: 0 }));
  for (const p of picks) {
    if (!isCountable(p) || (p.status !== 'won' && p.status !== 'lost')) continue;
    const q = prob(p);
    if (q == null) continue;
    const b = buckets.find((x, i) => q >= x.lo && (q < x.hi || (i === buckets.length - 1 && q <= x.hi)));
    if (!b) continue;
    b.n++;
    b.sumProb += q;
    if (p.status === 'won') b.wins++;
  }
  return buckets.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, wins: b.wins, meanProb: b.n ? b.sumProb / b.n : null, hitRate: b.n ? b.wins / b.n : null }));
}

/**
 * Brier score of a probability on wins and losses.
 * @param {Pick[]} picks @param {(p: Pick) => number | null} [prob]
 */
export function brier(picks, prob = (p) => p.probModel) {
  const xs = [];
  for (const p of picks) {
    if (!isCountable(p) || (p.status !== 'won' && p.status !== 'lost')) continue;
    const q = prob(p);
    if (q == null) continue;
    xs.push((q - (p.status === 'won' ? 1 : 0)) ** 2);
  }
  return { n: xs.length, score: mean(xs) };
}

/**
 * Wins needed out of `n` at mean price `avgPrice` for a flat-yield z of `z` (milestone-reviewer's
 * gate for lines that barely move). Returns null when no count reaches it.
 * @param {number} n @param {number} avgPrice @param {number} [z]
 */
export function winsForZ(n, avgPrice, z = 2) {
  for (let w = 0; w <= n; w++) {
    const pls = [...Array(w).fill(avgPrice - 1), ...Array(n - w).fill(-1)];
    const se = plainSe(pls);
    if (se && mean(pls) / se >= z) return w;
  }
  return null;
}

/** Minimum n before a rate may be shown without its n beside it. */
export const MIN_N_FOR_RATE = 5;
