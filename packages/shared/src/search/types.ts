/**
 * Search Types
 * 
 * Type definitions for player search functionality
 */

export interface PlayerSearchResult {
  playerId: string;
  name: string;
  teamAbbr: string;
  position: string;
  teamId: string;
  isActive?: boolean;
  headshotUrl?: string;
}

export interface PlayerSearchIndex {
  playerId: string;
  name: string;
  teamAbbr: string;
  position: string;
  teamId: string;
  tokens: string[];
  isActive: boolean;
}

export interface SearchIndexMetadata {
  version: string;
  generatedAt: number;
  playerCount: number;
  checksum?: string;
}

export interface SearchIndexFile {
  metadata: SearchIndexMetadata;
  players: PlayerSearchIndex[];
}

export interface SearchQuery {
  query: string;
  limit?: number;
  includeInactive?: boolean;
}

export interface SearchResponse {
  results: PlayerSearchResult[];
  cached: boolean;
  source: 'fuse' | 'firestore' | 'trending';
  queryTime: number;
}

export interface TopPlayersQuery {
  stat?: 'pts' | 'reb' | 'ast' | 'min';
  period?: 'season' | 'last10' | 'last20';
  limit?: number;
}

export interface TopPlayersResponse {
  players: PlayerSearchResult[];
  stat: string;
  period: string;
  cached: boolean;
}

/**
 * Player aggregate stats (precomputed daily)
 */
export interface PlayerAggregates {
  playerId: string;
  playerName: string;
  teamId: string;
  seasonAvg: {
    pts: number;
    reb: number;
    ast: number;
    min: number;
    gamesPlayed: number;
  };
  last5Avg: {
    pts: number;
    reb: number;
    ast: number;
    min: number;
  };
  last10Avg: {
    pts: number;
    reb: number;
    ast: number;
    min: number;
  };
  last20Avg: {
    pts: number;
    reb: number;
    ast: number;
    min: number;
  };
  updatedAt: number;
}

/**
 * Common prop lines hit rate table (key feature!)
 */
export interface PropLineRow {
  line: number;
  last10Over: number;      // Hit rate 0-1
  last10Under: number;
  last10Push: number;
  last20Over: number;
  last20Under: number;
  last20Push: number;
  seasonOver?: number;
  seasonUnder?: number;
  seasonPush?: number;
}

export interface PlayerPropTable {
  playerId: string;
  playerName: string;
  statType: 'PTS' | 'REB' | 'AST';
  lineRows: PropLineRow[];
  generatedAt: number;
  seasonAvg: number;
  last10Avg: number;
  last20Avg: number;
}

export interface RecentSearch {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  searchedAt: number;
}
