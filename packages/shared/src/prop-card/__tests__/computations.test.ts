/**
 * Computations Unit Tests
 * 
 * Tests for core computation functions including:
 * - Hit rate calculations
 * - Trend slope
 * - Volatility scoring
 * - Line sensitivity
 * - Push handling
 */

import { describe, it, expect } from 'vitest';
import {
  computeOutcome,
  computeHitRateSummary,
  computeMedian,
  computeTrendSlope,
  computeStdDev,
} from '../computations';
import { PlayerGameLog } from '../types';

describe('computeOutcome', () => {
  it('should compute OVER outcomes correctly', () => {
    expect(computeOutcome(28, 27.5, 'OVER')).toBe('WIN');
    expect(computeOutcome(27, 27.5, 'OVER')).toBe('LOSS');
    expect(computeOutcome(27.5, 27.5, 'OVER')).toBe('PUSH');
  });

  it('should compute UNDER outcomes correctly', () => {
    expect(computeOutcome(27, 27.5, 'UNDER')).toBe('WIN');
    expect(computeOutcome(28, 27.5, 'UNDER')).toBe('LOSS');
    expect(computeOutcome(27.5, 27.5, 'UNDER')).toBe('PUSH');
  });

  it('should handle exact line values', () => {
    expect(computeOutcome(10.0, 10.0, 'OVER')).toBe('PUSH');
    expect(computeOutcome(10.0, 10.0, 'UNDER')).toBe('PUSH');
  });

  it('should handle decimal lines', () => {
    expect(computeOutcome(5.5, 5.5, 'OVER')).toBe('PUSH');
    expect(computeOutcome(5.4, 5.5, 'OVER')).toBe('LOSS');
    expect(computeOutcome(5.6, 5.5, 'OVER')).toBe('WIN');
  });
});

describe('computeHitRateSummary', () => {
  const createMockLog = (statValue: number, outcome: 'WIN' | 'LOSS' | 'PUSH'): any => ({
    id: 'test',
    playerId: 'player1',
    gameId: 'game1',
    date: '2025-01-01',
    teamId: 'LAL',
    opponentTeamId: 'GSW',
    homeAway: 'home' as const,
    minutes: 35,
    pts: statValue,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    statValue,
    outcome,
    restDays: 1,
  });

  it('should compute hit rate excluding pushes', () => {
    const logs = [
      createMockLog(30, 'WIN'),
      createMockLog(28, 'WIN'),
      createMockLog(27, 'LOSS'),
      createMockLog(27.5, 'PUSH'),
      createMockLog(26, 'LOSS'),
    ];

    const summary = computeHitRateSummary(logs);

    expect(summary.sampleSize).toBe(5);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(2);
    expect(summary.pushes).toBe(1);
    expect(summary.hitRate).toBe(0.5); // 2 wins / 4 decisive games
  });

  it('should compute average and median correctly', () => {
    const logs = [
      createMockLog(30, 'WIN'),
      createMockLog(25, 'WIN'),
      createMockLog(28, 'LOSS'),
      createMockLog(22, 'LOSS'),
      createMockLog(26, 'WIN'),
    ];

    const summary = computeHitRateSummary(logs);

    expect(summary.avg).toBe(26.2); // (30+25+28+22+26) / 5
    expect(summary.median).toBe(26);
  });

  it('should handle empty sample', () => {
    const summary = computeHitRateSummary([]);

    expect(summary.sampleSize).toBe(0);
    expect(summary.wins).toBe(0);
    expect(summary.losses).toBe(0);
    expect(summary.pushes).toBe(0);
    expect(summary.hitRate).toBe(0);
    expect(summary.avg).toBe(0);
    expect(summary.median).toBe(0);
  });

  it('should handle all pushes', () => {
    const logs = [
      createMockLog(27.5, 'PUSH'),
      createMockLog(27.5, 'PUSH'),
      createMockLog(27.5, 'PUSH'),
    ];

    const summary = computeHitRateSummary(logs);

    expect(summary.sampleSize).toBe(3);
    expect(summary.wins).toBe(0);
    expect(summary.losses).toBe(0);
    expect(summary.pushes).toBe(3);
    expect(summary.hitRate).toBe(0); // No decisive games
  });

  it('should handle perfect win rate', () => {
    const logs = [
      createMockLog(30, 'WIN'),
      createMockLog(29, 'WIN'),
      createMockLog(28, 'WIN'),
    ];

    const summary = computeHitRateSummary(logs);

    expect(summary.hitRate).toBe(1.0);
  });
});

describe('computeMedian', () => {
  it('should compute median for odd-length array', () => {
    expect(computeMedian([1, 2, 3, 4, 5])).toBe(3);
    expect(computeMedian([10, 20, 30])).toBe(20);
  });

  it('should compute median for even-length array', () => {
    expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
    expect(computeMedian([10, 20, 30, 40])).toBe(25);
  });

  it('should handle unsorted arrays', () => {
    expect(computeMedian([5, 1, 4, 2, 3])).toBe(3);
    expect(computeMedian([40, 10, 30, 20])).toBe(25);
  });

  it('should handle single element', () => {
    expect(computeMedian([42])).toBe(42);
  });

  it('should handle empty array', () => {
    expect(computeMedian([])).toBe(0);
  });
});

describe('computeTrendSlope', () => {
  it('should compute positive slope for uptrend', () => {
    const values = [20, 22, 24, 26, 28]; // +2 per game
    const slope = computeTrendSlope(values);
    expect(slope).toBeCloseTo(2.0, 1);
  });

  it('should compute negative slope for downtrend', () => {
    const values = [28, 26, 24, 22, 20]; // -2 per game
    const slope = computeTrendSlope(values);
    expect(slope).toBeCloseTo(-2.0, 1);
  });

  it('should compute zero slope for flat trend', () => {
    const values = [25, 25, 25, 25, 25];
    const slope = computeTrendSlope(values);
    expect(slope).toBeCloseTo(0, 1);
  });

  it('should handle noisy data', () => {
    const values = [20, 22, 21, 23, 22, 24, 23, 25]; // Overall uptrend
    const slope = computeTrendSlope(values);
    expect(slope).toBeGreaterThan(0);
    expect(slope).toBeLessThan(1);
  });

  it('should handle small sample', () => {
    expect(computeTrendSlope([10, 12])).toBeCloseTo(2.0, 1);
    expect(computeTrendSlope([10])).toBe(0);
    expect(computeTrendSlope([])).toBe(0);
  });

  it('should use linear regression formula correctly', () => {
    // Test case with known expected slope
    // y = 2x + 10, for x = 0,1,2,3,4 -> y = 10,12,14,16,18
    const values = [10, 12, 14, 16, 18];
    const slope = computeTrendSlope(values);
    expect(slope).toBeCloseTo(2.0, 5);
  });
});

describe('computeStdDev', () => {
  it('should compute standard deviation correctly', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = computeStdDev(values, mean);
    expect(stdDev).toBeCloseTo(2.0, 1);
  });

  it('should handle uniform values (zero variance)', () => {
    const values = [5, 5, 5, 5, 5];
    const stdDev = computeStdDev(values);
    expect(stdDev).toBe(0);
  });

  it('should compute without explicit mean', () => {
    const values = [10, 20, 30, 40, 50];
    const stdDev = computeStdDev(values);
    expect(stdDev).toBeGreaterThan(0);
  });

  it('should handle empty array', () => {
    expect(computeStdDev([])).toBe(0);
  });

  it('should handle single value', () => {
    expect(computeStdDev([42])).toBe(0);
  });
});

describe('Integration: Full computation flow', () => {
  it('should handle realistic game log scenario', () => {
    // LeBron James over 27.5 points scenario
    const createLog = (pts: number, date: string): any => ({
      id: `log_${date}`,
      playerId: 'lebron',
      gameId: `game_${date}`,
      date,
      teamId: 'LAL',
      opponentTeamId: 'GSW',
      homeAway: 'home' as const,
      minutes: 35,
      pts,
      reb: 8,
      ast: 7,
      stl: 1,
      blk: 1,
      tov: 3,
      updatedAt: Date.now(),
      createdAt: Date.now(),
      statValue: pts,
      outcome: pts > 27.5 ? 'WIN' : pts < 27.5 ? 'LOSS' : 'PUSH',
      restDays: 1,
    });

    const logs = [
      createLog(32, '2025-01-10'), // WIN
      createLog(28, '2025-01-08'), // WIN
      createLog(25, '2025-01-06'), // LOSS
      createLog(30, '2025-01-04'), // WIN
      createLog(27.5, '2025-01-02'), // PUSH
      createLog(29, '2025-01-01'), // WIN
    ];

    const summary = computeHitRateSummary(logs);

    expect(summary.sampleSize).toBe(6);
    expect(summary.wins).toBe(4);
    expect(summary.losses).toBe(1);
    expect(summary.pushes).toBe(1);
    expect(summary.hitRate).toBe(0.8); // 4/5 (excluding push)
    expect(summary.avg).toBeCloseTo(28.58, 1);

    const slope = computeTrendSlope(logs.map((log) => log.statValue).reverse());
    expect(slope).toBeGreaterThan(0); // Trending up
  });
});
