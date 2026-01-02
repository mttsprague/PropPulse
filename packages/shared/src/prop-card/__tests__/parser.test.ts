/**
 * Parser Unit Tests
 * 
 * Tests for natural language prop query parsing:
 * - Text parsing from various formats
 * - Player name extraction
 * - Stat type detection
 * - Line extraction
 * - Side (OVER/UNDER) detection
 */

import { describe, it, expect } from 'vitest';
import {
  parsePropQueryFromText,
  validatePropQuery,
} from '../parser';

describe('parsePropQueryFromText', () => {
  it('should parse standard format: "Player over X.X stat"', () => {
    const result = parsePropQueryFromText('Anthony Edwards over 26.5 points');

    expect(result.playerName).toBe('Anthony Edwards');
    expect(result.statType).toBe('PTS');
    expect(result.line).toBe(26.5);
    expect(result.side).toBe('OVER');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should parse abbreviated format: "Player O X.X STAT"', () => {
    const result = parsePropQueryFromText('LeBron O27.5 PTS');

    expect(result.playerName).toContain('LeBron');
    expect(result.statType).toBe('PTS');
    expect(result.line).toBe(27.5);
    expect(result.side).toBe('OVER');
  });

  it('should parse UNDER format: "Player U X.X stat"', () => {
    const result = parsePropQueryFromText('Edwards U 5.5 assists');

    expect(result.playerName).toBe('Edwards');
    expect(result.statType).toBe('AST');
    expect(result.line).toBe(5.5);
    expect(result.side).toBe('UNDER');
  });

  it('should parse rebounds stat', () => {
    const result = parsePropQueryFromText('Anthony Davis over 12.5 rebounds');

    expect(result.playerName).toBe('Anthony Davis');
    expect(result.statType).toBe('REB');
    expect(result.line).toBe(12.5);
    expect(result.side).toBe('OVER');
  });

  it('should handle abbreviated stat types', () => {
    expect(parsePropQueryFromText('Curry over 25.5 pts').statType).toBe('PTS');
    expect(parsePropQueryFromText('Jokic over 10.5 reb').statType).toBe('REB');
    expect(parsePropQueryFromText('LeBron over 7.5 ast').statType).toBe('AST');
  });

  it('should handle whole number lines', () => {
    const result = parsePropQueryFromText('Giannis over 30 points');

    expect(result.line).toBe(30);
  });

  it('should handle "below" as UNDER synonym', () => {
    const result = parsePropQueryFromText('Tatum below 24.5 points');

    expect(result.side).toBe('UNDER');
  });

  it('should handle "above" as OVER synonym', () => {
    const result = parsePropQueryFromText('Durant above 28.5 points');

    expect(result.side).toBe('OVER');
  });

  it('should resolve player name aliases', () => {
    const aliases = [
      { input: 'lebron over 27.5 points', expected: 'LeBron James' },
      { input: 'curry over 25.5 points', expected: 'Stephen Curry' },
      { input: 'kd over 28.5 points', expected: 'Kevin Durant' },
      { input: 'giannis over 30.5 points', expected: 'Giannis Antetokounmpo' },
      { input: 'ad over 12.5 rebounds', expected: 'Anthony Davis' },
    ];

    for (const alias of aliases) {
      const result = parsePropQueryFromText(alias.input);
      expect(result.playerName).toBe(alias.expected);
    }
  });

  it('should capitalize player names', () => {
    const result = parsePropQueryFromText('anthony edwards over 26.5 points');

    expect(result.playerName).toBe('Anthony Edwards');
  });

  it('should handle slang stat names', () => {
    const result1 = parsePropQueryFromText('Curry over 5.5 dimes');
    expect(result1.statType).toBe('AST');

    const result2 = parsePropQueryFromText('Davis over 10.5 boards');
    expect(result2.statType).toBe('REB');
  });

  it('should default to PTS if stat type unclear', () => {
    const result = parsePropQueryFromText('LeBron over 27.5');

    expect(result.statType).toBe('PTS');
  });

  it('should default to OVER if side unclear', () => {
    const result = parsePropQueryFromText('LeBron 27.5 points');

    expect(result.side).toBe('OVER');
  });

  it('should handle compact format without spaces', () => {
    const result = parsePropQueryFromText('LeBronO27.5PTS');

    expect(result.playerName).toContain('LeBron');
    expect(result.statType).toBe('PTS');
    expect(result.line).toBe(27.5);
    expect(result.side).toBe('OVER');
  });

  it('should handle multiple spaces', () => {
    const result = parsePropQueryFromText('Anthony  Edwards   over  26.5   points');

    expect(result.playerName).toBe('Anthony Edwards');
    expect(result.statType).toBe('PTS');
    expect(result.line).toBe(26.5);
    expect(result.side).toBe('OVER');
  });

  it('should be case-insensitive', () => {
    const result = parsePropQueryFromText('ANTHONY EDWARDS OVER 26.5 POINTS');

    expect(result.playerName).toBe('Anthony Edwards');
    expect(result.statType).toBe('PTS');
    expect(result.line).toBe(26.5);
    expect(result.side).toBe('OVER');
  });

  it('should handle "greater than" symbol', () => {
    const result = parsePropQueryFromText('LeBron > 27.5 points');

    expect(result.side).toBe('OVER');
  });

  it('should handle "less than" symbol', () => {
    const result = parsePropQueryFromText('LeBron < 27.5 points');

    expect(result.side).toBe('UNDER');
  });

  it('should calculate confidence based on extracted components', () => {
    const fullQuery = parsePropQueryFromText('Anthony Edwards over 26.5 points');
    const partialQuery = parsePropQueryFromText('Edwards 26.5');

    expect(fullQuery.confidence).toBeGreaterThan(partialQuery.confidence);
    expect(fullQuery.confidence).toBeGreaterThan(0.9);
  });

  it('should handle edge case: single name player', () => {
    const result = parsePropQueryFromText('Jokic over 25.5 points');

    expect(result.playerName).toBe('Jokic');
  });

  it('should handle edge case: no player name', () => {
    const result = parsePropQueryFromText('over 27.5 points');

    expect(result.playerName).toBe('');
    expect(result.confidence).toBeLessThan(0.8);
  });

  it('should handle edge case: no line', () => {
    const result = parsePropQueryFromText('LeBron over points');

    expect(result.line).toBe(0);
    expect(result.confidence).toBeLessThan(0.8);
  });
});

describe('validatePropQuery', () => {
  it('should validate correct query', () => {
    const query = {
      playerName: 'LeBron James',
      statType: 'PTS' as const,
      line: 27.5,
      side: 'OVER' as const,
      confidence: 0.95,
    };

    const validation = validatePropQuery(query);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should reject missing player name', () => {
    const query = {
      playerName: '',
      statType: 'PTS' as const,
      line: 27.5,
      side: 'OVER' as const,
      confidence: 0.95,
    };

    const validation = validatePropQuery(query);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Player name'))).toBe(true);
  });

  it('should reject short player name', () => {
    const query = {
      playerName: 'L',
      statType: 'PTS' as const,
      line: 27.5,
      side: 'OVER' as const,
      confidence: 0.95,
    };

    const validation = validatePropQuery(query);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Player name'))).toBe(true);
  });

  it('should reject invalid stat type', () => {
    const query = {
      playerName: 'LeBron James',
      statType: 'INVALID' as any,
      line: 27.5,
      side: 'OVER' as const,
      confidence: 0.95,
    };

    const validation = validatePropQuery(query);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Stat type'))).toBe(true);
  });

  it('should reject zero line', () => {
    const query = {
      playerName: 'LeBron James',
      statType: 'PTS' as const,
      line: 0,
      side: 'OVER' as const,
      confidence: 0.95,
    };

    const validation = validatePropQuery(query);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Line'))).toBe(true);
  });

  it('should reject negative line', () => {
    const query = {
      playerName: 'LeBron James',
      statType: 'PTS' as const,
      line: -5,
      side: 'OVER' as const,
      confidence: 0.95,
    };

    const validation = validatePropQuery(query);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Line'))).toBe(true);
  });

  it('should reject invalid side', () => {
    const query = {
      playerName: 'LeBron James',
      statType: 'PTS' as const,
      line: 27.5,
      side: 'INVALID' as any,
      confidence: 0.95,
    };

    const validation = validatePropQuery(query);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Side'))).toBe(true);
  });

  it('should reject low confidence', () => {
    const query = {
      playerName: 'LeBron James',
      statType: 'PTS' as const,
      line: 27.5,
      side: 'OVER' as const,
      confidence: 0.5,
    };

    const validation = validatePropQuery(query);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('confidence'))).toBe(true);
  });

  it('should return multiple errors for invalid query', () => {
    const query = {
      playerName: '',
      statType: 'INVALID' as any,
      line: 0,
      side: 'INVALID' as any,
      confidence: 0.3,
    };

    const validation = validatePropQuery(query);

    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(3);
  });
});

describe('Parser Integration', () => {
  it('should handle real-world query examples', () => {
    const realWorldQueries = [
      'Anthony Edwards over 26.5 points',
      'LeBron James under 8.5 assists',
      'Stephen Curry O 4.5 rebounds',
      'Kevin Durant U 27.5 PTS',
      'Giannis over 30 points',
      'Jokic above 10.5 assists',
      'Embiid below 11.5 rebounds',
      'Tatum > 25.5 points',
      'Luka < 9.5 assists',
    ];

    for (const query of realWorldQueries) {
      const parsed = parsePropQueryFromText(query);

      expect(parsed.playerName.length).toBeGreaterThan(0);
      expect(['PTS', 'REB', 'AST']).toContain(parsed.statType);
      expect(parsed.line).toBeGreaterThan(0);
      expect(['OVER', 'UNDER']).toContain(parsed.side);
      expect(parsed.confidence).toBeGreaterThan(0.5);

      // Validate parsed query
      const validation = validatePropQuery(parsed);
      expect(validation.valid).toBe(true);
    }
  });
});
