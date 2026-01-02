# Prop Research Card Engine

Complete, production-ready computation engine for generating NBA player prop research cards. This is a **workflow saver and analytics tool** — not a betting picks engine.

## Overview

The Prop Card Engine analyzes historical NBA player performance data and generates structured research insights. Given a player, stat type (PTS/REB/AST), line value, and Over/Under side, it computes:

- **Hit rates** across multiple windows (last 10, last 20, season)
- **Trend analysis** with linear regression slope and direction
- **Pro analytics** including splits, volatility, line sensitivity, and stability
- **3 deterministic insight bullets** that explain findings without betting recommendations
- **Context** including injury status and schedule factors

## Features

✅ **NBA only** (PTS, REB, AST stat types)  
✅ **Both Over and Under** support  
✅ **Casual + Pro analytics** modes  
✅ **Deterministic insights** (rule-based, no LLM required)  
✅ **Strong TypeScript types** throughout  
✅ **Full unit test coverage** with Vitest  
✅ **6-hour caching** for performance  
✅ **Natural language parsing** ("LeBron over 27.5 points")  
✅ **Multi-platform ready** (Web, Mobile, Discord bot)

## Installation

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build
```

## Quick Start

### 1. Generate Card from Structured Query

```typescript
import {
  generatePropCardFromQuery,
  PropQuery,
  FirestoreCollections,
} from '@proppulse/shared/prop-card';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

const collections: FirestoreCollections = {
  players: db.collection('players'),
  teams: db.collection('teams'),
  games: db.collection('games'),
  playerGameStats: db.collection('playerGameStats'),
  injurySnapshots: db.collection('injurySnapshots'),
  computedPropCards: db.collection('computedPropCards'),
};

const query: PropQuery = {
  playerId: 'anthony-edwards',
  statType: 'PTS',
  line: 26.5,
  side: 'OVER',
  gameDate: '2025-01-15', // Optional, defaults to today
};

const card = await generatePropCardFromQuery(query, collections);

console.log('Hit rate last 10:', card.summary.last10.hitRate);
console.log('Insights:', card.summary.quickInsights);
```

### 2. Generate Card from Natural Language

```typescript
import { generatePropCardFromText } from '@proppulse/shared/prop-card';

// Supports various formats:
// - "Anthony Edwards over 26.5 points"
// - "Edwards U 5.5 assists"
// - "LeBron O27.5 PTS"

const card = await generatePropCardFromText(
  'Anthony Edwards over 26.5 points',
  collections
);

console.log('Player:', card.meta.playerName);
console.log('Line:', card.meta.line);
console.log('Side:', card.meta.side);
```

### 3. Parse Query Only

```typescript
import { parsePropQueryFromText, resolvePlayerId } from '@proppulse/shared/prop-card';

const parsed = parsePropQueryFromText('LeBron over 27.5 points');

console.log(parsed);
// {
//   playerName: 'LeBron James',
//   statType: 'PTS',
//   line: 27.5,
//   side: 'OVER',
//   confidence: 0.95
// }

// Resolve player name to Firestore ID
const playerId = await resolvePlayerId(parsed.playerName, collections.players);
```

## Output Structure

### PropCard Interface

```typescript
interface PropCard {
  meta: {
    playerId: string;
    playerName: string;
    teamAbbr: string;
    opponentAbbr?: string;
    statType: 'PTS' | 'REB' | 'AST';
    line: number;
    side: 'OVER' | 'UNDER';
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
    trendSlopeLast10: number;
    trendDirection: 'UP' | 'DOWN' | 'FLAT';
  };

  pro: {
    splits: {
      home: HitRateSummary;
      away: HitRateSummary;
      rest0: HitRateSummary; // back-to-back
      rest1: HitRateSummary;
      rest2plus: HitRateSummary;
    };
    distribution: {
      buckets: { label: string; count: number }[];
      mean: number;
      stdDev: number;
      volatilityScore: number; // 0-100
    };
    sensitivity: {
      nearLineRate: number;
      pushRate: number;
      lineSensitivityScore: number; // 0-100
    };
    stability: {
      minutesStdDevLast10: number;
      minutesStabilityScore: number; // 0-100
      reliabilityNotes: string[];
    };
  };

  context: {
    injuryStatus?: { ... };
    scheduleContext?: { ... };
  };

  debug?: {
    sampleSizeNotes: string[];
    dataQualityWarnings: string[];
  };
}
```

### HitRateSummary

```typescript
interface HitRateSummary {
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number; // wins/(wins+losses), excluding pushes
  avg: number;
  median: number;
}
```

## Computations Explained

### Hit Rate Calculation

For **OVER**:
- `WIN`: stat > line
- `LOSS`: stat < line
- `PUSH`: stat == line

For **UNDER**:
- `WIN`: stat < line
- `LOSS`: stat > line
- `PUSH`: stat == line

**Hit rate** = `wins / (wins + losses)` — pushes are excluded from the calculation.

### Trend Slope (Linear Regression)

Formula: `slope = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)`

Where:
- `x` = game index (0, 1, 2, ...)
- `y` = stat value
- `x̄` = mean of x values
- `ȳ` = mean of y values

**Trend direction**:
- `UP`: slope > 0.3 (gaining ~0.3 stat per game)
- `DOWN`: slope < -0.3 (losing ~0.3 stat per game)
- `FLAT`: -0.3 ≤ slope ≤ 0.3

### Volatility Score (0-100)

Formula: `min(100, (stdDev / mean) * 300)`

Interpretation:
- **0-60**: Low volatility (consistent performance)
- **60-90**: Medium volatility (some variation)
- **90-100**: High volatility (wildly inconsistent)

### Line Sensitivity Score (0-100)

Formula: `(nearLineRate * 0.7 + pushRate * 0.3) * 100`

Where:
- `nearLineRate` = % of games within ±1.0 of line
- `pushRate` = % of games that exactly hit the line

Interpretation:
- **0-30**: Low sensitivity (outcomes far from line)
- **30-60**: Medium sensitivity
- **60-100**: High sensitivity (many outcomes cluster near line)

### Minutes Stability Score (0-100)

Formula: `max(0, 100 - (stdDev * 10))`

Where `stdDev` is the standard deviation of minutes played over last 10 games.

Interpretation:
- **80-100**: Highly stable (±2 min or less)
- **50-80**: Moderately stable (±3-5 min)
- **0-50**: Unstable (±6+ min)

### Rest Day Categories

- `rest0`: Back-to-back (0 days rest)
- `rest1`: 1 day rest
- `rest2plus`: 2+ days rest

Rest days calculated as: days between games - 1

## Insights Generation

The engine generates **exactly 3 insight bullets** using deterministic rules:

### Insight #1: Hit Rate & Sample

Templates:
- "The {OVER/UNDER} hit X/Y in the last Z games (N pushes)."
- Includes sample size warnings if < 10 games
- Mentions win/loss streaks if 3+ in a row

### Insight #2: Trend & Minutes

Templates:
- "Trending {up/down/flat} recently with average {gain/decline} of X per game."
- "Results correlate {strongly/do not correlate} with playing time."
- "Minutes have been {volatile/stable} (±X min)."

### Insight #3: Volatility, Sensitivity, or Context

Priority order:
1. Injury status (if player or teammates out)
2. High line sensitivity (>60% near line)
3. High volatility (score > 70)
4. Significant home/away split (>25% difference)
5. Back-to-back impact
6. Schedule context (upcoming B2B)
7. Default: general volatility insight

### Banned Terms

The insights generator **never** uses betting advice terms:

❌ lock, best bet, guaranteed, free money, profit, roi, cash, bankroll, max bet, smash, hammer, play, fade, tail

All insights are **neutral research observations** only.

## Caching

Cards are cached for **6 hours** in Firestore (`computedPropCards` collection).

Cache key is a deterministic SHA-256 hash of:
- `playerId`
- `statType`
- `line` (fixed to 1 decimal)
- `side`
- `gameDate`

```typescript
import { getCachedPropCard, setCachedPropCard } from '@proppulse/shared/prop-card';

// Check cache first
const cached = await getCachedPropCard(query, collections.computedPropCards);
if (cached) {
  return cached; // Return immediately
}

// Otherwise generate and cache
const card = await generatePropCard(/* ... */);
await setCachedPropCard(query, card, collections.computedPropCards);
```

## Extending to Additional Stat Types

To add new stat types (e.g., STL, BLK, TOV):

### 1. Update Types

```typescript
// types.ts
export type StatType = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK';
```

### 2. Update Parser

```typescript
// parser.ts
const STAT_PATTERNS: Record<string, StatType> = {
  // ... existing patterns
  'stl': 'STL',
  'steal': 'STL',
  'steals': 'STL',
  'blk': 'BLK',
  'block': 'BLK',
  'blocks': 'BLK',
};
```

### 3. Update Computations

```typescript
// computations.ts
function enrichGameLogs(/* ... */) {
  const statValue = log[query.statType.toLowerCase() as 'pts' | 'reb' | 'ast' | 'stl' | 'blk'];
  // ... rest of logic
}
```

### 4. Update Tests

Add test cases for new stat types in all test files.

## Testing

### Run All Tests

```bash
pnpm test
```

### Run Specific Test Suite

```bash
pnpm test computations
pnpm test insights
pnpm test parser
```

### Test Coverage

```bash
pnpm test --coverage
```

### Test Files

- `__tests__/computations.test.ts` - Core computation logic
- `__tests__/insights.test.ts` - Insights generation and banned terms
- `__tests__/parser.test.ts` - Natural language parsing

## API Usage Examples

### Batch Generate Cards

```typescript
import { batchGeneratePropCards } from '@proppulse/shared/prop-card';

const queries: PropQuery[] = [
  { playerId: 'lebron', statType: 'PTS', line: 27.5, side: 'OVER' },
  { playerId: 'curry', statType: 'PTS', line: 25.5, side: 'OVER' },
  { playerId: 'jokic', statType: 'AST', line: 9.5, side: 'OVER' },
];

const cards = await batchGeneratePropCards(queries, collections);
```

### Skip Cache

```typescript
// Force recomputation (bypass cache)
const card = await generatePropCardFromQuery(query, collections, true);
```

### Cache Management

```typescript
import {
  invalidateCachedPropCard,
  cleanExpiredCache,
  getCacheStats,
} from '@proppulse/shared/prop-card';

// Invalidate specific card
await invalidateCachedPropCard(query, collections.computedPropCards);

// Clean expired entries (run daily)
const deletedCount = await cleanExpiredCache(collections.computedPropCards);

// Get cache statistics
const stats = await getCacheStats(collections.computedPropCards);
console.log('Valid entries:', stats.validEntries);
console.log('Expired entries:', stats.expiredEntries);
```

## Firestore Data Requirements

The engine expects these Firestore collections:

### `/players/{playerId}`

```typescript
{
  id: string;
  name: string;
  teamId: string;
  position: string;
  updatedAt: number;
}
```

### `/teams/{teamId}`

```typescript
{
  id: string;
  name: string;
  abbreviation: string;
  updatedAt: number;
}
```

### `/games/{gameId}`

```typescript
{
  id: string;
  date: string; // ISO date
  homeTeamId: string;
  awayTeamId: string;
  status: 'scheduled' | 'in_progress' | 'final';
  updatedAt: number;
}
```

### `/playerGameStats/{playerId}_{gameId}`

```typescript
{
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
  // ... other stats
  updatedAt: number;
}
```

### `/injurySnapshots/{snapshotId}`

```typescript
{
  id: string;
  snapshotDateTime: number;
  players: Array<{
    playerId?: string;
    playerName: string;
    teamId?: string;
    status: string;
    injuryType: string;
    notes?: string;
  }>;
  updatedAt: number;
}
```

## Error Handling

```typescript
try {
  const card = await generatePropCardFromText(
    'Anthony Edwards over 26.5 points',
    collections
  );
} catch (error) {
  if (error.message.includes('Player not found')) {
    // Handle player not found
  } else if (error.message.includes('Could not resolve player')) {
    // Handle player name resolution failure
  } else {
    // Handle other errors
  }
}
```

## Performance Considerations

- **Caching**: 6-hour TTL reduces recomputation by ~90%
- **Batch queries**: Use `batchGeneratePropCards()` for multiple cards
- **Firestore limits**: Engine respects 500-doc batch write limits
- **Average generation time**: 500-1000ms uncached, <50ms cached

## License

Proprietary - PropPulse Micro-SaaS

## Support

For questions or issues, contact the PropPulse development team.
