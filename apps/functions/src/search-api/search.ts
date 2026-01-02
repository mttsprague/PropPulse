/**
 * Search API Cloud Functions
 * 
 * Provides endpoints for player search and top players
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  PlayerSearchResult,
  SearchResponse,
  TopPlayersResponse,
} from '../shared-search/types';
import {
  normalizeName,
  computeSimilarityScore,
  isValidSearchQuery,
  sanitizeSearchQuery,
} from '../shared-search/normalization';

const db = admin.firestore();

// In-memory cache for search results (5 minutes TTL)
const searchCache = new Map<string, { results: PlayerSearchResult[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Search players by query using Firestore
 * 
 * Uses normalized name prefix matching as fallback when Fuse.js is not available
 */
async function searchPlayersFirestore(
  query: string,
  limit: number = 15,
  includeInactive: boolean = false
): Promise<PlayerSearchResult[]> {
  const normalized = normalizeName(query);
  
  // Build Firestore query
  let firestoreQuery = db.collection('players') as admin.firestore.Query;
  
  // Filter by active status if needed
  if (!includeInactive) {
    firestoreQuery = firestoreQuery.where('isActive', '==', true);
  }
  
  // Prefix match on normalized name
  // Use range query: name >= "query" AND name < "query\uf8ff"
  firestoreQuery = firestoreQuery
    .where('searchNameNormalized', '>=', normalized)
    .where('searchNameNormalized', '<', normalized + '\uf8ff')
    .limit(limit * 2); // Get extra results for scoring
  
  const snapshot = await firestoreQuery.get();
  
  if (snapshot.empty) {
    // Fallback: try searching by tokens
    const tokensSnapshot = await db
      .collection('players')
      .where('searchTokens', 'array-contains', normalized.split(' ')[0])
      .limit(limit * 2)
      .get();
    
    if (tokensSnapshot.empty) {
      return [];
    }
    
    return processSearchResults(tokensSnapshot.docs, query, limit);
  }
  
  return processSearchResults(snapshot.docs, query, limit);
}

/**
 * Process and rank search results
 */
function processSearchResults(
  docs: admin.firestore.QueryDocumentSnapshot[],
  query: string,
  limit: number
): PlayerSearchResult[] {
  const results = docs.map((doc) => {
    const data = doc.data();
    
    const result: PlayerSearchResult & { score: number } = {
      playerId: doc.id,
      name: data.name || 'Unknown',
      teamAbbr: data.teamAbbr || data.team || '',
      position: data.position || '',
      teamId: data.teamId || '',
      isActive: data.isActive !== false,
      headshotUrl: data.headshotUrl,
      score: computeSimilarityScore(query, data.name, data.searchTokens || []),
    };
    
    return result;
  });
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  // Remove score field and limit results
  return results.slice(0, limit).map(({ score, ...rest }) => rest);
}

/**
 * GET /api/search/players?q=...
 * 
 * Search for players by name
 */
export const searchPlayers = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 15;
    const includeInactive = req.query.includeInactive === 'true';
    
    // Validate query
    if (!query || !isValidSearchQuery(query)) {
      // Return trending players if query is empty or invalid
      const trending = await getTrendingPlayers(limit);
      
      const response: SearchResponse = {
        results: trending,
        cached: false,
        source: 'trending',
        queryTime: 0,
      };
      
      res.status(200).json(response);
      return;
    }
    
    const sanitized = sanitizeSearchQuery(query);
    
    // Check cache
    const cacheKey = `${sanitized}:${limit}:${includeInactive}`;
    const cached = searchCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const response: SearchResponse = {
        results: cached.results,
        cached: true,
        source: 'firestore',
        queryTime: 0,
      };
      
      res.status(200).json(response);
      return;
    }
    
    // Perform search
    const startTime = Date.now();
    const results = await searchPlayersFirestore(sanitized, limit, includeInactive);
    const queryTime = Date.now() - startTime;
    
    // Cache results
    searchCache.set(cacheKey, { results, timestamp: Date.now() });
    
    const response: SearchResponse = {
      results,
      cached: false,
      source: 'firestore',
      queryTime,
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Get trending players (fallback when no query)
 */
async function getTrendingPlayers(limit: number): Promise<PlayerSearchResult[]> {
  try {
    // Get players with highest last10 minutes (active players)
    const snapshot = await db
      .collection('playerAggregates')
      .orderBy('last10Avg.min', 'desc')
      .limit(limit)
      .get();
    
    if (snapshot.empty) {
      // Fallback: just get active players by name
      const fallbackSnapshot = await db
        .collection('players')
        .where('isActive', '==', true)
        .limit(limit)
        .get();
      
      return fallbackSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          playerId: doc.id,
          name: data.name || 'Unknown',
          teamAbbr: data.teamAbbr || '',
          position: data.position || '',
          teamId: data.teamId || '',
          isActive: true,
        };
      });
    }
    
    // Fetch full player data
    const playerIds = snapshot.docs.map((doc) => doc.data().playerId);
    const players = await Promise.all(
      playerIds.map(async (playerId) => {
        const playerDoc = await db.collection('players').doc(playerId).get();
        if (!playerDoc.exists) return null;
        
        const data = playerDoc.data()!;
        return {
          playerId,
          name: data.name || 'Unknown',
          teamAbbr: data.teamAbbr || '',
          position: data.position || '',
          teamId: data.teamId || '',
          isActive: data.isActive !== false,
        };
      })
    );
    
    return players.filter((p) => p !== null) as PlayerSearchResult[];
  } catch (error) {
    console.error('Error fetching trending players:', error);
    return [];
  }
}

/**
 * GET /api/players/top
 * 
 * Get top players by stat
 */
export const topPlayers = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    const stat = (req.query.stat as string) || 'pts';
    const period = (req.query.period as string) || 'last10';
    const limit = parseInt(req.query.limit as string) || 20;
    
    // Validate inputs
    const validStats = ['pts', 'reb', 'ast', 'min'];
    const validPeriods = ['season', 'last10', 'last20'];
    
    if (!validStats.includes(stat)) {
      res.status(400).json({ error: 'Invalid stat. Must be: pts, reb, ast, or min' });
      return;
    }
    
    if (!validPeriods.includes(period)) {
      res.status(400).json({ error: 'Invalid period. Must be: season, last10, or last20' });
      return;
    }
    
    // Check cache
    const cacheKey = `top:${stat}:${period}:${limit}`;
    const cached = searchCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const response: TopPlayersResponse = {
        players: cached.results,
        stat,
        period,
        cached: true,
      };
      
      res.status(200).json(response);
      return;
    }
    
    // Fetch top players
    const fieldPath = `${period}Avg.${stat}`;
    
    const snapshot = await db
      .collection('playerAggregates')
      .orderBy(fieldPath, 'desc')
      .limit(limit)
      .get();
    
    if (snapshot.empty) {
      res.status(200).json({
        players: [],
        stat,
        period,
        cached: false,
      });
      return;
    }
    
    // Fetch full player data
    const playerIds = snapshot.docs.map((doc) => doc.data().playerId);
    const players = await Promise.all(
      playerIds.map(async (playerId) => {
        const playerDoc = await db.collection('players').doc(playerId).get();
        if (!playerDoc.exists) return null;
        
        const data = playerDoc.data()!;
        return {
          playerId,
          name: data.name || 'Unknown',
          teamAbbr: data.teamAbbr || '',
          position: data.position || '',
          teamId: data.teamId || '',
          isActive: data.isActive !== false,
        };
      })
    );
    
    const results = players.filter((p) => p !== null) as PlayerSearchResult[];
    
    // Cache results
    searchCache.set(cacheKey, { results, timestamp: Date.now() });
    
    const response: TopPlayersResponse = {
      players: results,
      stat,
      period,
      cached: false,
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Top players error:', error);
    res.status(500).json({ error: 'Failed to fetch top players' });
  }
});
