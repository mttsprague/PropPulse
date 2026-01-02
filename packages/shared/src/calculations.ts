import {
  PlayerGameStat,
  StatType,
  OverUnder,
  HitRates,
  HitRateStats,
  RecentTrend,
  GameLogEntry,
  ChartDataPoint,
  MinutesTrend,
  ProAnalytics,
  Splits,
  DistributionData,
  DistributionBucket,
  VolatilityData,
  TrendSlopeData,
  MinutesStabilityData,
  LineSensitivityData,
  SplitStats,
  RestDaySplits,
  HomeAway,
} from './types';
import {
  DISTRIBUTION_BUCKET_SIZE,
  VOLATILITY_THRESHOLDS,
  TREND_SLOPE_THRESHOLDS,
  MINUTES_STABILITY_THRESHOLDS,
  LINE_SENSITIVITY_THRESHOLDS,
} from './constants';

// ============================================================================
// HIT RATE CALCULATIONS
// ============================================================================

export function calculateHitRates(
  games: PlayerGameStat[],
  statType: StatType,
  line: number,
  overUnder: OverUnder
): HitRates {
  const sortedGames = [...games].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return {
    last10: calculateHitRateForGames(sortedGames.slice(0, 10), statType, line, overUnder),
    last20: calculateHitRateForGames(sortedGames.slice(0, 20), statType, line, overUnder),
    season: calculateHitRateForGames(sortedGames, statType, line, overUnder),
  };
}

function calculateHitRateForGames(
  games: PlayerGameStat[],
  statType: StatType,
  line: number,
  overUnder: OverUnder
): HitRateStats {
  let wins = 0;
  let losses = 0;
  let pushes = 0;

  games.forEach((game) => {
    const statValue = game[statType.toLowerCase() as 'pts' | 'reb' | 'ast'];
    const result = determineResult(statValue, line, overUnder);
    
    if (result === 'W') wins++;
    else if (result === 'L') losses++;
    else if (result === 'P') pushes++;
  });

  const totalGames = games.length;
  const hitRate = totalGames - pushes > 0 
    ? (wins / (totalGames - pushes)) * 100 
    : 0;

  return {
    wins,
    losses,
    pushes,
    hitRate: Math.round(hitRate * 100) / 100,
    totalGames,
  };
}

function determineResult(statValue: number, line: number, overUnder: OverUnder): 'W' | 'L' | 'P' {
  if (statValue === line) return 'P';
  
  if (overUnder === 'O') {
    return statValue > line ? 'W' : 'L';
  } else {
    return statValue < line ? 'W' : 'L';
  }
}

// ============================================================================
// RECENT TREND CALCULATIONS
// ============================================================================

export function calculateRecentTrend(
  games: PlayerGameStat[],
  statType: StatType,
  line: number,
  overUnder: OverUnder,
  teamMap: Map<string, string> // teamId -> team name
): RecentTrend {
  const sortedGames = [...games].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const last5 = sortedGames.slice(0, 5);
  const last10 = sortedGames.slice(0, 10);

  const last5GameLog: GameLogEntry[] = last5.map((game) => ({
    date: game.date,
    opponent: teamMap.get(game.opponentTeamId) || game.opponentTeamId,
    homeAway: game.homeAway,
    minutes: game.minutes,
    statValue: game[statType.toLowerCase() as 'pts' | 'reb' | 'ast'],
    result: determineResult(
      game[statType.toLowerCase() as 'pts' | 'reb' | 'ast'],
      line,
      overUnder
    ),
  }));

  const rollingAverageChart: ChartDataPoint[] = calculateRollingAverage(
    last10,
    statType
  );

  const minutesTrend = calculateMinutesTrend(sortedGames);

  return {
    last5GameLog,
    rollingAverageChart,
    minutesTrend,
  };
}

function calculateRollingAverage(
  games: PlayerGameStat[],
  statType: StatType
): ChartDataPoint[] {
  const statKey = statType.toLowerCase() as 'pts' | 'reb' | 'ast';
  
  return games.map((game, index) => ({
    gameNumber: games.length - index,
    value: game[statKey],
    date: game.date,
  })).reverse();
}

function calculateMinutesTrend(games: PlayerGameStat[]): MinutesTrend {
  const last5 = games.slice(0, 5);
  const last5Avg = average(last5.map(g => g.minutes));
  const seasonAvg = average(games.map(g => g.minutes));
  const change = last5Avg - seasonAvg;
  const changePercent = seasonAvg > 0 ? (change / seasonAvg) * 100 : 0;

  return {
    last5Avg: Math.round(last5Avg * 10) / 10,
    seasonAvg: Math.round(seasonAvg * 10) / 10,
    change: Math.round(change * 10) / 10,
    changePercent: Math.round(changePercent * 10) / 10,
  };
}

// ============================================================================
// PRO ANALYTICS CALCULATIONS
// ============================================================================

export function calculateProAnalytics(
  games: PlayerGameStat[],
  statType: StatType,
  line: number,
  overUnder: OverUnder
): ProAnalytics {
  const sortedGames = [...games].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return {
    splits: calculateSplits(sortedGames, statType, line, overUnder),
    distribution: calculateDistribution(sortedGames, statType),
    volatility: calculateVolatility(sortedGames, statType),
    trendSlope: calculateTrendSlope(sortedGames, statType),
    minutesStability: calculateMinutesStability(sortedGames),
    lineSensitivity: calculateLineSensitivity(sortedGames, statType, line),
  };
}

function calculateSplits(
  games: PlayerGameStat[],
  statType: StatType,
  line: number,
  overUnder: OverUnder
): Splits {
  const homeGames = games.filter(g => g.homeAway === 'home');
  const awayGames = games.filter(g => g.homeAway === 'away');

  // Calculate rest days for each game (simplified - would need full schedule)
  const restDayGames = categorizeByRestDays(games);

  return {
    homeAway: {
      home: calculateHitRateForGames(homeGames, statType, line, overUnder),
      away: calculateHitRateForGames(awayGames, statType, line, overUnder),
    },
    restDays: {
      zero: calculateHitRateForGames(restDayGames.zero, statType, line, overUnder),
      one: calculateHitRateForGames(restDayGames.one, statType, line, overUnder),
      twoPlus: calculateHitRateForGames(restDayGames.twoPlus, statType, line, overUnder),
    },
  };
}

function categorizeByRestDays(games: PlayerGameStat[]): {
  zero: PlayerGameStat[];
  one: PlayerGameStat[];
  twoPlus: PlayerGameStat[];
} {
  const sorted = [...games].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const zero: PlayerGameStat[] = [];
  const one: PlayerGameStat[] = [];
  const twoPlus: PlayerGameStat[] = [];

  sorted.forEach((game, index) => {
    if (index === 0) {
      twoPlus.push(game);
      return;
    }

    const prevDate = new Date(sorted[index - 1].date);
    const currDate = new Date(game.date);
    const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 1) {
      zero.push(game);
    } else if (daysDiff === 2) {
      one.push(game);
    } else {
      twoPlus.push(game);
    }
  });

  return { zero, one, twoPlus };
}

function calculateDistribution(
  games: PlayerGameStat[],
  statType: StatType
): DistributionData {
  const last20 = games.slice(0, 20);
  const statKey = statType.toLowerCase() as 'pts' | 'reb' | 'ast';
  const values = last20.map(g => g[statKey]);

  if (values.length === 0) {
    return {
      buckets: [],
      mean: 0,
      median: 0,
    };
  }

  const mean = average(values);
  const median = calculateMedian(values);
  const buckets = createDistributionBuckets(values);

  return {
    buckets,
    mean: Math.round(mean * 10) / 10,
    median: Math.round(median * 10) / 10,
  };
}

function createDistributionBuckets(values: number[]): DistributionBucket[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const bucketCount = Math.ceil((max - min) / DISTRIBUTION_BUCKET_SIZE) + 1;

  const buckets: DistributionBucket[] = [];
  
  for (let i = 0; i < bucketCount; i++) {
    const rangeStart = Math.floor(min / DISTRIBUTION_BUCKET_SIZE) * DISTRIBUTION_BUCKET_SIZE + i * DISTRIBUTION_BUCKET_SIZE;
    const rangeEnd = rangeStart + DISTRIBUTION_BUCKET_SIZE - 1;
    const count = values.filter(v => v >= rangeStart && v <= rangeEnd).length;
    
    if (count > 0) {
      buckets.push({
        range: `${rangeStart}-${rangeEnd}`,
        count,
        percentage: Math.round((count / values.length) * 100 * 10) / 10,
      });
    }
  }

  return buckets;
}

function calculateVolatility(
  games: PlayerGameStat[],
  statType: StatType
): VolatilityData {
  const last20 = games.slice(0, 20);
  const statKey = statType.toLowerCase() as 'pts' | 'reb' | 'ast';
  const values = last20.map(g => g[statKey]);

  const mean = average(values);
  const stdDev = standardDeviation(values);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

  let rating: 'low' | 'medium' | 'high';
  if (coefficientOfVariation < VOLATILITY_THRESHOLDS.low) {
    rating = 'low';
  } else if (coefficientOfVariation < VOLATILITY_THRESHOLDS.medium) {
    rating = 'medium';
  } else {
    rating = 'high';
  }

  return {
    stdDev: Math.round(stdDev * 100) / 100,
    coefficientOfVariation: Math.round(coefficientOfVariation * 1000) / 1000,
    rating,
  };
}

function calculateTrendSlope(
  games: PlayerGameStat[],
  statType: StatType
): TrendSlopeData {
  const last10 = games.slice(0, 10).reverse(); // Oldest to newest
  const statKey = statType.toLowerCase() as 'pts' | 'reb' | 'ast';
  const values = last10.map(g => g[statKey]);

  const slope = linearRegressionSlope(values);
  
  let direction: 'increasing' | 'decreasing' | 'stable';
  if (Math.abs(slope) < TREND_SLOPE_THRESHOLDS.weak) {
    direction = 'stable';
  } else if (slope > 0) {
    direction = 'increasing';
  } else {
    direction = 'decreasing';
  }

  let strength: 'weak' | 'moderate' | 'strong';
  const absSlope = Math.abs(slope);
  if (absSlope < TREND_SLOPE_THRESHOLDS.weak) {
    strength = 'weak';
  } else if (absSlope < TREND_SLOPE_THRESHOLDS.moderate) {
    strength = 'moderate';
  } else {
    strength = 'strong';
  }

  return {
    slope: Math.round(slope * 100) / 100,
    direction,
    strength,
  };
}

function calculateMinutesStability(games: PlayerGameStat[]): MinutesStabilityData {
  const last10 = games.slice(0, 10);
  const minutes = last10.map(g => g.minutes);
  const stdDev = standardDeviation(minutes);

  let rating: 'stable' | 'moderate' | 'volatile';
  if (stdDev < MINUTES_STABILITY_THRESHOLDS.stable) {
    rating = 'stable';
  } else if (stdDev < MINUTES_STABILITY_THRESHOLDS.moderate) {
    rating = 'moderate';
  } else {
    rating = 'volatile';
  }

  return {
    stdDev: Math.round(stdDev * 10) / 10,
    rating,
  };
}

function calculateLineSensitivity(
  games: PlayerGameStat[],
  statType: StatType,
  line: number
): LineSensitivityData {
  const last20 = games.slice(0, 20);
  const statKey = statType.toLowerCase() as 'pts' | 'reb' | 'ast';
  
  let withinOne = 0;
  let pushes = 0;

  last20.forEach(game => {
    const value = game[statKey];
    if (Math.abs(value - line) <= 1) {
      withinOne++;
    }
    if (value === line) {
      pushes++;
    }
  });

  const withinOnePercent = last20.length > 0 ? withinOne / last20.length : 0;
  const pushRate = last20.length > 0 ? pushes / last20.length : 0;

  let rating: 'low' | 'medium' | 'high';
  if (withinOnePercent < LINE_SENSITIVITY_THRESHOLDS.low) {
    rating = 'low';
  } else if (withinOnePercent < LINE_SENSITIVITY_THRESHOLDS.medium) {
    rating = 'medium';
  } else {
    rating = 'high';
  }

  return {
    withinOneLast20: withinOne,
    withinOnePercent: Math.round(withinOnePercent * 100 * 10) / 10,
    pushRateLast20: Math.round(pushRate * 100 * 10) / 10,
    rating,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(values);
  const squareDiffs = values.map(val => Math.pow(val - avg, 2));
  const avgSquareDiff = average(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}

function linearRegressionSlope(values: number[]): number {
  if (values.length < 2) return 0;
  
  const n = values.length;
  const xValues = Array.from({ length: n }, (_, i) => i);
  const xMean = average(xValues);
  const yMean = average(values);
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n; i++) {
    numerator += (xValues[i] - xMean) * (values[i] - yMean);
    denominator += Math.pow(xValues[i] - xMean, 2);
  }
  
  return denominator !== 0 ? numerator / denominator : 0;
}
