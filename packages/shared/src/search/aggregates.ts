/**
 * Player Aggregates Computation
 * 
 * Daily job to compute season/last5/last10/last20 averages for all players
 */

import * as admin from 'firebase-admin';
import { PlayerAggregates } from './types';

interface GameLog {
  date: string;
  pts: number;
  reb: number;
  ast: number;
  min: number;
}

/**
 * Compute averages from game logs
 */
function computeAverages(
  logs: GameLog[]
): {
  pts: number;
  reb: number;
  ast: number;
  min: number;
} {
  if (logs.length === 0) {
    return { pts: 0, reb: 0, ast: 0, min: 0 };
  }

  const totals = logs.reduce(
    (acc, log) => ({
      pts: acc.pts + log.pts,
      reb: acc.reb + log.reb,
      ast: acc.ast + log.ast,
      min: acc.min + log.min,
    }),
    { pts: 0, reb: 0, ast: 0, min: 0 }
  );

  return {
    pts: parseFloat((totals.pts / logs.length).toFixed(1)),
    reb: parseFloat((totals.reb / logs.length).toFixed(1)),
    ast: parseFloat((totals.ast / logs.length).toFixed(1)),
    min: parseFloat((totals.min / logs.length).toFixed(1)),
  };
}

/**
 * Compute aggregates for a single player
 */
export async function computePlayerAggregates(
  playerId: string,
  db: admin.firestore.Firestore
): Promise<PlayerAggregates | null> {
  try {
    // Fetch player info
    const playerDoc = await db.collection('players').doc(playerId).get();
    
    if (!playerDoc.exists) {
      console.warn(`Player not found: ${playerId}`);
      return null;
    }

    const playerData = playerDoc.data();
    const playerName = playerData?.name || 'Unknown';
    const teamId = playerData?.teamId || '';

    // Fetch all game logs for current season, sorted by date desc
    const logsSnapshot = await db
      .collection('playerGameStats')
      .where('playerId', '==', playerId)
      .orderBy('date', 'desc')
      .limit(100) // Get up to 100 games
      .get();

    if (logsSnapshot.empty) {
      console.warn(`No game logs found for player: ${playerId}`);
      return null;
    }

    const allLogs: GameLog[] = logsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        date: data.date,
        pts: data.pts || 0,
        reb: data.reb || 0,
        ast: data.ast || 0,
        min: data.min || 0,
      };
    });

    // Compute different periods
    const seasonLogs = allLogs; // All available logs
    const last5Logs = allLogs.slice(0, 5);
    const last10Logs = allLogs.slice(0, 10);
    const last20Logs = allLogs.slice(0, 20);

    const seasonAvg = computeAverages(seasonLogs);
    const last5Avg = computeAverages(last5Logs);
    const last10Avg = computeAverages(last10Logs);
    const last20Avg = computeAverages(last20Logs);

    const aggregates: PlayerAggregates = {
      playerId,
      playerName,
      teamId,
      seasonAvg: {
        ...seasonAvg,
        gamesPlayed: seasonLogs.length,
      },
      last5Avg,
      last10Avg,
      last20Avg,
      updatedAt: Date.now(),
    };

    return aggregates;
  } catch (error) {
    console.error(`Error computing aggregates for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Store player aggregates in Firestore
 */
export async function storePlayerAggregates(
  aggregates: PlayerAggregates,
  db: admin.firestore.Firestore
): Promise<void> {
  await db
    .collection('playerAggregates')
    .doc(aggregates.playerId)
    .set(aggregates);
}

/**
 * Compute aggregates for all active players
 */
export async function computePlayerAggregatesForAll(
  db: admin.firestore.Firestore
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  try {
    // Fetch all active players
    const playersSnapshot = await db
      .collection('players')
      .where('isActive', '==', true)
      .get();

    console.log(`Computing aggregates for ${playersSnapshot.size} players...`);

    // Process in batches to avoid memory issues
    const batchSize = 10;
    const players = playersSnapshot.docs;

    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (playerDoc) => {
          try {
            const playerId = playerDoc.id;
            const aggregates = await computePlayerAggregates(playerId, db);
            
            if (aggregates) {
              await storePlayerAggregates(aggregates, db);
              success++;
              console.log(`✓ Computed aggregates for ${aggregates.playerName}`);
            } else {
              failed++;
            }
          } catch (error) {
            console.error(`Failed to compute aggregates for ${playerDoc.id}:`, error);
            failed++;
          }
        })
      );

      // Small delay between batches
      if (i + batchSize < players.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(`Aggregates computation complete: ${success} success, ${failed} failed`);
  } catch (error) {
    console.error('Error in computePlayerAggregatesForAll:', error);
  }

  return { success, failed };
}

/**
 * Get player aggregates from Firestore
 */
export async function getPlayerAggregates(
  playerId: string,
  db: admin.firestore.Firestore
): Promise<PlayerAggregates | null> {
  try {
    const doc = await db.collection('playerAggregates').doc(playerId).get();
    
    if (!doc.exists) {
      return null;
    }

    return doc.data() as PlayerAggregates;
  } catch (error) {
    console.error(`Error fetching aggregates for ${playerId}:`, error);
    return null;
  }
}
