/**
 * Player Search Hook (Web)
 * 
 * React hook for player search with Fuse.js and Firestore fallback
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Fuse from 'fuse.js';
import {
  PlayerSearchResult,
  SearchIndexFile,
  PlayerSearchIndex,
} from '@proppulse/shared/search/types';

const SEARCH_INDEX_URL = process.env.NEXT_PUBLIC_SEARCH_INDEX_URL ||
  'https://storage.googleapis.com/your-project.appspot.com/search/player-index.json';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ||
  'https://your-region-your-project.cloudfunctions.net';

interface UsePlayerSearchOptions {
  debounceMs?: number;
  limit?: number;
  includeInactive?: boolean;
}

interface UsePlayerSearchReturn {
  query: string;
  setQuery: (query: string) => void;
  results: PlayerSearchResult[];
  isLoading: boolean;
  error: string | null;
  indexLoaded: boolean;
  search: (q: string) => Promise<void>;
  clearResults: () => void;
}

let globalFuseIndex: Fuse<PlayerSearchIndex> | null = null;
let globalIndexFile: SearchIndexFile | null = null;

/**
 * Load search index from Cloud Storage
 */
async function loadSearchIndex(): Promise<SearchIndexFile | null> {
  if (globalIndexFile) {
    return globalIndexFile;
  }

  try {
    const response = await fetch(SEARCH_INDEX_URL);
    
    if (!response.ok) {
      console.error('Failed to load search index:', response.status);
      return null;
    }

    const indexFile: SearchIndexFile = await response.json();
    globalIndexFile = indexFile;

    // Initialize Fuse.js index
    globalFuseIndex = new Fuse(indexFile.players, {
      keys: ['name', 'tokens'],
      threshold: 0.3, // Lower = more strict matching
      includeScore: true,
      minMatchCharLength: 2,
    });

    console.log(`Search index loaded: ${indexFile.metadata.playerCount} players`);

    return indexFile;
  } catch (error) {
    console.error('Error loading search index:', error);
    return null;
  }
}

/**
 * Search using Fuse.js client-side
 */
function searchWithFuse(
  query: string,
  limit: number,
  includeInactive: boolean
): PlayerSearchResult[] {
  if (!globalFuseIndex) {
    return [];
  }

  const results = globalFuseIndex.search(query, { limit: limit * 2 });

  return results
    .filter((result) => includeInactive || result.item.isActive)
    .slice(0, limit)
    .map((result) => ({
      playerId: result.item.playerId,
      name: result.item.name,
      teamAbbr: result.item.teamAbbr,
      position: result.item.position,
      teamId: result.item.teamId,
      isActive: result.item.isActive,
    }));
}

/**
 * Fallback: search using Firestore API
 */
async function searchWithFirestore(
  query: string,
  limit: number,
  includeInactive: boolean
): Promise<PlayerSearchResult[]> {
  try {
    const url = new URL(`${API_BASE_URL}/searchPlayers`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', limit.toString());
    if (includeInactive) {
      url.searchParams.set('includeInactive', 'true');
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Search API error: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Firestore search error:', error);
    return [];
  }
}

/**
 * usePlayerSearch hook
 */
export function usePlayerSearch(
  options: UsePlayerSearchOptions = {}
): UsePlayerSearchReturn {
  const { debounceMs = 300, limit = 15, includeInactive = false } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexLoaded, setIndexLoaded] = useState(false);

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Load search index on mount
  useEffect(() => {
    loadSearchIndex().then((index) => {
      if (index) {
        setIndexLoaded(true);
      }
    });
  }, []);

  // Perform search
  const search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();

      // Clear results if query is too short
      if (trimmed.length < 1) {
        setResults([]);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let searchResults: PlayerSearchResult[] = [];

        // Try Fuse.js first if index is loaded
        if (globalFuseIndex && trimmed.length >= 2) {
          searchResults = searchWithFuse(trimmed, limit, includeInactive);
        }

        // Fallback to Firestore if no results or index not loaded
        if (searchResults.length === 0 && trimmed.length >= 2) {
          searchResults = await searchWithFirestore(trimmed, limit, includeInactive);
        }

        // For single character queries, use Firestore
        if (trimmed.length === 1) {
          searchResults = await searchWithFirestore(trimmed, limit, includeInactive);
        }

        setResults(searchResults);
      } catch (err) {
        console.error('Search error:', err);
        setError('Search failed. Please try again.');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [limit, includeInactive]
  );

  // Debounced search effect
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (query.trim().length === 0) {
      setResults([]);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      search(query);
    }, debounceMs);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query, search, debounceMs]);

  const clearResults = useCallback(() => {
    setResults([]);
    setQuery('');
    setError(null);
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    indexLoaded,
    search,
    clearResults,
  };
}
