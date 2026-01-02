/**
 * Player Search Index Builder
 * 
 * Builds a precomputed search index and stores it in Cloud Storage
 * for instant client-side fuzzy search with Fuse.js
 */

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import {
  PlayerSearchIndex,
  SearchIndexFile,
  SearchIndexMetadata,
} from './types';
import {
  generateSearchTokensWithNicknames,
  normalizeName,
  normalizeNameNoSpaces,
} from './normalization';

/**
 * Build search index from all players in Firestore
 */
export async function buildPlayerSearchIndex(
  db: admin.firestore.Firestore
): Promise<SearchIndexFile> {
  const players: PlayerSearchIndex[] = [];
  
  try {
    // Fetch all players (active and inactive)
    const playersSnapshot = await db.collection('players').get();
    
    console.log(`Building search index for ${playersSnapshot.size} players...`);
    
    playersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const playerId = doc.id;
      const name = data.name || 'Unknown';
      const teamAbbr = data.teamAbbr || data.team || '';
      const position = data.position || '';
      const teamId = data.teamId || '';
      const isActive = data.isActive !== false; // Default to true
      
      // Generate search tokens
      const tokens = generateSearchTokensWithNicknames(name);
      
      players.push({
        playerId,
        name,
        teamAbbr,
        position,
        teamId,
        tokens,
        isActive,
      });
    });
    
    // Sort by name for consistency
    players.sort((a, b) => a.name.localeCompare(b.name));
    
    // Generate checksum for cache busting
    const content = JSON.stringify(players);
    const checksum = createHash('md5').update(content).digest('hex').substring(0, 8);
    
    const metadata: SearchIndexMetadata = {
      version: '1.0',
      generatedAt: Date.now(),
      playerCount: players.length,
      checksum,
    };
    
    const indexFile: SearchIndexFile = {
      metadata,
      players,
    };
    
    console.log(`Search index built: ${players.length} players, checksum ${checksum}`);
    
    return indexFile;
  } catch (error) {
    console.error('Error building search index:', error);
    throw error;
  }
}

/**
 * Store search index in Cloud Storage
 */
export async function storeSearchIndex(
  indexFile: SearchIndexFile,
  storage: admin.storage.Storage
): Promise<string> {
  const bucket = storage.bucket();
  const file = bucket.file('search/player-index.json');
  
  const content = JSON.stringify(indexFile, null, 0); // No pretty printing for smaller size
  
  await file.save(content, {
    contentType: 'application/json',
    metadata: {
      cacheControl: 'public, max-age=3600', // Cache for 1 hour
      metadata: {
        version: indexFile.metadata.version,
        checksum: indexFile.metadata.checksum,
        generatedAt: indexFile.metadata.generatedAt.toString(),
      },
    },
    gzip: true, // Enable compression
  });
  
  // Make file publicly readable
  await file.makePublic();
  
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/search/player-index.json`;
  
  console.log(`Search index stored at: ${publicUrl}`);
  console.log(`Index size: ${(content.length / 1024).toFixed(2)} KB`);
  
  return publicUrl;
}

/**
 * Update player search fields in Firestore
 * 
 * Adds searchTokens, searchNameNormalized, searchNameNoSpaces to each player document
 */
export async function updatePlayerSearchFields(
  db: admin.firestore.Firestore
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  try {
    const playersSnapshot = await db.collection('players').get();
    
    console.log(`Updating search fields for ${playersSnapshot.size} players...`);
    
    // Process in batches (Firestore batch write limit is 500)
    const batchSize = 500;
    const players = playersSnapshot.docs;
    
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = db.batch();
      const batchPlayers = players.slice(i, i + batchSize);
      
      batchPlayers.forEach((playerDoc) => {
        try {
          const data = playerDoc.data();
          const name = data.name || 'Unknown';
          
          const searchTokens = generateSearchTokensWithNicknames(name);
          const searchNameNormalized = normalizeName(name);
          const searchNameNoSpaces = normalizeNameNoSpaces(name);
          
          batch.update(playerDoc.ref, {
            searchTokens,
            searchNameNormalized,
            searchNameNoSpaces,
            updatedAt: Date.now(),
          });
          
          success++;
        } catch (error) {
          console.error(`Failed to update search fields for ${playerDoc.id}:`, error);
          failed++;
        }
      });
      
      await batch.commit();
      console.log(`Updated batch ${i / batchSize + 1} of ${Math.ceil(players.length / batchSize)}`);
    }
    
    console.log(`Search fields update complete: ${success} success, ${failed} failed`);
  } catch (error) {
    console.error('Error updating search fields:', error);
  }
  
  return { success, failed };
}

/**
 * Build and store search index (full workflow)
 */
export async function buildAndStoreSearchIndex(
  db: admin.firestore.Firestore,
  storage: admin.storage.Storage
): Promise<{
  success: boolean;
  url?: string;
  playerCount?: number;
  checksum?: string;
  error?: string;
}> {
  try {
    // Step 1: Update player search fields in Firestore
    console.log('Step 1: Updating player search fields...');
    await updatePlayerSearchFields(db);
    
    // Step 2: Build search index
    console.log('Step 2: Building search index...');
    const indexFile = await buildPlayerSearchIndex(db);
    
    // Step 3: Store in Cloud Storage
    console.log('Step 3: Storing search index in Cloud Storage...');
    const url = await storeSearchIndex(indexFile, storage);
    
    return {
      success: true,
      url,
      playerCount: indexFile.metadata.playerCount,
      checksum: indexFile.metadata.checksum,
    };
  } catch (error) {
    console.error('Error in buildAndStoreSearchIndex:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch search index from Cloud Storage (for client-side use)
 */
export async function fetchSearchIndex(
  storageUrl: string
): Promise<SearchIndexFile | null> {
  try {
    const response = await fetch(storageUrl);
    
    if (!response.ok) {
      console.error(`Failed to fetch search index: ${response.status}`);
      return null;
    }
    
    const indexFile: SearchIndexFile = await response.json();
    
    console.log(`Loaded search index: ${indexFile.metadata.playerCount} players`);
    
    return indexFile;
  } catch (error) {
    console.error('Error fetching search index:', error);
    return null;
  }
}
