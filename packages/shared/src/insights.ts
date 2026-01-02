import {
  PlayerGameStat,
  StatType,
  OverUnder,
  InjuryPlayer,
  MinutesTrend,
  VolatilityData,
  TrendSlopeData,
  MinutesStabilityData,
  LineSensitivityData,
} from './types';
import { MINUTES_SPIKE_THRESHOLD } from './constants';

// ============================================================================
// INSIGHT GENERATION (Rule-Based, Deterministic)
// ============================================================================

export function generateInsights(params: {
  games: PlayerGameStat[];
  statType: StatType;
  line: number;
  overUnder: OverUnder;
  minutesTrend: MinutesTrend;
  volatility: VolatilityData;
  trendSlope: TrendSlopeData;
  minutesStability: MinutesStabilityData;
  lineSensitivity: LineSensitivityData;
  injuredTeammates: InjuryPlayer[];
  isBackToBack: boolean;
}): string[] {
  const insights: string[] = [];

  // Insight 1: Minutes Trend
  if (Math.abs(params.minutesTrend.change) >= MINUTES_SPIKE_THRESHOLD) {
    const direction = params.minutesTrend.change > 0 ? 'up' : 'down';
    insights.push(
      `Minutes trending ${direction} significantly: ${Math.abs(params.minutesTrend.change).toFixed(1)} min ${direction} vs season avg (${params.minutesTrend.seasonAvg.toFixed(1)} MPG).`
    );
  }

  // Insight 2: Volatility Warning
  if (params.volatility.rating === 'high') {
    insights.push(
      `High volatility detected (σ = ${params.volatility.stdDev.toFixed(1)}): Results vary widely game-to-game.`
    );
  }

  // Insight 3: Trend Slope
  if (params.trendSlope.strength !== 'weak') {
    const direction = params.trendSlope.direction === 'increasing' ? 'upward' : 'downward';
    insights.push(
      `${params.statType} shows ${params.trendSlope.strength} ${direction} trend over last 10 games (slope: ${params.trendSlope.slope.toFixed(2)}).`
    );
  }

  // Insight 4: Line Sensitivity
  if (params.lineSensitivity.rating === 'high') {
    insights.push(
      `Line is in a high-frequency zone: ${params.lineSensitivity.withinOnePercent.toFixed(0)}% of last 20 games within ±1 of ${params.line}.`
    );
  }

  // Insight 5: Minutes Stability
  if (params.minutesStability.rating === 'volatile') {
    insights.push(
      `Minutes usage is volatile (σ = ${params.minutesStability.stdDev.toFixed(1)}): Role consistency may impact production.`
    );
  }

  // Insight 6: Injured Teammates
  if (params.injuredTeammates.length > 0) {
    const names = params.injuredTeammates.slice(0, 2).map(p => p.playerName).join(', ');
    insights.push(
      `${params.injuredTeammates.length} teammate(s) injured (${names}): Possible increased usage opportunity.`
    );
  }

  // Insight 7: Back-to-Back
  if (params.isBackToBack) {
    insights.push(
      `Playing on back-to-back: Monitor for reduced minutes or rest decisions.`
    );
  }

  // Return top 3 insights (prioritize by order above)
  return insights.slice(0, 3);
}

// ============================================================================
// DAILY CHANGE DETECTION
// ============================================================================

export interface DailyChangeParams {
  currentInjuries: InjuryPlayer[];
  previousInjuries: InjuryPlayer[];
  currentMinutes: Map<string, number>; // playerId -> last 10 avg
  previousMinutes: Map<string, number>; // playerId -> previous last 10 avg
  backToBackTeams: string[]; // teamIds playing back-to-back
}

export function detectDailyChanges(params: DailyChangeParams): {
  category: 'injury' | 'minutes' | 'back-to-back';
  playerId?: string;
  teamId?: string;
  playerName?: string;
  teamName?: string;
  summary: string;
  severity: 'high' | 'medium' | 'low';
  details?: Record<string, any>;
}[] {
  const changes: any[] = [];

  // Detect injury status changes
  const prevInjuryMap = new Map(
    params.previousInjuries.map(p => [p.playerId, p])
  );

  params.currentInjuries.forEach(curr => {
    const prev = prevInjuryMap.get(curr.playerId);
    
    if (!prev) {
      // New injury
      changes.push({
        category: 'injury',
        playerId: curr.playerId,
        playerName: curr.playerName,
        teamId: curr.teamId,
        summary: `${curr.playerName} newly listed as ${curr.status}`,
        severity: curr.status === 'OUT' ? 'high' : curr.status === 'DOUBTFUL' ? 'medium' : 'low',
        details: { status: curr.status, notes: curr.notes },
      });
    } else if (prev.status !== curr.status) {
      // Status changed
      const severity = 
        (prev.status === 'OUT' && curr.status !== 'OUT') ? 'high' : // Returning
        (prev.status !== 'OUT' && curr.status === 'OUT') ? 'high' : // Going out
        'medium';
      
      changes.push({
        category: 'injury',
        playerId: curr.playerId,
        playerName: curr.playerName,
        teamId: curr.teamId,
        summary: `${curr.playerName} status changed: ${prev.status} → ${curr.status}`,
        severity,
        details: { previousStatus: prev.status, currentStatus: curr.status, notes: curr.notes },
      });
    }
  });

  // Detect minutes spikes
  params.currentMinutes.forEach((currentAvg, playerId) => {
    const previousAvg = params.previousMinutes.get(playerId);
    
    if (previousAvg) {
      const change = currentAvg - previousAvg;
      
      if (Math.abs(change) >= MINUTES_SPIKE_THRESHOLD) {
        changes.push({
          category: 'minutes',
          playerId,
          summary: `Large minutes change: ${change > 0 ? '+' : ''}${change.toFixed(1)} MPG (L10)`,
          severity: Math.abs(change) >= 12 ? 'high' : 'medium',
          details: { previousAvg, currentAvg, change },
        });
      }
    }
  });

  // Back-to-back games
  params.backToBackTeams.forEach(teamId => {
    changes.push({
      category: 'back-to-back',
      teamId,
      summary: `Playing on back-to-back`,
      severity: 'low',
    });
  });

  return changes;
}
