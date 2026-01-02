/**
 * Insights Generator
 * 
 * Deterministic rule-based engine for generating 3 research insights.
 * NEVER provides betting advice or recommendations.
 * 
 * Insight categories:
 * 1. Hit rate & sample quality
 * 2. Trend & minutes dependency
 * 3. Volatility, line sensitivity, or context
 */

import {
  PropCard,
  CardMetrics,
  BANNED_TERMS,
  Side,
  TrendDirection,
} from './types';

/**
 * Generate exactly 3 insight bullets for a prop card
 * 
 * @param card Computed prop card
 * @returns Array of exactly 3 insight strings
 */
export function generateInsights(card: PropCard): string[] {
  const metrics = extractMetrics(card);

  const insights: string[] = [];

  // Insight 1: Hit rate & sample
  insights.push(generateHitRateInsight(card, metrics));

  // Insight 2: Trend & minutes dependency
  insights.push(generateTrendInsight(card, metrics));

  // Insight 3: Volatility, sensitivity, or context
  insights.push(generateVolatilityOrContextInsight(card, metrics));

  // Validate no banned terms
  validateInsights(insights);

  return insights;
}

/**
 * Extract metrics from card for insight generation
 */
function extractMetrics(card: PropCard): CardMetrics {
  const { summary, trend, pro } = card;

  // Minutes correlation: calculate how much minutes affect outcomes
  const minutesCorrelation = computeMinutesCorrelation(card);

  return {
    last10HitRate: summary.last10.hitRate,
    last20HitRate: summary.last20.hitRate,
    seasonHitRate: summary.season.hitRate,
    trendDirection: trend.trendDirection,
    volatilityScore: pro.distribution.volatilityScore,
    lineSensitivityScore: pro.sensitivity.lineSensitivityScore,
    minutesStabilityScore: pro.stability.minutesStabilityScore,
    minutesCorrelation,
    sampleSize: {
      last10: summary.last10.sampleSize,
      last20: summary.last20.sampleSize,
      season: summary.season.sampleSize,
    },
    avgMinutesLast10:
      trend.minutesLast5.reduce((sum, point) => sum + point.y, 0) /
      trend.minutesLast5.length,
    splits: {
      homeDiff: pro.splits.home.hitRate - pro.splits.away.hitRate,
      b2bDiff: pro.splits.rest0.hitRate - pro.splits.rest2plus.hitRate,
    },
  };
}

/**
 * Compute minutes correlation with outcomes
 * 
 * Strategy: Check if high-minute games have higher win rates
 */
function computeMinutesCorrelation(card: PropCard): number {
  const { last5GameLogs } = card.trend;

  if (last5GameLogs.length === 0) return 0;

  const avgMinutes =
    last5GameLogs.reduce((sum, log) => sum + log.minutes, 0) /
    last5GameLogs.length;

  const highMinutesGames = last5GameLogs.filter(
    (log) => log.minutes >= avgMinutes
  );
  const highMinutesWins = highMinutesGames.filter(
    (log) => log.outcome === 'WIN'
  ).length;

  if (highMinutesGames.length === 0) return 0;

  const highMinutesWinRate = highMinutesWins / highMinutesGames.length;

  // If high minutes win rate > overall win rate by 20%+, strong correlation
  const overallWinRate = card.summary.last10.hitRate;
  return highMinutesWinRate - overallWinRate;
}

/**
 * Generate hit rate insight (Insight #1)
 * 
 * Templates:
 * - "{Side} hit X/Y in last Z games (N pushes)"
 * - Include sample size warnings if applicable
 * - Include win streak or loss streak if present
 */
function generateHitRateInsight(
  card: PropCard,
  metrics: CardMetrics
): string {
  const { summary, meta } = card;
  const { last10, last20 } = summary;

  // Choose primary window (prefer last10 if sample >= 8)
  const primary = last10.sampleSize >= 8 ? last10 : last20;
  const windowLabel = last10.sampleSize >= 8 ? '10' : '20';

  const side = meta.side === 'OVER' ? 'OVER' : 'UNDER';
  const wins = primary.wins;
  const losses = primary.losses;
  const pushes = primary.pushes;
  const sampleSize = primary.sampleSize;

  // Base insight
  let insight = `The ${side} hit ${wins}/${wins + losses} in the last ${windowLabel} games`;

  // Add push info if present
  if (pushes > 0) {
    insight += ` (${pushes} ${pushes === 1 ? 'push' : 'pushes'})`;
  }

  insight += '.';

  // Add sample size warning if small
  if (sampleSize < 10) {
    insight += ` Limited sample size.`;
  }

  // Check for streak (3+ in a row)
  const streak = detectStreak(card.trend.last5GameLogs);
  if (streak.length >= 3) {
    const streakType = streak[0].outcome;
    insight += ` Currently on a ${streak.length}-game ${streakType.toLowerCase()} streak.`;
  }

  return insight;
}

/**
 * Detect win/loss streak in recent games
 */
function detectStreak(
  logs: PropCard['trend']['last5GameLogs']
): PropCard['trend']['last5GameLogs'] {
  if (logs.length === 0) return [];

  const streak: typeof logs = [logs[0]];
  const streakOutcome = logs[0].outcome;

  for (let i = 1; i < logs.length; i++) {
    if (logs[i].outcome === streakOutcome) {
      streak.push(logs[i]);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Generate trend insight (Insight #2)
 * 
 * Templates:
 * - "Trending {UP/DOWN/FLAT} recently (slope: X)"
 * - "Minutes correlation: X of Y wins came with Z+ minutes"
 * - "Minutes volatility: {high/medium/low}"
 */
function generateTrendInsight(card: PropCard, metrics: CardMetrics): string {
  const { trend, summary, pro } = card;

  let insight = '';

  // Trend direction
  if (trend.trendDirection === 'UP') {
    insight = `Trending up recently with an average gain of ${Math.abs(
      trend.trendSlopeLast10
    ).toFixed(1)} per game.`;
  } else if (trend.trendDirection === 'DOWN') {
    insight = `Trending down recently with an average decline of ${Math.abs(
      trend.trendSlopeLast10
    ).toFixed(1)} per game.`;
  } else {
    insight = `Performance has been relatively flat over the last 10 games.`;
  }

  // Minutes dependency
  if (metrics.minutesCorrelation > 0.2) {
    const avgMinutes = metrics.avgMinutesLast10.toFixed(1);
    insight += ` Results correlate strongly with playing time (avg ${avgMinutes} min).`;
  } else if (metrics.minutesCorrelation < -0.2) {
    insight += ` Interestingly, outcomes do not correlate with minutes played.`;
  }

  // Minutes stability
  if (pro.stability.minutesStabilityScore < 50) {
    insight += ` Minutes have been volatile (±${pro.stability.minutesStdDevLast10} min).`;
  }

  return insight;
}

/**
 * Generate volatility or context insight (Insight #3)
 * 
 * Templates:
 * - "High volatility: outcomes vary widely (std dev X)"
 * - "Line sensitivity: Y% of games within ±1 of line"
 * - "Context: [injury/schedule info]"
 * - "Split: performs better at home/away or with rest"
 */
function generateVolatilityOrContextInsight(
  card: PropCard,
  metrics: CardMetrics
): string {
  const { pro, context, meta } = card;

  // Priority 1: Injury context
  if (context.injuryStatus?.player) {
    const status = context.injuryStatus.player.status;
    return `Injury report shows player listed as ${status}.${
      context.injuryStatus.teammatesOut &&
      context.injuryStatus.teammatesOut.length > 0
        ? ` ${context.injuryStatus.teammatesOut.length} teammate(s) also out.`
        : ''
    }`;
  }

  // Priority 2: High line sensitivity
  if (metrics.lineSensitivityScore > 60) {
    const nearLineRate = (pro.sensitivity.nearLineRate * 100).toFixed(0);
    return `High line sensitivity: ${nearLineRate}% of recent games landed within ±1 of the line. Outcomes cluster near ${meta.line}.`;
  }

  // Priority 3: High volatility
  if (metrics.volatilityScore > 70) {
    const stdDev = pro.distribution.stdDev;
    return `High volatility with a standard deviation of ${stdDev}. Results vary widely game-to-game.`;
  }

  // Priority 4: Significant home/away split
  if (Math.abs(metrics.splits.homeDiff) > 0.25) {
    const better = metrics.splits.homeDiff > 0 ? 'home' : 'away';
    const homeDiffPct = (Math.abs(metrics.splits.homeDiff) * 100).toFixed(0);
    return `Performs ${homeDiffPct}% better at ${better} (${
      pro.splits.home.wins
    }/${pro.splits.home.sampleSize} home, ${pro.splits.away.wins}/${
      pro.splits.away.sampleSize
    } away).`;
  }

  // Priority 5: Back-to-back impact
  if (
    Math.abs(metrics.splits.b2bDiff) > 0.2 &&
    pro.splits.rest0.sampleSize >= 2
  ) {
    const impact = metrics.splits.b2bDiff < 0 ? 'struggles' : 'performs well';
    return `${impact.charAt(0).toUpperCase() + impact.slice(1)} on back-to-back games (${
      pro.splits.rest0.wins
    }/${pro.splits.rest0.sampleSize} B2B vs ${pro.splits.rest2plus.wins}/${
      pro.splits.rest2plus.sampleSize
    } with 2+ days rest).`;
  }

  // Priority 6: Schedule context
  if (context.scheduleContext?.backToBack) {
    return `Upcoming game is on a back-to-back with only ${context.scheduleContext.restDays} days rest.`;
  }

  // Default: General volatility insight
  const volatilityLabel =
    metrics.volatilityScore > 70
      ? 'high'
      : metrics.volatilityScore > 40
      ? 'moderate'
      : 'low';
  return `Results show ${volatilityLabel} volatility with a standard deviation of ${pro.distribution.stdDev}.`;
}

/**
 * Validate insights don't contain banned terms
 * 
 * Throws error if any banned term is found
 */
function validateInsights(insights: string[]): void {
  for (const insight of insights) {
    const lowerInsight = insight.toLowerCase();

    for (const term of BANNED_TERMS) {
      if (lowerInsight.includes(term.toLowerCase())) {
        throw new Error(
          `Insight validation failed: contains banned term "${term}"`
        );
      }
    }
  }
}

/**
 * Check if text contains any banned terms
 * 
 * @param text Text to check
 * @returns True if contains banned terms
 */
export function containsBannedTerms(text: string): boolean {
  const lowerText = text.toLowerCase();

  for (const term of BANNED_TERMS) {
    if (lowerText.includes(term.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Get banned terms list
 */
export function getBannedTerms(): readonly string[] {
  return BANNED_TERMS;
}
