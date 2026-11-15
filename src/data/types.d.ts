// Shared data types (docs/DATA_CONTRACT.md sections 3, 4 and 6). Import with
//   /** @typedef {import('./types').Pick} Pick */

export type Source = 'bets' | 'shadow' | 'grok';
export type Status = 'won' | 'lost' | 'void' | 'half_won' | 'half_lost' | 'pending' | 'other';
export type MarketFamily =
  | 'result' | 'goals' | 'corners_total' | 'corners_team' | 'cards_total' | 'cards_team' | 'shots' | 'combo' | 'other';
/** review.py's market classes (milestone-reviewer groups): used by the frozen tests. */
export type ReviewClass = 'result' | 'goals' | 'corners' | 'team_corners' | 'cards' | 'shots';
export type TagId =
  | 'published_bet' | 'published' | 'prop_near_value' | 'prop_value' | 'near_value' | 'value' | 'cards_under'
  | 'team_corners' | 'corner_rejects' | 'model_only_shots' | 'shadow_rule30' | 'shadow' | 'ai_watch' | 'low_edge'
  | 'filter_reject' | 'bet' | 'grok_priced' | 'grok_not_priced' | 'grok_other';
export type FilterReason =
  | 'gap' | 'ratio' | 'sample' | 'razor' | 'filter4' | 'filter5' | 'rule1' | 'rule18' | 'rule23' | 'low_stake';
export type Book = 'Betano' | 'Betsson' | 'Stake';

export interface FeedTab { columns: string[]; rows: Array<Array<string | number | null>> }
export interface Feed {
  schema: number;
  generatedAt: string;
  timeZone?: string;
  meta: {
    rows: Record<string, number>;
    redactions: number;
    missingHeaders: string[];
    /** true when the script served this JSON from its response cache. */
    cached?: boolean;
    /** How long the script keeps a read of the sheet (seconds). */
    cacheTtlSeconds?: number | null;
  };
  tabs: {
    bets: FeedTab; shadow: FeedTab; grok: FeedTab; decisions: FeedTab; pinnacle: FeedTab; rules: string[];
  };
}

export interface BookClose { close: number; others: number[]; triple: number[] | null }
export interface BookPrice { book: string; price: number | null; other: string | null; unavailable: string | null }

export interface ParsedNotes {
  /** Where the logged price (F) came from: 'feed', a book name, or null. */
  priceSource: string | null;
  feedPrice: number | null;
  feedOpen: number | null;
  feedOpenOther: number | null;
  feedOpenFlipped: boolean;
  ref: 'feed' | 'books' | 'one_book' | 'consensus' | null;
  refBooks: string[];
  refCount: number | null;
  sample: '10+' | '6-9' | null;
  fuerza: 'keeps' | 'rejects' | 'na' | null;
  fuerzaExpected: number | null;
  fuerzaProb: number | null;
  pin: { home: number; draw: number; away: number; readUtc: string; id: string | null } | null;
  pinMissing: string | null;
  open1x2: { home: number; draw: number; away: number } | 'n/a' | null;
  /** bet365 feed close ("cierre: Sofascore/bet365 X (otro lado Y)"). */
  close: { price: number; source: 'feed'; book: 'bet365'; others: number[]; triple: number[] | null } | null;
  /** Reason text when grading wrote "cierre feed: sin línea …". */
  closeMissing: string | null;
  /** clv-logger closes per book ("Cierre Betano 1.98 (U3.5 1.78); …"). */
  bookCloses: Record<string, BookClose>;
  loggerClv: number | null;
  loggerClvBook: string | null;
  loggerEv: number | null;
  loggerEvOtherBook: string | null;
  bookPrices: BookPrice[];
  modelMean: number | null;
  aiMean: number | null;
  singleSource: boolean;
  /** Rejection reasons on model rows (review.py's reasons()). */
  filters: FilterReason[];
  /** "pasó todos los filtros" in the reason or the notes. */
  passedAll: boolean;
}

export interface Measures {
  /** price × de-vigged close probability − 1 (own-book close first, else bet365 feed). */
  fairCloseEv: number | null;
  closeSource: 'same_book' | 'feed' | null;
  /** Raw CLV at the first same-source pair (own book, feed, IA-WATCH book opening). */
  clv: number | null;
  clvSource: 'own' | 'feed' | 'ia_open' | null;
  /** Opening × de-vigged close − 1 at the opening's own source (milestone-reviewer's fair-close EV). */
  openingFairEv: number | null;
  /** Closing overround at the source of openingFairEv. */
  closeMargin: number | null;
  /** price × de-vigged bet365 close − 1 (two-sided feed close only). */
  evVsFeed: number | null;
  /** Number of other outcomes the close needs: 1 (two-way), 2 (1X2), 'dc' (double chance). */
  need: 1 | 2 | 'dc';
  hasTwoSidedClose: boolean;
}

export interface Pick extends Measures {
  uid: string;
  source: Source;
  row: number;
  date: string;
  time: string | null;
  league: string;
  match: string;
  marketRaw: string;
  market: MarketFamily;
  reviewClass: ReviewClass;
  selection: string;
  side: 'over' | 'under' | '';
  price: number | null;
  closePrice: number | null;
  status: Status;
  statusRaw: string;
  tag: TagId;
  tagRaw: string;
  books: string[];
  stakeU: number | null;
  profitU: number | null;
  probModel: number | null;
  probBlend: number | null;
  probAI: number | null;
  ev: number | null;
  fairOdds: number | null;
  notes: string;
  parsed: ParsedNotes;
  /** Source-specific extras (bets: type, confidence, result…; grok: verdict, reason, minPrice…). */
  extra: Record<string, string | number | null>;
}

export interface Decision {
  row: number; date: string; topic: string; decision: string; evidence: string; review: string; status: string;
}
export interface PinnacleRow { row: number; [key: string]: string | number | null }

export interface Dataset {
  generatedAt: string;
  meta: Feed['meta'];
  picks: Pick[];
  decisions: Decision[];
  pinnacle: PinnacleRow[];
  rules: string[];
}
