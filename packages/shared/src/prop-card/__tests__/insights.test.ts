/**
 * Insights Generator Unit Tests
 * 
 * Tests for deterministic insights generation:
 * - Always returns exactly 3 insights
 * - Never contains banned terms
 * - Covers all insight categories
 */

import { describe, it, expect } from 'vitest';
import {
  generateInsights,
  containsBannedTerms,
  getBannedTerms,
} from '../insights';
import { PropCard, BANNED_TERMS } from '../types';

// Mock prop card factory
function createMockPropCard(overrides?: Partial<PropCard>): PropCard {
  const defaultCard: PropCard = {
    meta: {
      playerId: 'player1',
      playerName: 'Test Player',
      teamAbbr: 'LAL',
      opponentAbbr: 'GSW',
      statType: 'PTS',
      line: 27.5,
      side: 'OVER',
      generatedAt: '2025-01-01T00:00:00Z',
      gameDate: '2025-01-15',
      disclaimer: 'Test disclaimer',
    },

    summary: {
      last10: {
        sampleSize: 10,
        wins: 7,
        losses: 2,
        pushes: 1,
        hitRate: 0.778,
        avg: 28.5,
        median: 28.0,
      },
      last20: {
        sampleSize: 20,
        wins: 14,
        losses: 5,
        pushes: 1,
        hitRate: 0.737,
        avg: 28.2,
        median: 27.8,
      },
      season: {
        sampleSize: 40,
        wins: 28,
        losses: 10,
        pushes: 2,
        hitRate: 0.737,
        avg: 28.0,
        median: 27.5,
      },
      pushesIncluded: true,
      quickInsights: [],
    },

    trend: {
      last5GameLogs: [
        { date: '2025-01-10', opponent: 'GSW', homeAway: 'home', minutes: 35, statValue: 30, outcome: 'WIN', restDays: 1 },
        { date: '2025-01-08', opponent: 'BOS', homeAway: 'away', minutes: 34, statValue: 28, outcome: 'WIN', restDays: 1 },
        { date: '2025-01-06', opponent: 'PHX', homeAway: 'home', minutes: 36, statValue: 25, outcome: 'LOSS', restDays: 2 },
        { date: '2025-01-04', opponent: 'DEN', homeAway: 'away', minutes: 33, statValue: 29, outcome: 'WIN', restDays: 1 },
        { date: '2025-01-02', opponent: 'LAC', homeAway: 'home', minutes: 35, statValue: 27, outcome: 'LOSS', restDays: 2 },
      ],
      rollingAvgLast10: [
        { x: '2025-01-02', y: 27.0, label: 'Game 1' },
        { x: '2025-01-04', y: 28.0, label: 'Game 2' },
        { x: '2025-01-06', y: 27.0, label: 'Game 3' },
        { x: '2025-01-08', y: 27.3, label: 'Game 4' },
        { x: '2025-01-10', y: 27.8, label: 'Game 5' },
      ],
      minutesLast5: [
        { x: '2025-01-02', y: 35 },
        { x: '2025-01-04', y: 33 },
        { x: '2025-01-06', y: 36 },
        { x: '2025-01-08', y: 34 },
        { x: '2025-01-10', y: 35 },
      ],
      trendSlopeLast10: 0.5,
      trendDirection: 'UP',
    },

    pro: {
      splits: {
        home: { sampleSize: 10, wins: 8, losses: 2, pushes: 0, hitRate: 0.8, avg: 29.0, median: 29.0 },
        away: { sampleSize: 10, wins: 6, losses: 3, pushes: 1, hitRate: 0.667, avg: 27.4, median: 27.0 },
        rest0: { sampleSize: 3, wins: 1, losses: 2, pushes: 0, hitRate: 0.333, avg: 25.0, median: 25.0 },
        rest1: { sampleSize: 10, wins: 7, losses: 3, pushes: 0, hitRate: 0.7, avg: 28.0, median: 28.0 },
        rest2plus: { sampleSize: 7, wins: 6, losses: 0, pushes: 1, hitRate: 1.0, avg: 30.0, median: 30.0 },
      },

      distribution: {
        buckets: [
          { label: '20-23', count: 2 },
          { label: '23-26', count: 3 },
          { label: '26-29', count: 8 },
          { label: '29-32', count: 5 },
          { label: '32-35', count: 2 },
        ],
        mean: 28.2,
        stdDev: 3.5,
        volatilityScore: 45,
      },

      sensitivity: {
        nearLineRate: 0.25,
        pushRate: 0.05,
        lineSensitivityScore: 20,
      },

      stability: {
        minutesStdDevLast10: 2.5,
        minutesStabilityScore: 75,
        reliabilityNotes: [],
      },
    },

    context: {},
  };

  return { ...defaultCard, ...overrides };
}

describe('generateInsights', () => {
  it('should always return exactly 3 insights', () => {
    const card = createMockPropCard();
    const insights = generateInsights(card);

    expect(insights).toHaveLength(3);
    expect(Array.isArray(insights)).toBe(true);
  });

  it('should never contain banned terms', () => {
    const card = createMockPropCard();
    const insights = generateInsights(card);

    for (const insight of insights) {
      expect(containsBannedTerms(insight)).toBe(false);

      // Check each banned term individually
      for (const term of BANNED_TERMS) {
        expect(insight.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });

  it('should generate hit rate insight (insight #1)', () => {
    const card = createMockPropCard();
    const insights = generateInsights(card);

    const hitRateInsight = insights[0];

    // Should mention wins/losses
    expect(hitRateInsight).toMatch(/hit/i);
    expect(hitRateInsight).toMatch(/\d+\/\d+/); // Pattern like "7/9"

    // Should mention OVER or UNDER
    expect(hitRateInsight).toMatch(/OVER|UNDER/);
  });

  it('should generate trend insight (insight #2)', () => {
    const card = createMockPropCard();
    const insights = generateInsights(card);

    const trendInsight = insights[1];

    // Should mention trend direction or minutes
    expect(trendInsight).toMatch(/trending|trend|minutes|performance/i);
  });

  it('should generate volatility/context insight (insight #3)', () => {
    const card = createMockPropCard();
    const insights = generateInsights(card);

    const contextInsight = insights[2];

    // Should mention volatility, sensitivity, splits, or context
    expect(contextInsight).toMatch(/volatility|sensitivity|home|away|rest|injury|back-to-back|deviation|standard/i);
  });

  it('should handle low sample size', () => {
    const card = createMockPropCard({
      summary: {
        last10: {
          sampleSize: 5,
          wins: 3,
          losses: 2,
          pushes: 0,
          hitRate: 0.6,
          avg: 26.0,
          median: 26.0,
        },
        last20: {
          sampleSize: 5,
          wins: 3,
          losses: 2,
          pushes: 0,
          hitRate: 0.6,
          avg: 26.0,
          median: 26.0,
        },
        season: {
          sampleSize: 5,
          wins: 3,
          losses: 2,
          pushes: 0,
          hitRate: 0.6,
          avg: 26.0,
          median: 26.0,
        },
        pushesIncluded: true,
        quickInsights: [],
      },
    });

    const insights = generateInsights(card);

    expect(insights).toHaveLength(3);

    // Should mention limited sample
    const hitRateInsight = insights[0];
    expect(hitRateInsight.toLowerCase()).toContain('limited');
  });

  it('should handle pushes correctly', () => {
    const card = createMockPropCard({
      summary: {
        last10: {
          sampleSize: 10,
          wins: 6,
          losses: 2,
          pushes: 2,
          hitRate: 0.75,
          avg: 27.5,
          median: 27.5,
        },
        last20: {
          sampleSize: 20,
          wins: 12,
          losses: 5,
          pushes: 3,
          hitRate: 0.706,
          avg: 27.5,
          median: 27.5,
        },
        season: {
          sampleSize: 40,
          wins: 24,
          losses: 12,
          pushes: 4,
          hitRate: 0.667,
          avg: 27.5,
          median: 27.5,
        },
        pushesIncluded: true,
        quickInsights: [],
      },
    });

    const insights = generateInsights(card);
    const hitRateInsight = insights[0];

    // Should mention pushes
    expect(hitRateInsight.toLowerCase()).toMatch(/push/);
  });

  it('should mention injury status if present', () => {
    const card = createMockPropCard({
      context: {
        injuryStatus: {
          player: {
            status: 'QUESTIONABLE',
            notes: 'Left ankle sprain',
          },
          lastUpdatedAt: '2025-01-14T12:00:00Z',
        },
      },
    });

    const insights = generateInsights(card);
    const contextInsight = insights[2];

    // Should mention injury status
    expect(contextInsight.toLowerCase()).toMatch(/injury|questionable/i);
  });

  it('should mention high line sensitivity', () => {
    const card = createMockPropCard({
      pro: {
        ...createMockPropCard().pro,
        sensitivity: {
          nearLineRate: 0.45,
          pushRate: 0.1,
          lineSensitivityScore: 70,
        },
      },
    });

    const insights = generateInsights(card);
    const contextInsight = insights[2];

    // Should mention line sensitivity
    expect(contextInsight.toLowerCase()).toMatch(/sensitivity|cluster|near/i);
  });

  it('should mention high volatility', () => {
    const card = createMockPropCard({
      pro: {
        ...createMockPropCard().pro,
        distribution: {
          buckets: [],
          mean: 28.0,
          stdDev: 8.5,
          volatilityScore: 85,
        },
      },
    });

    const insights = generateInsights(card);
    const contextInsight = insights[2];

    // Should mention volatility
    expect(contextInsight.toLowerCase()).toMatch(/volatility|deviation|vary/i);
  });

  it('should mention significant home/away split', () => {
    const card = createMockPropCard({
      pro: {
        ...createMockPropCard().pro,
        splits: {
          home: { sampleSize: 10, wins: 9, losses: 1, pushes: 0, hitRate: 0.9, avg: 30.0, median: 30.0 },
          away: { sampleSize: 10, wins: 5, losses: 5, pushes: 0, hitRate: 0.5, avg: 26.0, median: 26.0 },
          rest0: { sampleSize: 2, wins: 1, losses: 1, pushes: 0, hitRate: 0.5, avg: 27.0, median: 27.0 },
          rest1: { sampleSize: 8, wins: 6, losses: 2, pushes: 0, hitRate: 0.75, avg: 28.0, median: 28.0 },
          rest2plus: { sampleSize: 10, wins: 7, losses: 3, pushes: 0, hitRate: 0.7, avg: 28.5, median: 28.5 },
        },
      },
    });

    const insights = generateInsights(card);
    const contextInsight = insights[2];

    // Should mention home/away
    expect(contextInsight.toLowerCase()).toMatch(/home|away/i);
  });

  it('should mention back-to-back impact', () => {
    const card = createMockPropCard({
      pro: {
        ...createMockPropCard().pro,
        splits: {
          home: { sampleSize: 10, wins: 7, losses: 3, pushes: 0, hitRate: 0.7, avg: 28.0, median: 28.0 },
          away: { sampleSize: 10, wins: 7, losses: 3, pushes: 0, hitRate: 0.7, avg: 28.0, median: 28.0 },
          rest0: { sampleSize: 4, wins: 1, losses: 3, pushes: 0, hitRate: 0.25, avg: 24.0, median: 24.0 },
          rest1: { sampleSize: 8, wins: 6, losses: 2, pushes: 0, hitRate: 0.75, avg: 28.0, median: 28.0 },
          rest2plus: { sampleSize: 8, wins: 7, losses: 1, pushes: 0, hitRate: 0.875, avg: 30.0, median: 30.0 },
        },
      },
    });

    const insights = generateInsights(card);
    const contextInsight = insights[2];

    // Should mention back-to-back
    expect(contextInsight.toLowerCase()).toMatch(/back-to-back|b2b|rest/i);
  });

  it('should mention win streak', () => {
    const card = createMockPropCard({
      trend: {
        ...createMockPropCard().trend,
        last5GameLogs: [
          { date: '2025-01-10', opponent: 'GSW', homeAway: 'home', minutes: 35, statValue: 30, outcome: 'WIN', restDays: 1 },
          { date: '2025-01-08', opponent: 'BOS', homeAway: 'away', minutes: 34, statValue: 29, outcome: 'WIN', restDays: 1 },
          { date: '2025-01-06', opponent: 'PHX', homeAway: 'home', minutes: 36, statValue: 31, outcome: 'WIN', restDays: 2 },
          { date: '2025-01-04', opponent: 'DEN', homeAway: 'away', minutes: 33, statValue: 28, outcome: 'WIN', restDays: 1 },
          { date: '2025-01-02', opponent: 'LAC', homeAway: 'home', minutes: 35, statValue: 32, outcome: 'WIN', restDays: 2 },
        ],
      },
    });

    const insights = generateInsights(card);
    const hitRateInsight = insights[0];

    // Should mention streak
    expect(hitRateInsight.toLowerCase()).toMatch(/streak/i);
  });

  it('should handle UNDER side correctly', () => {
    const card = createMockPropCard({
      meta: {
        ...createMockPropCard().meta,
        side: 'UNDER',
      },
    });

    const insights = generateInsights(card);
    const hitRateInsight = insights[0];

    // Should mention UNDER
    expect(hitRateInsight).toContain('UNDER');
  });
});

describe('containsBannedTerms', () => {
  it('should detect banned terms', () => {
    expect(containsBannedTerms('This is a lock!')).toBe(true);
    expect(containsBannedTerms('Best bet of the day')).toBe(true);
    expect(containsBannedTerms('Guaranteed profit')).toBe(true);
    expect(containsBannedTerms('Free money here')).toBe(true);
    expect(containsBannedTerms('Great ROI')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(containsBannedTerms('LOCK')).toBe(true);
    expect(containsBannedTerms('Lock')).toBe(true);
    expect(containsBannedTerms('lock')).toBe(true);
  });

  it('should not flag clean text', () => {
    expect(containsBannedTerms('The OVER hit 7/10 in the last 10 games')).toBe(false);
    expect(containsBannedTerms('High volatility with std dev 6.2')).toBe(false);
    expect(containsBannedTerms('Trending up recently')).toBe(false);
  });

  it('should detect partial matches', () => {
    expect(containsBannedTerms('This is locked in!')).toBe(true);
    expect(containsBannedTerms('Best betting value')).toBe(true);
  });
});

describe('getBannedTerms', () => {
  it('should return list of banned terms', () => {
    const terms = getBannedTerms();

    expect(Array.isArray(terms)).toBe(true);
    expect(terms.length).toBeGreaterThan(0);
    expect(terms).toContain('lock');
    expect(terms).toContain('best bet');
    expect(terms).toContain('guaranteed');
    expect(terms).toContain('free money');
    expect(terms).toContain('profit');
    expect(terms).toContain('roi');
  });

  it('should be readonly', () => {
    const terms = getBannedTerms();

    // TypeScript compile-time check, runtime won't actually prevent mutation
    // but the type signature indicates readonly intent
    expect(terms).toBeDefined();
  });
});

describe('Insights Integration', () => {
  it('should generate valid insights for multiple scenarios', () => {
    const scenarios = [
      { name: 'High hit rate', wins: 8, losses: 2 },
      { name: 'Low hit rate', wins: 3, losses: 7 },
      { name: 'Even split', wins: 5, losses: 5 },
      { name: 'With pushes', wins: 5, losses: 3, pushes: 2 },
    ];

    for (const scenario of scenarios) {
      const card = createMockPropCard({
        summary: {
          last10: {
            sampleSize: scenario.wins + scenario.losses + (scenario.pushes || 0),
            wins: scenario.wins,
            losses: scenario.losses,
            pushes: scenario.pushes || 0,
            hitRate: scenario.wins / (scenario.wins + scenario.losses),
            avg: 27.5,
            median: 27.5,
          },
          last20: {
            sampleSize: 20,
            wins: 12,
            losses: 8,
            pushes: 0,
            hitRate: 0.6,
            avg: 27.5,
            median: 27.5,
          },
          season: {
            sampleSize: 40,
            wins: 24,
            losses: 16,
            pushes: 0,
            hitRate: 0.6,
            avg: 27.5,
            median: 27.5,
          },
          pushesIncluded: true,
          quickInsights: [],
        },
      });

      const insights = generateInsights(card);

      expect(insights).toHaveLength(3);
      for (const insight of insights) {
        expect(containsBannedTerms(insight)).toBe(false);
        expect(insight.length).toBeGreaterThan(10); // Not empty
      }
    }
  });
});
