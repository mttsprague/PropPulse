/**
 * Prop Research Card - Type Definitions
 * 
 * Complete type system for NBA prop research card generation.
 * These types ensure type safety across the entire computation pipeline.
 */

export type StatType = 'PTS' | 'REB' | 'AST';
export type Side = 'OVER' | 'UNDER';
export type TrendDirection = 'UP' | 'DOWN' | 'FLAT';
export type RestCategory = 'rest0' | 'rest1' | 'rest2plus';

/**
 * Input query for prop card generation
 */
export interface PropQuery {
  playerId: string;
  statType: StatType;
  line: number;
  side: Side;
  gameDate?: string; // ISO date string; default is today
}

/**
 * Parsed query from natural language (may contain player name instead of ID)
 */
export interface ParsedPropQuery {
  playerName: string;
  playerId?: string; // Optional, needs resolution
  statType: StatType;
  line: number;
  side: Side;
  gameDate?: string;
  confidence: number; // 0-1, parsing confidence
}

/**
 * Hit rate summary for a sample window
 */
export interface HitRateSummary {
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number; // wins/(wins+losses), excluding pushes
  avg: number; // average stat across sample
  median: number;
}

/**
 * Individual game log row for trend display
 */
export interface GameLogRow {
  date: string;
  opponent: string;
  homeAway: 'home' | 'away';
  minutes: number;
  statValue: number; // The specific stat (PTS, REB, or AST)
  outcome: 'WIN' | 'LOSS' | 'PUSH';
  restDays: number;
}

/**
 * Chart point for time series data
 */
export interface ChartPoint {
  x: string | number; // Date or game index
  y: number;
  label?: string;
}

/**
 * Complete Prop Research Card
 */
export interface PropCard {
  meta: {
    playerId: string;
    playerName: string;
    teamAbbr: string;
    opponentAbbr?: string;
    statType: StatType;
    line: number;
    side: Side;
    generatedAt: string;
    gameDate: string;
    disclaimer: string;
  };

  summary: {
    last10: HitRateSummary;
    last20: HitRateSummary;
    season: HitRateSummary;
    pushesIncluded: boolean;
    quickInsights: string[]; // Always exactly 3 bullets
  };

  trend: {
    last5GameLogs: GameLogRow[];
    rollingAvgLast10: ChartPoint[];
    minutesLast5: ChartPoint[];
    trendSlopeLast10: number; // Linear regression slope
    trendDirection: TrendDirection;
  };

  pro: {
    splits: {
      home: HitRateSummary;
      away: HitRateSummary;
      rest0: HitRateSummary; // back-to-back
      rest1: HitRateSummary; // 1 day rest
      rest2plus: HitRateSummary; // 2+ days rest
    };

    distribution: {
      buckets: { label: string; count: number }[];
      mean: number;
      stdDev: number;
      volatilityScore: number; // 0-100, normalized
    };

    sensitivity: {
      nearLineRate: number; // % within ±1.0 of line in last 20
      pushRate: number; // pushes/last20
      lineSensitivityScore: number; // 0-100, normalized
    };

    stability: {
      minutesStdDevLast10: number;
      minutesStabilityScore: number; // 0-100, normalized
      reliabilityNotes: string[];
    };
  };

  context: {
    injuryStatus?: {
      player: { status: string; notes?: string };
      teammatesOut?: { playerId: string; name: string; status: string }[];
      lastUpdatedAt?: string;
    };
    scheduleContext?: {
      backToBack: boolean;
      restDays: number;
      lastGameDate?: string;
    };
  };

  debug?: {
    sampleSizeNotes: string[];
    dataQualityWarnings: string[];
  };
}

/**
 * Raw game log data from Firestore
 */
export interface PlayerGameLog {
  id: string;
  playerId: string;
  gameId: string;
  date: string;
  teamId: string;
  opponentTeamId: string;
  homeAway: 'home' | 'away';
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  updatedAt: number;
  createdAt: number;
}

/**
 * Player data from Firestore
 */
export interface Player {
  id: string;
  name: string;
  teamId: string;
  position: string;
  updatedAt: number;
}

/**
 * Team data from Firestore
 */
export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  updatedAt: number;
}

/**
 * Game data from Firestore
 */
export interface Game {
  id: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  status: 'scheduled' | 'in_progress' | 'final';
  updatedAt: number;
}

/**
 * Injury snapshot player entry
 */
export interface InjuryPlayer {
  playerId?: string;
  playerName: string;
  teamId?: string;
  status: string;
  injuryType: string;
  notes?: string;
}

/**
 * Injury snapshot from Firestore
 */
export interface InjurySnapshot {
  id: string;
  snapshotDateTime: number;
  players: InjuryPlayer[];
  updatedAt: number;
}

/**
 * Cached prop card with expiration
 */
export interface CachedPropCard {
  query: PropQuery;
  card: PropCard;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Computation metrics used for insights generation
 */
export interface CardMetrics {
  last10HitRate: number;
  last20HitRate: number;
  seasonHitRate: number;
  trendDirection: TrendDirection;
  volatilityScore: number;
  lineSensitivityScore: number;
  minutesStabilityScore: number;
  minutesCorrelation: number; // 0-1, how much minutes affect outcomes
  sampleSize: {
    last10: number;
    last20: number;
    season: number;
  };
  avgMinutesLast10: number;
  splits: {
    homeDiff: number; // home hit rate - away hit rate
    b2bDiff: number; // rest0 hit rate - rest2plus hit rate
  };
}

/**
 * Banned terms for insights (no betting advice)
 */
export const BANNED_TERMS = [
  'lock',
  'best bet',
  'guaranteed',
  'free money',
  'profit',
  'roi',
  'cash',
  'bankroll',
  'max bet',
  'smash',
  'hammer',
  'play',
  'fade',
  'tail',
] as const;

/**
 * Standard disclaimer text
 */
export const STANDARD_DISCLAIMER = 
  'This is a research tool for informational purposes only. Not betting advice. ' +
  'PropPulse does not recommend, endorse, or guarantee outcomes. ' +
  'Past performance does not predict future results.';
