# Prop Card Engine - Quick Reference

## Installation

```bash
pnpm install
pnpm test
pnpm build
```

## Import

```typescript
import {
  generatePropCardFromQuery,
  generatePropCardFromText,
  PropQuery,
  PropCard,
  FirestoreCollections,
} from '@proppulse/shared/prop-card';
```

## Generate Card

```typescript
// From structured query
const card = await generatePropCardFromQuery(
  {
    playerId: 'anthony-edwards',
    statType: 'PTS',
    line: 26.5,
    side: 'OVER',
  },
  collections
);

// From natural language
const card = await generatePropCardFromText(
  'Anthony Edwards over 26.5 points',
  collections
);
```

## Access Data

```typescript
// Hit rates
card.summary.last10.hitRate; // 0.778
card.summary.last10.wins; // 7
card.summary.last10.losses; // 2
card.summary.last10.pushes; // 1

// Insights (always 3)
card.summary.quickInsights[0]; // "The OVER hit 7/9..."
card.summary.quickInsights[1]; // "Trending up recently..."
card.summary.quickInsights[2]; // "Results show moderate volatility..."

// Trend
card.trend.trendDirection; // "UP" | "DOWN" | "FLAT"
card.trend.trendSlopeLast10; // 0.5

// Pro analytics
card.pro.distribution.volatilityScore; // 45 (0-100)
card.pro.sensitivity.lineSensitivityScore; // 20 (0-100)
card.pro.stability.minutesStabilityScore; // 75 (0-100)

// Splits
card.pro.splits.home.hitRate; // 0.8
card.pro.splits.away.hitRate; // 0.667
card.pro.splits.rest0.hitRate; // 0.333 (back-to-back)

// Context
card.context.injuryStatus?.player.status; // "QUESTIONABLE"
card.context.scheduleContext?.backToBack; // true
```

## Formulas

### Hit Rate
```
hitRate = wins / (wins + losses)  // Excludes pushes
```

### Trend Slope
```
slope = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)
UP: slope > 0.3
DOWN: slope < -0.3
FLAT: -0.3 ≤ slope ≤ 0.3
```

### Volatility Score (0-100)
```
score = min(100, (stdDev / mean) * 300)
Low: 0-60
Medium: 60-90
High: 90-100
```

### Line Sensitivity (0-100)
```
score = (nearLineRate * 0.7 + pushRate * 0.3) * 100
Low: 0-30
Medium: 30-60
High: 60-100
```

### Minutes Stability (0-100)
```
score = max(0, 100 - (stdDev * 10))
High: 80-100 (±2 min or less)
Medium: 50-80 (±3-5 min)
Low: 0-50 (±6+ min)
```

## Supported Formats

```
"Player over X.X stat"    → Anthony Edwards over 26.5 points
"Player O X.X STAT"       → LeBron O27.5 PTS
"Player U X.X stat"       → Edwards U 5.5 assists
"Player above/below X.X"  → Curry above 25.5 points
"Player > X.X"            → KD > 28.5 PTS
"Player < X.X"            → Giannis < 11.5 rebounds
```

## Stat Types

- **PTS**: points, pts, pt, point
- **REB**: rebounds, rebound, reb, boards, board
- **AST**: assists, assist, ast, dimes, dime

## Player Aliases

```
lebron → LeBron James
curry → Stephen Curry
kd → Kevin Durant
giannis → Giannis Antetokounmpo
ad → Anthony Davis
dame → Damian Lillard
...
```

## Banned Terms

Never appear in insights:
```
lock, best bet, guaranteed, free money, profit, roi,
cash, bankroll, max bet, smash, hammer, play, fade, tail
```

## Caching

```typescript
// Check cache
const cached = await getCachedPropCard(query, collections.computedPropCards);

// Set cache
await setCachedPropCard(query, card, collections.computedPropCards);

// Clean expired
const deleted = await cleanExpiredCache(collections.computedPropCards);

// Cache stats
const stats = await getCacheStats(collections.computedPropCards);
```

**TTL**: 6 hours  
**Key**: SHA-256 hash of `playerId|statType|line|side|gameDate`

## Batch Generation

```typescript
const cards = await batchGeneratePropCards(
  [
    { playerId: 'lebron', statType: 'PTS', line: 27.5, side: 'OVER' },
    { playerId: 'curry', statType: 'PTS', line: 25.5, side: 'OVER' },
    { playerId: 'jokic', statType: 'AST', line: 9.5, side: 'OVER' },
  ],
  collections
);
```

## Firestore Collections

```typescript
const collections: FirestoreCollections = {
  players: db.collection('players'),
  teams: db.collection('teams'),
  games: db.collection('games'),
  playerGameStats: db.collection('playerGameStats'),
  injurySnapshots: db.collection('injurySnapshots'),
  computedPropCards: db.collection('computedPropCards'), // Cache
};
```

## Error Handling

```typescript
try {
  const card = await generatePropCardFromText(query, collections);
} catch (error) {
  if (error.message.includes('Player not found')) {
    // Handle player not found
  } else if (error.message.includes('Could not resolve player')) {
    // Handle name resolution failure
  }
}
```

## Testing

```bash
# Run all tests
pnpm test

# Coverage
pnpm test:coverage

# UI mode
pnpm test:ui

# Specific file
pnpm test computations
```

## Type Reference

```typescript
interface PropQuery {
  playerId: string;
  statType: 'PTS' | 'REB' | 'AST';
  line: number;
  side: 'OVER' | 'UNDER';
  gameDate?: string;
}

interface HitRateSummary {
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number;
  avg: number;
  median: number;
}

interface PropCard {
  meta: { ... };
  summary: {
    last10: HitRateSummary;
    last20: HitRateSummary;
    season: HitRateSummary;
    pushesIncluded: boolean;
    quickInsights: string[]; // Always 3
  };
  trend: { ... };
  pro: {
    splits: { home, away, rest0, rest1, rest2plus };
    distribution: { buckets, mean, stdDev, volatilityScore };
    sensitivity: { nearLineRate, pushRate, lineSensitivityScore };
    stability: { minutesStdDevLast10, minutesStabilityScore, reliabilityNotes };
  };
  context: {
    injuryStatus?: { ... };
    scheduleContext?: { ... };
  };
  debug?: { ... };
}
```

## Performance

- Uncached: 500-1000ms
- Cached: <50ms
- Batch (10): ~3-5s

## Files

```
/packages/shared/src/prop-card/
├── types.ts              # Types (337 lines)
├── parser.ts             # Parser (220 lines)
├── computations.ts       # Engine (554 lines)
├── insights.ts           # Insights (265 lines)
├── cache.ts              # Cache (174 lines)
├── index.ts              # Entry (168 lines)
├── examples.ts           # Examples (396 lines)
├── README.md             # Docs (631 lines)
├── rendering-schema.md   # UI guide (530 lines)
├── BUILD_SUMMARY.md      # Summary (400+ lines)
└── __tests__/
    ├── computations.test.ts (267 lines)
    ├── insights.test.ts (346 lines)
    └── parser.test.ts (259 lines)
```

**Total**: 4,147 lines

## Documentation

- **README.md**: Complete API reference
- **rendering-schema.md**: Frontend implementation guide
- **BUILD_SUMMARY.md**: Full build summary
- **examples.ts**: 8 usage examples

## Support

PropPulse Development Team
