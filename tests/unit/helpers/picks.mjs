// Small Pick factory for unit tests: every field a Pick has, overridable.
let n = 0;
export function mkPick(over = {}) {
  n++;
  const parsed = {
    priceSource: null, feedPrice: null, feedOpen: null, feedOpenOther: null, feedOpenFlipped: false, ref: null, refBooks: [],
    refCount: null, sample: null, fuerza: null, fuerzaExpected: null, fuerzaProb: null, pin: null, pinMissing: null, open1x2: null,
    close: null, closeMissing: null, bookCloses: {}, loggerClv: null, loggerClvBook: null, loggerEv: null, loggerEvOtherBook: null,
    bookPrices: [], modelMean: null, aiMean: null, singleSource: false, filters: [], passedAll: false, ...(over.parsed || {}),
  };
  return {
    uid: `shadow:${n + 1}`, source: 'shadow', row: n + 1, date: '2026-11-01', time: null, league: 'Liga Austral', match: `A${n} vs B${n}`,
    marketRaw: 'Córners totales', market: 'corners_total', reviewClass: 'corners', selection: 'Under 9.5', side: 'under',
    price: 2, closePrice: null, status: 'won', statusRaw: 'Ganada', tag: 'shadow_rule30', tagRaw: '', books: [], stakeU: null,
    profitU: null, probModel: null, probBlend: null, probAI: null, ev: null, fairOdds: null, notes: '', fairCloseEv: null,
    closeSource: null, clv: null, clvSource: null, openingFairEv: null, closeMargin: null, evVsFeed: null, need: 1,
    hasTwoSidedClose: false, extra: {}, ...over, parsed,
  };
}
