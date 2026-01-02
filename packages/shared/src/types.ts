// ============================================================================
// CORE DATA TYPES
// ============================================================================

export type StatType = 'PTS' | 'REB' | 'AST';
export type OverUnder = 'O' | 'U';
export type UserPlan = 'free' | 'pro';
export type HomeAway = 'home' | 'away';
export type GameStatus = 'scheduled' | 'live' | 'final';
export type InjuryStatus = 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE' | 'GTD' | 'AVAILABLE';

// ============================================================================
// FIRESTORE DOCUMENT TYPES
// ============================================================================

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  city: string;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  position: string;
  jerseyNumber?: string;
  updatedAt: string;
}

export interface Game {
  id: string;
  date: string; // YYYY-MM-DD
  homeTeamId: string;
  awayTeamId: string;
  status: GameStatus;
  homeScore?: number;
  awayScore?: number;
}

export interface PlayerGameStat {
  id: string; // {playerId}_{gameId}
  playerId: string;
  gameId: string;
  date: string; // YYYY-MM-DD
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  opponentTeamId: string;
  homeAway: HomeAway;
  started: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InjurySnapshot {
  id: string;
  snapshotDateTime: string;
  players: InjuryPlayer[];
  createdAt: string;
}

export interface InjuryPlayer {
  playerId: string;
  playerName: string;
  teamId: string;
  status: InjuryStatus;
  notes?: string;
}

export interface DailyChange {
  category: 'injury' | 'minutes' | 'back-to-back';
  playerId?: string;
  teamId?: string;
  playerName?: string;
  teamName?: string;
  summary: string;
  severity: 'high' | 'medium' | 'low';
  details?: Record<string, any>;
}

export interface DailyChangesDoc {
  id: string; // YYYY-MM-DD
  date: string;
  changes: DailyChange[];
  updatedAt: string;
}

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  plan: UserPlan;
  stripeCustomerId?: string;
  role?: 'admin';
  limits: {
    propCardsPerDay: number;
    savedPropsMax: number;
    exportsPerDay: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SavedProp {
  id: string;
  playerId: string;
  playerName: string;
  statType: StatType;
  line: number;
  overUnder: OverUnder;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  tags: string[];
  lastGeneratedAt?: string;
  cachedCardData?: PropCardData;
}

export interface WatchlistItem {
  id: string;
  type: 'player' | 'team';
  refId: string;
  name: string;
  createdAt: string;
}

export interface UsageDaily {
  date: string; // YYYY-MM-DD
  propCardsGeneratedCount: number;
  exportsCount: number;
  savedPropsCount: number;
  resetAt: string;
}

export interface PlayerAggregate {
  playerId: string;
  seasonAverages: {
    gamesPlayed: number;
    minutes: number;
    pts: number;
    reb: number;
    ast: number;
  };
  last10Averages: {
    gamesPlayed: number;
    minutes: number;
    pts: number;
    reb: number;
    ast: number;
  };
  last20Averages: {
    gamesPlayed: number;
    minutes: number;
    pts: number;
    reb: number;
    ast: number;
  };
  updatedAt: string;
}

// ============================================================================
// PROP CARD DATA STRUCTURES
// ============================================================================

export interface PropCardData {
  player: Player;
  statType: StatType;
  line: number;
  overUnder: OverUnder;
  hitRates: HitRates;
  recentTrend: RecentTrend;
  context: PropContext;
  insights: string[];
  proAnalytics?: ProAnalytics;
  generatedAt: string;
}

export interface HitRates {
  last10: HitRateStats;
  last20: HitRateStats;
  season: HitRateStats;
}

export interface HitRateStats {
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number; // Percentage excluding pushes
  totalGames: number;
}

export interface RecentTrend {
  last5GameLog: GameLogEntry[];
  rollingAverageChart: ChartDataPoint[];
  minutesTrend: MinutesTrend;
}

export interface GameLogEntry {
  date: string;
  opponent: string;
  homeAway: HomeAway;
  minutes: number;
  statValue: number;
  result: 'W' | 'L' | 'P'; // Win, Loss, Push
}

export interface ChartDataPoint {
  gameNumber: number;
  value: number;
  date: string;
}

export interface MinutesTrend {
  last5Avg: number;
  seasonAvg: number;
  change: number;
  changePercent: number;
}

export interface PropContext {
  isBackToBack: boolean;
  nextGameIsBackToBack: boolean;
  injuredTeammates: InjuryPlayer[];
  lastGameDate?: string;
  nextGameDate?: string;
}

export interface ProAnalytics {
  splits: Splits;
  distribution: DistributionData;
  volatility: VolatilityData;
  trendSlope: TrendSlopeData;
  minutesStability: MinutesStabilityData;
  lineSensitivity: LineSensitivityData;
}

export interface Splits {
  homeAway: SplitStats;
  restDays: RestDaySplits;
}

export interface SplitStats {
  home: HitRateStats;
  away: HitRateStats;
}

export interface RestDaySplits {
  zero: HitRateStats; // Back-to-back
  one: HitRateStats;
  twoPlus: HitRateStats;
}

export interface DistributionData {
  buckets: DistributionBucket[];
  mean: number;
  median: number;
}

export interface DistributionBucket {
  range: string; // e.g., "0-5", "6-10"
  count: number;
  percentage: number;
}

export interface VolatilityData {
  stdDev: number;
  coefficientOfVariation: number; // CV = stdDev / mean
  rating: 'low' | 'medium' | 'high';
}

export interface TrendSlopeData {
  slope: number;
  direction: 'increasing' | 'decreasing' | 'stable';
  strength: 'weak' | 'moderate' | 'strong';
}

export interface MinutesStabilityData {
  stdDev: number;
  rating: 'stable' | 'moderate' | 'volatile';
}

export interface LineSensitivityData {
  withinOneLast20: number; // Count of games within ±1 of line
  withinOnePercent: number;
  pushRateLast20: number;
  rating: 'low' | 'medium' | 'high';
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface PropCardRequest {
  playerId?: string;
  playerName?: string;
  statType: StatType;
  line: number;
  overUnder: OverUnder;
  includePro?: boolean;
}

export interface PropCardResponse {
  success: boolean;
  data?: PropCardData;
  error?: string;
}

export interface SavedPropRequest {
  playerId: string;
  playerName: string;
  statType: StatType;
  line: number;
  overUnder: OverUnder;
  notes?: string;
  tags?: string[];
}

export interface DailyFeedRequest {
  date?: string; // YYYY-MM-DD, defaults to today
  watchlistOnly?: boolean;
}

export interface DailyFeedResponse {
  success: boolean;
  data?: {
    date: string;
    changes: DailyChange[];
  };
  error?: string;
}

export interface ExportPropCardRequest {
  savedPropId?: string;
  propCardData?: PropCardData;
}

export interface ExportPropCardResponse {
  success: boolean;
  url?: string;
  error?: string;
}

// ============================================================================
// SCRAPER TYPES
// ============================================================================

export interface ScraperHealthCheck {
  id: string;
  scraperName: string;
  lastRunAt: string;
  status: 'success' | 'warning' | 'error';
  message?: string;
  details?: Record<string, any>;
}

export interface ManualUploadCSV {
  playerId: string;
  playerName: string;
  date: string; // YYYY-MM-DD
  opponent: string;
  homeAway: HomeAway;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  started: boolean;
}
