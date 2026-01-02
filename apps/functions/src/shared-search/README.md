# Player Search & Player Pages System

Complete documentation for PropPulse's player search and player profile pages.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT (Web/Mobile)                         │
│  - Fuse.js Search Index (instant client-side fuzzy search)     │
│  - Firestore Fallback (prefix/token matching)                  │
│  - Debounced Queries + 5min Cache                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
           ┌────────────────┴────────────────┐
           │                                 │
    ┌──────▼────────┐              ┌────────▼────────┐
    │ Cloud Storage │              │  Cloud Functions│
    │ search/       │              │  /searchPlayers │
    │ player-index  │              │  /topPlayers    │
    │ .json         │              └────────┬────────┘
    └───────────────┘                       │
                                   ┌────────▼────────┐
                                   │   Firestore     │
                                   │  - players      │
                                   │  - aggregates   │
                                   │  - propTables   │
                                   └─────────────────┘
```

## System Components

### 1. Search Normalization & Tokenization

**File**: `/packages/shared/src/search/normalization.ts`

**Key Functions**:
- `normalizeName(name)` - Converts to lowercase, removes special chars
- `generateSearchTokens(fullName, nicknames[])` - Creates searchable tokens:
  - Full name normalized: "lebron james"
  - No spaces: "lebronjames"
  - First name: "lebron"
  - Last name: "james"
  - Initials: "lbj"
  - First initial + last: "ljames"
  - Prefixes: "le", "leb", "lebr", "lebro", "lebron", etc.
  - Nicknames: "bron", "king"
- `computeSimilarityScore()` - Ranks results for Firestore fallback

**Example**:
```typescript
const tokens = generateSearchTokensWithNicknames("LeBron James");
// Returns: ['lebron james', 'lebronjames', 'lebron', 'james', 'lbj', 
//           'ljames', 'jamesl', 'bron', 'king', 'le', 'leb', ...]
```

### 2. Search Index Builder

**File**: `/packages/shared/src/search/index-builder.ts`

Builds a precomputed JSON index with all players and their search tokens, stores in Cloud Storage for instant client-side loading.

**Functions**:
- `buildPlayerSearchIndex(db)` - Fetches all players, generates tokens
- `storeSearchIndex(indexFile, storage)` - Uploads to Cloud Storage with compression
- `updatePlayerSearchFields(db)` - Adds searchTokens to player documents
- `buildAndStoreSearchIndex(db, storage)` - Full workflow

**Output**: `gs://PROJECT.appspot.com/search/player-index.json`

```json
{
  "metadata": {
    "version": "1.0",
    "generatedAt": 1704153600000,
    "playerCount": 530,
    "checksum": "a1b2c3d4"
  },
  "players": [
    {
      "playerId": "player_123",
      "name": "Anthony Edwards",
      "teamAbbr": "MIN",
      "position": "SG",
      "teamId": "team_min",
      "tokens": ["anthony edwards", "ant", "antman", ...],
      "isActive": true
    }
  ]
}
```

**Scheduled Job**: Runs every Sunday at 5 AM CT
**Manual Trigger**: `POST /rebuildSearchIndex`

### 3. Player Aggregates Computation

**File**: `/packages/shared/src/search/aggregates.ts`

Computes season/last5/last10/last20 averages for all active players daily.

**Functions**:
- `computePlayerAggregates(playerId, db)` - Single player
- `computePlayerAggregatesForAll(db)` - All active players
- `getPlayerAggregates(playerId, db)` - Retrieve from Firestore

**Output Collection**: `playerAggregates/{playerId}`

```typescript
{
  playerId: "player_123",
  playerName: "Anthony Edwards",
  teamId: "team_min",
  seasonAvg: { pts: 25.3, reb: 5.4, ast: 5.1, min: 35.2, gamesPlayed: 50 },
  last5Avg: { pts: 27.8, reb: 5.8, ast: 5.5, min: 36.1 },
  last10Avg: { pts: 26.5, reb: 5.6, ast: 5.3, min: 35.7 },
  last20Avg: { pts: 25.9, reb: 5.5, ast: 5.2, min: 35.4 },
  updatedAt: 1704153600000
}
```

**Scheduled Job**: Runs daily at 3 AM CT
**Manual Trigger**: `POST /computeAggregatesManual`

### 4. Common Prop Lines Hit Rate Tables (KEY FEATURE!)

**File**: `/packages/shared/src/search/prop-tables.ts`

Generates hit rate tables for common prop lines (18.5, 20.5, 22.5, etc.) based on historical game logs. **This is what bettors love** - instant visibility into how often a player hits specific lines.

**Functions**:
- `generateCommonLines(seasonAvg, last10Avg, last20Avg)` - Auto-generates relevant lines
- `computePlayerPropTable(playerId, statType, db)` - Single player/stat
- `computePropTablesForAll(db)` - All players, all stats (PTS/REB/AST)
- `getPlayerPropTable(playerId, statType, db)` - Retrieve from Firestore

**Output Collection**: `playerPropTables/{playerId}_{statType}`

```typescript
{
  playerId: "player_123",
  playerName: "Anthony Edwards",
  statType: "PTS",
  seasonAvg: 25.3,
  last10Avg: 26.5,
  last20Avg: 25.9,
  lineRows: [
    {
      line: 22.5,
      last10Over: 0.900,  // 90% hit rate
      last10Under: 0.100,
      last10Push: 0.000,
      last20Over: 0.850,
      last20Under: 0.150,
      last20Push: 0.000,
      seasonOver: 0.820,
      seasonUnder: 0.180,
      seasonPush: 0.000
    },
    { line: 24.5, ... },
    { line: 26.5, ... },
    // ... more lines
  ],
  generatedAt: 1704153600000
}
```

**Scheduled Job**: Runs daily at 4 AM CT (after aggregates)
**Manual Trigger**: `POST /computePropTablesManual`

### 5. Search API Endpoints

**File**: `/functions/src/api/search.ts`

#### GET /searchPlayers?q={query}&limit={limit}&includeInactive={bool}

Search for players by name with intelligent fallback.

**Logic**:
1. If query < 2 chars → return trending players (by last10 minutes)
2. If query >= 2 chars → check Firestore using prefix match on `searchNameNormalized`
3. Fallback → search `searchTokens` array
4. Results cached for 5 minutes

**Response**:
```json
{
  "results": [
    {
      "playerId": "player_123",
      "name": "Anthony Edwards",
      "teamAbbr": "MIN",
      "position": "SG",
      "teamId": "team_min",
      "isActive": true
    }
  ],
  "cached": false,
  "source": "firestore",
  "queryTime": 145
}
```

#### GET /topPlayers?stat={pts|reb|ast|min}&period={season|last10|last20}&limit={limit}

Get top players by stat.

**Response**:
```json
{
  "players": [ /* same structure as search */ ],
  "stat": "pts",
  "period": "last10",
  "cached": true
}
```

### 6. Web Search Hook with Fuse.js

**File**: `/packages/web/hooks/usePlayerSearch.ts`

React hook that loads search index from Cloud Storage and uses Fuse.js for instant client-side fuzzy matching.

**Usage**:
```tsx
import { usePlayerSearch } from '@/hooks/usePlayerSearch';

function SearchBar() {
  const { query, setQuery, results, isLoading, indexLoaded } = usePlayerSearch({
    debounceMs: 300,
    limit: 15,
    includeInactive: false,
  });

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search players..."
      />
      {isLoading && <div>Loading...</div>}
      {results.map((player) => (
        <div key={player.playerId}>
          {player.name} - {player.teamAbbr} - {player.position}
        </div>
      ))}
    </div>
  );
}
```

**Features**:
- Loads search index on mount (cached globally)
- Uses Fuse.js for fuzzy matching (threshold 0.3)
- Falls back to Firestore API if no results
- Debounces queries (default 300ms)
- Caches identical queries

### 7. Web SearchInput Component (Implement This)

**File**: `/apps/web/components/SearchInput.tsx`

Full autocomplete component with keyboard navigation.

**Features**:
- Dropdown with results
- Arrow keys + Enter to select
- Esc to close
- Click outside to close
- Loading spinner
- Empty state
- Error state

**Example Implementation**:
```tsx
import { useState, useRef, useEffect } from 'react';
import { usePlayerSearch } from '@/hooks/usePlayerSearch';
import { useRouter } from 'next/navigation';

export function SearchInput() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { query, setQuery, results, isLoading } = usePlayerSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (playerId: string) => {
    router.push(`/player/${playerId}`);
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex].playerId);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    setIsOpen(results.length > 0);
  }, [results]);

  return (
    <div className="relative w-full max-w-md">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search players..."
        className="w-full px-4 py-2 border rounded-lg"
      />
      {isLoading && <div className="absolute right-3 top-3">⏳</div>}
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {results.map((player, index) => (
            <button
              key={player.playerId}
              onClick={() => handleSelect(player.playerId)}
              className={`w-full px-4 py-2 text-left hover:bg-gray-100 ${
                index === selectedIndex ? 'bg-blue-50' : ''
              }`}
            >
              <div className="font-semibold">{player.name}</div>
              <div className="text-sm text-gray-600">
                {player.teamAbbr} • {player.position}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 8. Mobile Search Hook & Component (Implement This)

**File**: `/apps/mobile/hooks/usePlayerSearch.ts` (same logic as web)
**File**: `/apps/mobile/components/SearchInput.tsx`

```tsx
import { useState } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Text } from 'react-native';
import { usePlayerSearch } from '@/hooks/usePlayerSearch';
import { useRouter } from 'expo-router';

export function SearchInput() {
  const router = useRouter();
  const { query, setQuery, results, isLoading } = usePlayerSearch();

  const handleSelect = (playerId: string) => {
    router.push(`/player/${playerId}`);
    setQuery('');
  };

  return (
    <View style={{ padding: 16 }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search players..."
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }}
      />
      {isLoading && <Text>Loading...</Text>}
      
      <FlatList
        data={results}
        keyExtractor={(item) => item.playerId}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleSelect(item.playerId)}
            style={{ padding: 12, borderBottomWidth: 1 }}
          >
            <Text style={{ fontWeight: 'bold' }}>{item.name}</Text>
            <Text>{item.teamAbbr} • {item.position}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
```

### 9. Web Player Page

**File**: `/apps/web/app/player/[id]/page.tsx`

Full player profile with stats, charts, game logs, and common lines table.

**Data Sources**:
- Player info: `players/{id}`
- Aggregates: `playerAggregates/{id}`
- Prop tables: `playerPropTables/{id}_{PTS|REB|AST}`
- Game logs: `playerGameStats` where `playerId == {id}`
- Injury: Latest `injurySnapshots`

**Sections**:
1. **Header**: Name, team, position, "Create Prop Card" button
2. **Stats Summary**: 4 tiles (season/last5/last10/last20 averages)
3. **Charts**: Line charts for last 20 games (toggle PTS/REB/AST)
4. **Common Lines Hit Rate Table** (KEY FEATURE):
   ```
   Line | L10 Over | L10 Under | L20 Over | L20 Under | Push% | Quick Action
   22.5 | 90.0%    | 10.0%     | 85.0%    | 15.0%     | 0.0%  | [Build Card]
   24.5 | 80.0%    | 20.0%     | 75.0%    | 25.0%     | 0.0%  | [Build Card]
   26.5 | 60.0%    | 40.0%     | 55.0%    | 45.0%     | 0.0%  | [Build Card]
   ```
5. **Game Logs Table**: Last 10 games with sortable columns
6. **Injury Status**: Latest injury with timestamp

**Example** (simplified):
```tsx
'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

export default function PlayerPage({ params }: { params: { id: string } }) {
  const [player, setPlayer] = useState(null);
  const [aggregates, setAggregates] = useState(null);
  const [propTable, setPropTable] = useState(null);
  const [selectedStat, setSelectedStat] = useState<'PTS' | 'REB' | 'AST'>('PTS');

  useEffect(() => {
    loadPlayerData();
  }, [params.id]);

  async function loadPlayerData() {
    // Fetch player
    const playerDoc = await getDoc(doc(db, 'players', params.id));
    setPlayer(playerDoc.data());

    // Fetch aggregates
    const aggDoc = await getDoc(doc(db, 'playerAggregates', params.id));
    setAggregates(aggDoc.data());

    // Fetch prop table
    const propDoc = await getDoc(doc(db, 'playerPropTables', `${params.id}_${selectedStat}`));
    setPropTable(propDoc.data());
  }

  if (!player) return <div>Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold">{player.name}</h1>
        <p className="text-xl text-gray-600">{player.teamAbbr} • {player.position}</p>
        <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg">
          Create Prop Card
        </button>
      </div>

      {/* Stats Summary */}
      {aggregates && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatTile title="Season" stats={aggregates.seasonAvg} />
          <StatTile title="Last 5" stats={aggregates.last5Avg} />
          <StatTile title="Last 10" stats={aggregates.last10Avg} />
          <StatTile title="Last 20" stats={aggregates.last20Avg} />
        </div>
      )}

      {/* Stat Selector */}
      <div className="flex gap-2 mb-4">
        {(['PTS', 'REB', 'AST'] as const).map((stat) => (
          <button
            key={stat}
            onClick={() => setSelectedStat(stat)}
            className={selectedStat === stat ? 'bg-blue-600 text-white' : 'bg-gray-200'}
          >
            {stat}
          </button>
        ))}
      </div>

      {/* Common Lines Hit Rate Table */}
      {propTable && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Common Lines Hit Rates</h2>
          <table className="w-full border">
            <thead>
              <tr>
                <th>Line</th>
                <th>L10 Over</th>
                <th>L10 Under</th>
                <th>L20 Over</th>
                <th>L20 Under</th>
                <th>Push%</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {propTable.lineRows.map((row) => (
                <tr key={row.line}>
                  <td className="font-bold">{row.line}</td>
                  <td className="text-green-600">{(row.last10Over * 100).toFixed(1)}%</td>
                  <td className="text-red-600">{(row.last10Under * 100).toFixed(1)}%</td>
                  <td className="text-green-600">{(row.last20Over * 100).toFixed(1)}%</td>
                  <td className="text-red-600">{(row.last20Under * 100).toFixed(1)}%</td>
                  <td>{(row.last10Push * 100).toFixed(1)}%</td>
                  <td>
                    <button className="text-blue-600">Build Card</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({ title, stats }) {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="space-y-1">
        <div>{stats.pts} PTS</div>
        <div>{stats.reb} REB</div>
        <div>{stats.ast} AST</div>
        <div>{stats.min} MIN</div>
      </div>
    </div>
  );
}
```

### 10. SEO & Static Generation

**File**: `/apps/web/app/player/[id]/page.tsx`

```tsx
export async function generateMetadata({ params }: { params: { id: string } }) {
  const playerDoc = await getDoc(doc(db, 'players', params.id));
  const player = playerDoc.data();
  const aggregates = await getDoc(doc(db, 'playerAggregates', params.id));
  const stats = aggregates.data();

  return {
    title: `${player.name} Stats & Prop Research | PropPulse`,
    description: `${player.name} (${player.teamAbbr}) averages ${stats?.last10Avg?.pts} PTS, ${stats?.last10Avg?.reb} REB, ${stats?.last10Avg?.ast} AST over last 10 games. View prop research and hit rates.`,
  };
}

export async function generateStaticParams() {
  // Generate static pages for top 50 players
  const topPlayersSnap = await getDocs(
    query(
      collection(db, 'playerAggregates'),
      orderBy('last10Avg.min', 'desc'),
      limit(50)
    )
  );

  return topPlayersSnap.docs.map((doc) => ({
    id: doc.data().playerId,
  }));
}
```

## Deployment

### 1. Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

### 2. Deploy Cloud Functions

```bash
cd functions
npm run build
firebase deploy --only functions:searchPlayers,functions:topPlayers,functions:computeAggregatesDaily,functions:computePropTablesDaily,functions:buildSearchIndexWeekly
```

### 3. Build Search Index (First Time)

```bash
curl -X POST https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/rebuildSearchIndex
```

### 4. Compute Aggregates & Prop Tables (First Time)

```bash
curl -X POST https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/computeAggregatesManual
curl -X POST https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/computePropTablesManual
```

### 5. Set Environment Variables

```bash
# Web .env.local
NEXT_PUBLIC_SEARCH_INDEX_URL=https://storage.googleapis.com/YOUR-BUCKET/search/player-index.json
NEXT_PUBLIC_API_URL=https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net

# Mobile .env
EXPO_PUBLIC_SEARCH_INDEX_URL=...
EXPO_PUBLIC_API_URL=...
```

## Performance Benchmarks

- **Search Index Load**: ~200-500 KB gzipped, loads in <500ms
- **Fuse.js Search**: <10ms for typical queries
- **Firestore Fallback**: ~100-200ms
- **Player Page Load**: ~300-500ms (with aggregates cached)
- **Common Lines Table**: Precomputed, instant display

## Testing

Create test file `/packages/shared/src/search/__tests__/normalization.test.ts`:

```typescript
import { generateSearchTokens, normalizeName } from '../normalization';

describe('Search Normalization', () => {
  test('generates tokens for LeBron James', () => {
    const tokens = generateSearchTokens('LeBron James', ['bron', 'king']);
    
    expect(tokens).toContain('lebron james');
    expect(tokens).toContain('lebronjames');
    expect(tokens).toContain('lebron');
    expect(tokens).toContain('james');
    expect(tokens).toContain('lbj');
    expect(tokens).toContain('ljames');
    expect(tokens).toContain('bron');
    expect(tokens).toContain('king');
  });

  test('generates prefixes', () => {
    const tokens = generateSearchTokens('Ant', []);
    
    expect(tokens).toContain('an');
    expect(tokens).toContain('ant');
  });
});
```

## Monitoring

Check job status in Firestore `jobs` collection:

```typescript
const jobsSnap = await getDocs(
  query(collection(db, 'jobs'), orderBy('completedAt', 'desc'), limit(10))
);

jobsSnap.docs.forEach((doc) => {
  const job = doc.data();
  console.log(`${job.jobName}: ${job.status} (${job.success} success, ${job.failed} failed)`);
});
```

## Future Enhancements

1. **Recently Searched Players**: Store in `/users/{uid}/recentSearches`
2. **Trending Players**: Track search volume and injury spikes
3. **Team Pages**: Roster listings with sortable stats
4. **Advanced Filters**: Filter by position, team, minutes threshold
5. **Player Comparisons**: Side-by-side stat comparisons

## Support

- **Search Issues**: Check Cloud Functions logs for API errors
- **Index Not Loading**: Verify Cloud Storage URL and CORS settings
- **Slow Queries**: Ensure Firestore indexes are deployed
- **Missing Data**: Run manual jobs to recompute aggregates/tables
