/**
 * Prop Card Computations
 * 
 * Core computation engine for generating prop research cards.
 * Handles hit rate calculations, trend analysis, volatility scoring,
 * and all statistical computations.
 */

import {
  PropQuery,
  PropCard,
  HitRateSummary,
  GameLogRow,
  ChartPoint,
  TrendDirection,
  PlayerGameLog,
  StatType,
  Side,
  Player,
  Team,
  Game,
  InjurySnapshot,
  RestCategory,
  STANDARD_DISCLAIMER,
} from './types';

/**
 * Outcome type for a single game
 */
type Outcome = 'WIN' | 'LOSS' | 'PUSH';

/**
 * Game log with computed outcome and rest days
 */
interface EnrichedGameLog extends PlayerGameLog {
  statValue: number;
  outcome: Outcome;
  restDays: number;
}

/**
 * Generate complete prop card from query
 * 
 * @param query Prop query
 * @param gameLogs Player's game logs for the season
 * @param player Player data
 * @param team Team data
 * @param opponent Opponent team data (if game is scheduled)
 * @param games All games for schedule context
 * @param injurySnapshot Most recent injury snapshot
 * @returns Complete prop card
 */
export async function generatePropCard(
  query: PropQuery,
  gameLogs: PlayerGameLog[],
  player: Player,
  team: Team,
  opponent: Team | null,
  games: Game[],
  injurySnapshot: InjurySnapshot | null
): Promise<PropCard> {
  const gameDate = query.gameDate || new Date().toISOString().split('T')[0];

  // Enrich game logs with outcomes and rest days
  const enrichedLogs = enrichGameLogs(gameLogs, query, games);

  // Filter to only games before the target date
  const logsBeforeGame = enrichedLogs.filter((log) => log.date < gameDate);

  // Sort by date descending (most recent first)
  const sortedLogs = [...logsBeforeGame].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Get windows
  const last10 = sortedLogs.slice(0, 10);
  const last20 = sortedLogs.slice(0, 20);
  const season = sortedLogs;

  // Compute hit rate summaries
  const last10Summary = computeHitRateSummary(last10);
  const last20Summary = computeHitRateSummary(last20);
  const seasonSummary = computeHitRateSummary(season);

  // Compute trends
  const trendData = computeTrends(last10, query.statType);

  // Compute splits
  const splits = computeSplits(last20);

  // Compute distribution and volatility
  const distribution = computeDistribution(last20, query.line);

  // Compute line sensitivity
  const sensitivity = computeSensitivity(last20, query.line);

  // Compute stability
  const stability = computeStability(last10);

  // Get context
  const context = getContext(
    player,
    sortedLogs[0],
    games,
    injurySnapshot,
    gameDate
  );

  // Debug info
  const debug = generateDebugInfo(sortedLogs);

  // Build the card
  const card: PropCard = {
    meta: {
      playerId: query.playerId,
      playerName: player.name,
      teamAbbr: team.abbreviation,
      opponentAbbr: opponent?.abbreviation,
      statType: query.statType,
      line: query.line,
      side: query.side,
      generatedAt: new Date().toISOString(),
      gameDate,
      disclaimer: STANDARD_DISCLAIMER,
    },

    summary: {
      last10: last10Summary,
      last20: last20Summary,
      season: seasonSummary,
      pushesIncluded: true,
      quickInsights: [], // Filled by insights generator
    },

    trend: trendData,

    pro: {
      splits,
      distribution,
      sensitivity,
      stability,
    },

    context,
    debug,
  };

  return card;
}

/**
 * Enrich game logs with outcomes and rest days
 */
function enrichGameLogs(
  gameLogs: PlayerGameLog[],
  query: PropQuery,
  games: Game[]
): EnrichedGameLog[] {
  // Sort logs by date ascending for rest day calculation
  const sorted = [...gameLogs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return sorted.map((log, index) => {
    // Get stat value based on stat type
    const statValue = log[query.statType.toLowerCase() as 'pts' | 'reb' | 'ast'];

    // Compute outcome
    const outcome = computeOutcome(statValue, query.line, query.side);

    // Compute rest days
    let restDays = 0;
    if (index > 0) {
      const prevDate = new Date(sorted[index - 1].date);
      const currDate = new Date(log.date);
      const diffMs = currDate.getTime() - prevDate.getTime();
      restDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) - 1; // Subtract 1 for game day
    } else {
      // First game of season, assume 3+ days rest
      restDays = 3;
    }

    return {
      ...log,
      statValue,
      outcome,
      restDays: Math.max(0, restDays),
    };
  });
}

/**
 * Compute outcome (WIN/LOSS/PUSH) for a single game
 */
export function computeOutcome(statValue: number, line: number, side: Side): Outcome {
  if (side === 'OVER') {
    if (statValue > line) return 'WIN';
    if (statValue < line) return 'LOSS';
    return 'PUSH';
  } else {
    // UNDER
    if (statValue < line) return 'WIN';
    if (statValue > line) return 'LOSS';
    return 'PUSH';
  }
}

/**
 * Compute hit rate summary for a sample of games
 */
export function computeHitRateSummary(logs: EnrichedGameLog[]): HitRateSummary {
  if (logs.length === 0) {
    return {
      sampleSize: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      hitRate: 0,
      avg: 0,
      median: 0,
    };
  }

  const wins = logs.filter((log) => log.outcome === 'WIN').length;
  const losses = logs.filter((log) => log.outcome === 'LOSS').length;
  const pushes = logs.filter((log) => log.outcome === 'PUSH').length;

  // Hit rate excludes pushes
  const decisiveGames = wins + losses;
  const hitRate = decisiveGames > 0 ? wins / decisiveGames : 0;

  // Average and median
  const values = logs.map((log) => log.statValue);
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const median = computeMedian(values);

  return {
    sampleSize: logs.length,
    wins,
    losses,
    pushes,
    hitRate,
    avg,
    median,
  };
}

/**
 * Compute median of an array
 */
export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
}

/**
 * Compute trend data (rolling avg, slope, direction, minutes)
 */
function computeTrends(
  logs: EnrichedGameLog[],
  statType: StatType
): PropCard['trend'] {
  // Last 5 game logs for display
  const last5 = logs.slice(0, 5);
  const last5GameLogs: GameLogRow[] = last5.map((log) => ({
    date: log.date,
    opponent: log.opponentTeamId, // Will be resolved to abbr in frontend
    homeAway: log.homeAway,
    minutes: log.minutes,
    statValue: log.statValue,
    outcome: log.outcome,
    restDays: log.restDays,
  }));

  // Rolling average last 10
  const rollingAvgLast10: ChartPoint[] = [];
  const last10 = logs.slice(0, 10).reverse(); // Oldest to newest

  for (let i = 0; i < last10.length; i++) {
    const window = last10.slice(Math.max(0, i - 2), i + 1); // 3-game rolling window
    const avg = window.reduce((sum, log) => sum + log.statValue, 0) / window.length;

    rollingAvgLast10.push({
      x: last10[i].date,
      y: parseFloat(avg.toFixed(1)),
      label: `Game ${i + 1}`,
    });
  }

  // Minutes last 5
  const minutesLast5: ChartPoint[] = last5
    .reverse()
    .map((log, index) => ({
      x: log.date,
      y: log.minutes,
      label: `Game ${index + 1}`,
    }));

  // Trend slope using linear regression on last 10
  const trendSlopeLast10 = computeTrendSlope(
    last10.map((log) => log.statValue)
  );

  // Trend direction based on slope
  const trendDirection = categorizeTrendDirection(trendSlopeLast10);

  return {
    last5GameLogs,
    rollingAvgLast10,
    minutesLast5,
    trendSlopeLast10,
    trendDirection,
  };
}

/**
 * Compute trend slope using simple linear regression
 * 
 * Formula: slope = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)
 * Where x = game index (0, 1, 2...), y = stat value
 * 
 * @param values Array of stat values (chronological order, oldest first)
 * @returns Slope value (positive = uptrend, negative = downtrend)
 */
export function computeTrendSlope(values: number[]): number {
  if (values.length < 2) return 0;

  const n = values.length;
  const xValues = Array.from({ length: n }, (_, i) => i);

  const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
  const yMean = values.reduce((sum, y) => sum + y, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = xValues[i] - xMean;
    const yDiff = values[i] - yMean;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Categorize trend direction based on slope
 * 
 * Thresholds:
 * - UP: slope > 0.3 (gaining ~0.3 stat per game)
 * - DOWN: slope < -0.3 (losing ~0.3 stat per game)
 * - FLAT: -0.3 <= slope <= 0.3
 */
function categorizeTrendDirection(slope: number): TrendDirection {
  const threshold = 0.3;
  if (slope > threshold) return 'UP';
  if (slope < -threshold) return 'DOWN';
  return 'FLAT';
}

/**
 * Compute splits (home/away, rest days)
 */
function computeSplits(logs: EnrichedGameLog[]): PropCard['pro']['splits'] {
  const homeLogs = logs.filter((log) => log.homeAway === 'home');
  const awayLogs = logs.filter((log) => log.homeAway === 'away');
  const rest0Logs = logs.filter((log) => log.restDays === 0);
  const rest1Logs = logs.filter((log) => log.restDays === 1);
  const rest2plusLogs = logs.filter((log) => log.restDays >= 2);

  return {
    home: computeHitRateSummary(homeLogs),
    away: computeHitRateSummary(awayLogs),
    rest0: computeHitRateSummary(rest0Logs),
    rest1: computeHitRateSummary(rest1Logs),
    rest2plus: computeHitRateSummary(rest2plusLogs),
  };
}

/**
 * Compute distribution and volatility
 */
function computeDistribution(
  logs: EnrichedGameLog[],
  line: number
): PropCard['pro']['distribution'] {
  if (logs.length === 0) {
    return {
      buckets: [],
      mean: 0,
      stdDev: 0,
      volatilityScore: 0,
    };
  }

  const values = logs.map((log) => log.statValue);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const stdDev = computeStdDev(values, mean);

  // Create 8 buckets centered around the line
  const buckets = createDistributionBuckets(values, line);

  // Volatility score: normalize stdDev to 0-100 scale
  // For NBA stats:
  // - PTS: typical stdDev 3-8, high volatility > 8
  // - REB: typical stdDev 2-5, high volatility > 5
  // - AST: typical stdDev 2-4, high volatility > 4
  // Use stdDev / (mean * 0.3) as coefficient of variation proxy
  const volatilityScore = normalizeVolatilityScore(stdDev, mean);

  return {
    buckets,
    mean: parseFloat(mean.toFixed(1)),
    stdDev: parseFloat(stdDev.toFixed(1)),
    volatilityScore,
  };
}

/**
 * Compute standard deviation
 */
export function computeStdDev(values: number[], mean?: number): number {
  if (values.length === 0) return 0;

  const avg = mean ?? values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - avg, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Create distribution buckets
 * 
 * Strategy: Create 8 buckets centered around the line
 * - 4 buckets below line
 * - 4 buckets above line
 * - Bucket width = max(2, stdDev / 2)
 */
function createDistributionBuckets(
  values: number[],
  line: number
): { label: string; count: number }[] {
  if (values.length === 0) return [];

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const stdDev = computeStdDev(values, mean);
  const bucketWidth = Math.max(2, stdDev / 2);

  const buckets: { label: string; count: number; min: number; max: number }[] = [];

  // Create 8 buckets
  for (let i = -4; i < 4; i++) {
    const min = line + i * bucketWidth;
    const max = line + (i + 1) * bucketWidth;
    const label = `${min.toFixed(1)}-${max.toFixed(1)}`;

    buckets.push({ label, count: 0, min, max });
  }

  // Count values in each bucket
  for (const value of values) {
    const bucket = buckets.find((b) => value >= b.min && value < b.max);
    if (bucket) {
      bucket.count++;
    } else {
      // Edge case: value equals max of last bucket
      buckets[buckets.length - 1].count++;
    }
  }

  return buckets.map((b) => ({ label: b.label, count: b.count }));
}

/**
 * Normalize volatility score to 0-100
 * 
 * Formula: min(100, (stdDev / mean) * 300)
 * - Low volatility (stdDev < 20% of mean): score < 60
 * - Medium volatility (stdDev 20-30% of mean): score 60-90
 * - High volatility (stdDev > 30% of mean): score 90-100
 */
function normalizeVolatilityScore(stdDev: number, mean: number): number {
  if (mean === 0) return 0;

  const coefficientOfVariation = stdDev / mean;
  const score = coefficientOfVariation * 300;

  return Math.min(100, Math.round(score));
}

/**
 * Compute line sensitivity
 */
function computeSensitivity(
  logs: EnrichedGameLog[],
  line: number
): PropCard['pro']['sensitivity'] {
  if (logs.length === 0) {
    return {
      nearLineRate: 0,
      pushRate: 0,
      lineSensitivityScore: 0,
    };
  }

  // Near line rate: within ±1.0 of line
  const nearLineCount = logs.filter(
    (log) => Math.abs(log.statValue - line) <= 1.0
  ).length;
  const nearLineRate = nearLineCount / logs.length;

  // Push rate
  const pushCount = logs.filter((log) => log.outcome === 'PUSH').length;
  const pushRate = pushCount / logs.length;

  // Line sensitivity score: 0-100 based on near line rate and push rate
  // High sensitivity = many outcomes near the line
  // Formula: (nearLineRate * 0.7 + pushRate * 0.3) * 100
  const lineSensitivityScore = Math.round(
    (nearLineRate * 0.7 + pushRate * 0.3) * 100
  );

  return {
    nearLineRate: parseFloat(nearLineRate.toFixed(3)),
    pushRate: parseFloat(pushRate.toFixed(3)),
    lineSensitivityScore,
  };
}

/**
 * Compute stability (minutes consistency)
 */
function computeStability(logs: EnrichedGameLog[]): PropCard['pro']['stability'] {
  if (logs.length === 0) {
    return {
      minutesStdDevLast10: 0,
      minutesStabilityScore: 0,
      reliabilityNotes: [],
    };
  }

  const minutes = logs.map((log) => log.minutes);
  const avgMinutes = minutes.reduce((sum, val) => sum + val, 0) / minutes.length;
  const minutesStdDev = computeStdDev(minutes, avgMinutes);

  // Stability score: inverse of volatility
  // Low stdDev (0-3 min) = high stability (80-100)
  // Medium stdDev (3-6 min) = medium stability (50-80)
  // High stdDev (6+ min) = low stability (0-50)
  const minutesStabilityScore = computeMinutesStabilityScore(minutesStdDev);

  // Reliability notes
  const reliabilityNotes: string[] = [];

  if (minutesStdDev > 6) {
    reliabilityNotes.push('Minutes highly volatile recently');
  } else if (minutesStdDev > 3) {
    reliabilityNotes.push('Minutes moderately volatile');
  }

  if (avgMinutes < 20) {
    reliabilityNotes.push('Limited minutes per game');
  }

  const lowMinutesGames = logs.filter((log) => log.minutes < avgMinutes - 5).length;
  if (lowMinutesGames >= 3) {
    reliabilityNotes.push(`${lowMinutesGames} games with significantly reduced minutes`);
  }

  return {
    minutesStdDevLast10: parseFloat(minutesStdDev.toFixed(1)),
    minutesStabilityScore,
    reliabilityNotes,
  };
}

/**
 * Compute minutes stability score (0-100)
 * 
 * Formula: max(0, 100 - (stdDev * 10))
 * - 0 stdDev = 100 score (perfectly stable)
 * - 3 stdDev = 70 score
 * - 6 stdDev = 40 score
 * - 10+ stdDev = 0 score
 */
function computeMinutesStabilityScore(stdDev: number): number {
  return Math.max(0, Math.round(100 - stdDev * 10));
}

/**
 * Get context (injury status, schedule)
 */
function getContext(
  player: Player,
  lastGame: EnrichedGameLog | undefined,
  games: Game[],
  injurySnapshot: InjurySnapshot | null,
  gameDate: string
): PropCard['context'] {
  const context: PropCard['context'] = {};

  // Injury status
  if (injurySnapshot) {
    const playerInjury = injurySnapshot.players.find(
      (p) => p.playerId === player.id || p.playerName === player.name
    );

    if (playerInjury) {
      context.injuryStatus = {
        player: {
          status: playerInjury.status,
          notes: playerInjury.notes,
        },
        lastUpdatedAt: new Date(injurySnapshot.snapshotDateTime).toISOString(),
      };

      // Find teammates who are out
      const teammatesOut = injurySnapshot.players
        .filter((p) => p.teamId === player.teamId && p.status === 'OUT')
        .map((p) => ({
          playerId: p.playerId || '',
          name: p.playerName,
          status: p.status,
        }));

      if (teammatesOut.length > 0) {
        context.injuryStatus.teammatesOut = teammatesOut;
      }
    }
  }

  // Schedule context
  if (lastGame) {
    const lastGameDate = new Date(lastGame.date);
    const targetGameDate = new Date(gameDate);
    const diffMs = targetGameDate.getTime() - lastGameDate.getTime();
    const restDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) - 1;

    context.scheduleContext = {
      backToBack: restDays === 0,
      restDays: Math.max(0, restDays),
      lastGameDate: lastGame.date,
    };
  }

  return context;
}

/**
 * Generate debug info
 */
function generateDebugInfo(logs: EnrichedGameLog[]): PropCard['debug'] {
  const sampleSizeNotes: string[] = [];
  const dataQualityWarnings: string[] = [];

  // Sample size notes
  if (logs.length < 10) {
    sampleSizeNotes.push(`Limited sample: only ${logs.length} games available`);
  }
  if (logs.length < 5) {
    dataQualityWarnings.push('Very small sample size - results may not be reliable');
  }

  // Data quality warnings
  const gamesWithZeroMinutes = logs.filter((log) => log.minutes === 0).length;
  if (gamesWithZeroMinutes > 0) {
    dataQualityWarnings.push(`${gamesWithZeroMinutes} games with 0 minutes played`);
  }

  const gamesWithLowMinutes = logs.filter((log) => log.minutes < 10).length;
  if (gamesWithLowMinutes >= 3) {
    dataQualityWarnings.push(`${gamesWithLowMinutes} games with < 10 minutes played`);
  }

  return {
    sampleSizeNotes,
    dataQualityWarnings,
  };
}
