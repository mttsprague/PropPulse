/**
 * Export Cache Manager
 * 
 * Manages export caching to avoid regenerating identical exports
 */

import {
  ExportCacheEntry,
  ExportMetadata,
  THEME_CONFIGS,
} from './types';
import { generateExportHash, generateCacheStoragePath } from './hash';
import { PropCard } from '../prop-card/types';

/**
 * Cache TTL in milliseconds (6 hours)
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Check if cached export exists and is valid
 * 
 * @param hash Export hash
 * @param db Firestore database reference
 * @returns Cache entry if valid, null otherwise
 */
export async function getCachedExport(
  hash: string,
  db: any
): Promise<ExportCacheEntry | null> {
  try {
    const cacheDoc = await db.collection('exportCache').doc(hash).get();

    if (!cacheDoc.exists) {
      return null;
    }

    const cache = cacheDoc.data() as ExportCacheEntry;

    // Check if expired
    const now = Date.now();
    if (cache.expiresAt < now) {
      // Delete expired cache
      await db.collection('exportCache').doc(hash).delete();
      return null;
    }

    // Update last accessed time
    await db.collection('exportCache').doc(hash).update({
      lastAccessedAt: now,
      usageCount: (cache.usageCount || 0) + 1,
    });

    return cache;
  } catch (error) {
    console.error('Error getting cached export:', error);
    return null;
  }
}

/**
 * Store export in cache
 * 
 * @param hash Export hash
 * @param storagePath Storage path
 * @param sizeBytes File size in bytes
 * @param propCard Prop card data (for metadata)
 * @param db Firestore database reference
 */
export async function setCachedExport(
  hash: string,
  storagePath: string,
  sizeBytes: number,
  propCard: PropCard,
  db: any
): Promise<void> {
  try {
    const now = Date.now();

    const cacheEntry: ExportCacheEntry = {
      hash,
      storagePath,
      sizeBytes,
      propCardMeta: {
        playerId: propCard.meta.playerId,
        playerName: propCard.meta.playerName,
        statType: propCard.meta.statType,
        line: propCard.meta.line,
        side: propCard.meta.side,
      },
      lastAccessedAt: now,
      usageCount: 1,
      createdAt: now,
      expiresAt: now + CACHE_TTL_MS,
    };

    await db.collection('exportCache').doc(hash).set(cacheEntry);
  } catch (error) {
    console.error('Error setting cached export:', error);
    // Don't throw - caching failures shouldn't break exports
  }
}

/**
 * Store user export metadata
 * 
 * @param exportMetadata Export metadata
 * @param db Firestore database reference
 */
export async function storeExportMetadata(
  exportMetadata: ExportMetadata,
  db: any
): Promise<void> {
  await db
    .collection('users')
    .doc(exportMetadata.uid)
    .collection('exports')
    .doc(exportMetadata.id)
    .set(exportMetadata);
}

/**
 * Get export metadata by ID
 * 
 * @param uid User ID
 * @param exportId Export ID
 * @param db Firestore database reference
 * @returns Export metadata or null
 */
export async function getExportMetadata(
  uid: string,
  exportId: string,
  db: any
): Promise<ExportMetadata | null> {
  try {
    const doc = await db
      .collection('users')
      .doc(uid)
      .collection('exports')
      .doc(exportId)
      .get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() as ExportMetadata;
  } catch (error) {
    console.error('Error getting export metadata:', error);
    return null;
  }
}

/**
 * Generate signed URL for export
 * 
 * @param storagePath Storage path
 * @param storage Firebase Storage instance
 * @param expiresIn Expiration time in seconds (default: 1 hour)
 * @returns Signed URL
 */
export async function generateSignedUrl(
  storagePath: string,
  storage: any,
  expiresIn: number = 3600
): Promise<string> {
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresIn * 1000,
  });

  return signedUrl;
}

/**
 * Update export metadata with fresh signed URL
 * 
 * @param uid User ID
 * @param exportId Export ID
 * @param signedUrl New signed URL
 * @param expiresAt Expiration timestamp
 * @param db Firestore database reference
 */
export async function updateExportSignedUrl(
  uid: string,
  exportId: string,
  signedUrl: string,
  expiresAt: number,
  db: any
): Promise<void> {
  await db
    .collection('users')
    .doc(uid)
    .collection('exports')
    .doc(exportId)
    .update({
      signedUrl,
      signedUrlExpiresAt: expiresAt,
      updatedAt: Date.now(),
    });
}

/**
 * Clean up expired exports (for scheduled cleanup job)
 * 
 * @param db Firestore database reference
 * @param storage Firebase Storage instance
 * @param olderThanMs Delete exports older than this (default: 30 days)
 * @returns Number of exports deleted
 */
export async function cleanupExpiredExports(
  db: any,
  storage: any,
  olderThanMs: number = 30 * 24 * 60 * 60 * 1000
): Promise<number> {
  const cutoffTime = Date.now() - olderThanMs;
  let deletedCount = 0;

  try {
    // Clean up expired cache entries (older than 24 hours)
    const cacheSnapshot = await db
      .collection('exportCache')
      .where('expiresAt', '<', Date.now())
      .limit(500)
      .get();

    const bucket = storage.bucket();
    const batch = db.batch();

    for (const doc of cacheSnapshot.docs) {
      const cache = doc.data() as ExportCacheEntry;

      // Delete from storage
      try {
        await bucket.file(cache.storagePath).delete();
      } catch (error) {
        console.error(`Failed to delete file ${cache.storagePath}:`, error);
      }

      // Delete from Firestore
      batch.delete(doc.ref);
      deletedCount++;
    }

    await batch.commit();

    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up expired exports:', error);
    return deletedCount;
  }
}

/**
 * Get user export history
 * 
 * @param uid User ID
 * @param db Firestore database reference
 * @param limit Max results
 * @returns Array of export metadata
 */
export async function getUserExportHistory(
  uid: string,
  db: any,
  limit: number = 50
): Promise<ExportMetadata[]> {
  try {
    const snapshot = await db
      .collection('users')
      .doc(uid)
      .collection('exports')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const exports: ExportMetadata[] = [];
    snapshot.forEach((doc: any) => {
      exports.push(doc.data() as ExportMetadata);
    });

    return exports;
  } catch (error) {
    console.error('Error getting user export history:', error);
    return [];
  }
}
