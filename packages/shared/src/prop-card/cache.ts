/**
 * Prop Card Cache
 * 
 * Caching strategy for computed prop cards.
 * Cards are cached for 6 hours to reduce recomputation.
 * Cache key is deterministic hash of query parameters.
 */

import crypto from 'crypto';
import { PropQuery, PropCard, CachedPropCard } from './types';

/**
 * Cache TTL in milliseconds (6 hours)
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Generate cache key from prop query
 * 
 * @param query Prop query
 * @returns Deterministic hash key
 */
export function generateCacheKey(query: PropQuery): string {
  const canonical = [
    query.playerId,
    query.statType,
    query.line.toFixed(1),
    query.side,
    query.gameDate || 'today',
  ].join('|');

  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Get cached prop card from Firestore
 * 
 * @param query Prop query
 * @param cacheCollection Firestore collection reference
 * @returns Cached card if valid, null otherwise
 */
export async function getCachedPropCard(
  query: PropQuery,
  cacheCollection: any // FirebaseFirestore.CollectionReference
): Promise<PropCard | null> {
  try {
    const cacheKey = generateCacheKey(query);
    const doc = await cacheCollection.doc(cacheKey).get();

    if (!doc.exists) {
      return null;
    }

    const cached = doc.data() as CachedPropCard;

    // Check if expired
    const now = Date.now();
    if (cached.expiresAt < now) {
      // Delete expired cache entry
      await cacheCollection.doc(cacheKey).delete();
      return null;
    }

    return cached.card;
  } catch (error) {
    console.error('Error getting cached prop card:', error);
    return null;
  }
}

/**
 * Set cached prop card in Firestore
 * 
 * @param query Prop query
 * @param card Computed prop card
 * @param cacheCollection Firestore collection reference
 */
export async function setCachedPropCard(
  query: PropQuery,
  card: PropCard,
  cacheCollection: any // FirebaseFirestore.CollectionReference
): Promise<void> {
  try {
    const cacheKey = generateCacheKey(query);
    const now = Date.now();

    const cached: CachedPropCard = {
      query,
      card,
      cachedAt: now,
      expiresAt: now + CACHE_TTL_MS,
    };

    await cacheCollection.doc(cacheKey).set(cached);
  } catch (error) {
    console.error('Error setting cached prop card:', error);
    // Don't throw - caching failures shouldn't break the app
  }
}

/**
 * Invalidate cached prop card
 * 
 * @param query Prop query
 * @param cacheCollection Firestore collection reference
 */
export async function invalidateCachedPropCard(
  query: PropQuery,
  cacheCollection: any // FirebaseFirestore.CollectionReference
): Promise<void> {
  try {
    const cacheKey = generateCacheKey(query);
    await cacheCollection.doc(cacheKey).delete();
  } catch (error) {
    console.error('Error invalidating cached prop card:', error);
  }
}

/**
 * Clean up expired cache entries
 * 
 * Should be run periodically (e.g., daily)
 * 
 * @param cacheCollection Firestore collection reference
 * @returns Number of entries deleted
 */
export async function cleanExpiredCache(
  cacheCollection: any // FirebaseFirestore.CollectionReference
): Promise<number> {
  try {
    const now = Date.now();
    const snapshot = await cacheCollection
      .where('expiresAt', '<', now)
      .limit(500) // Batch delete
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = cacheCollection.firestore.batch();
    snapshot.forEach((doc: any) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    return snapshot.size;
  } catch (error) {
    console.error('Error cleaning expired cache:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 * 
 * @param cacheCollection Firestore collection reference
 * @returns Cache statistics
 */
export async function getCacheStats(
  cacheCollection: any // FirebaseFirestore.CollectionReference
): Promise<{
  totalEntries: number;
  expiredEntries: number;
  validEntries: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}> {
  try {
    const snapshot = await cacheCollection.limit(1000).get();

    if (snapshot.empty) {
      return {
        totalEntries: 0,
        expiredEntries: 0,
        validEntries: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }

    const now = Date.now();
    let expiredCount = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    snapshot.forEach((doc: any) => {
      const data = doc.data() as CachedPropCard;

      if (data.expiresAt < now) {
        expiredCount++;
      }

      if (oldestEntry === null || data.cachedAt < oldestEntry) {
        oldestEntry = data.cachedAt;
      }

      if (newestEntry === null || data.cachedAt > newestEntry) {
        newestEntry = data.cachedAt;
      }
    });

    return {
      totalEntries: snapshot.size,
      expiredEntries: expiredCount,
      validEntries: snapshot.size - expiredCount,
      oldestEntry,
      newestEntry,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      totalEntries: 0,
      expiredEntries: 0,
      validEntries: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }
}
