/**
 * Common Prop Lines Hit Rate Computation
 * 
 * Computes hit rates for common prop lines (18.5, 20.5, 22.5, etc.)
 * This is a KEY FEATURE that bettors love - shows historical performance at specific lines
 */

import * as admin from 'firebase-admin';
import { PlayerPropTable, PropLineRow } from './types';

interface GameLog {
  date: string;
  pts: number;
  reb: number;
  ast: number;
}

type StatType = 'PTS' | 'REB' | 'AST';

/**
 * Generate common prop lines based on average
 * 
 * For example, if player averages 24.3 pts, generate lines:
 * 18.5, 20.5, 22.5, 24.5, 26.5, 28.5, 30.5
 */
export function generateCommonLines(
  seasonAvg: number,
  last10Avg: number,
  last20Avg: number
): number[] {
  // Use the midpoint of recent and season average as center
  const center = (seasonAvg + last10Avg + last20Avg) / 3;
  
  // Round to nearest 0.5
  const centerLine = Math.round(center * 2) / 2;
  
  // Generate lines around center
  const lines = new Set<number>();
  
  // Add center line and surrounding lines
  for (let offset = -6; offset <= 6; offset++) {
    const line = centerLine + offset;
    if (line > 0) {
      lines.add(line);
    }
  }
  
  // Also ensure we have common increments (.5 lines)
  const minLine = Math.max(0.5, Math.floor(center) - 5);
  const maxLine = Math.ceil(center) + 5;
  
  for (let line = minLine; line <= maxLine; line += 0.5) {
    if (line > 0) {
      lines.add(line);
    }
  }
  
  // Convert to sorted array and limit to reasonable range
  const sortedLines = Array.from(lines).sort((a, b) => a - b);
  
  // Filter to keep only lines within reasonable bounds
  // (don't show 1.5 pts for a 25ppg scorer, or 50.5 for a 12ppg scorer)
  const reasonable = sortedLines.filter((line) => {
    return line >= center * 0.5 && line <= center * 1.5;
  });
  
  // Limit to 15 lines maximum
  const final = reasonable.slice(0, 15);
  
  // Ensure we have at least 5 lines
  if (final.length < 5) {
    // Fallback: generate 5 lines around center
    const fallback: number[] = [];
    for (let i = -2; i <= 2; i++) {
      const line = Math.max(0.5, centerLine + i);
      fallback.push(line);
    }
    return fallback;
  }
  
  return final;
}

/**
 * Compute hit rates for a specific line
 */
function computeHitRates(
  logs: GameLog[],
  statType: StatType,
  line: number
): {
  over: number;
  under: number;
  push: number;
} {
  if (logs.length === 0) {
    return { over: 0, under: 0, push: 0 };
  }
  
  let overs = 0;
  let unders = 0;
  let pushes = 0;
  
  logs.forEach((log) => {
    const statValue = log[statType.toLowerCase() as 'pts' | 'reb' | 'ast'];
    
    if (statValue > line) {
      overs++;
    } else if (statValue < line) {
      unders++;
    } else {
      pushes++;
    }
  });
  
  const total = logs.length;
  
  return {
    over: parseFloat((overs / total).toFixed(3)),
    under: parseFloat((unders / total).toFixed(3)),
    push: parseFloat((pushes / total).toFixed(3)),
  };
}

/**
 * Compute prop table for a player and stat type
 */
export async function computePlayerPropTable(
  playerId: string,
  statType: StatType,
  db: admin.firestore.Firestore
): Promise<PlayerPropTable | null> {
  try {
    // Fetch player info
    const playerDoc = await db.collection('players').doc(playerId).get();
    
    if (!playerDoc.exists) {
      console.warn(`Player not found: ${playerId}`);
      return null;
    }
    
    const playerName = playerDoc.data()?.name || 'Unknown';
    
    // Fetch player aggregates to get averages
    const aggregatesDoc = await db
      .collection('playerAggregates')
      .doc(playerId)
      .get();
    
    if (!aggregatesDoc.exists) {
      console.warn(`No aggregates found for player: ${playerId}`);
      return null;
    }
    
    const aggregates = aggregatesDoc.data();
    const statKey = statType.toLowerCase() as 'pts' | 'reb' | 'ast';
    
    const seasonAvg = aggregates?.seasonAvg?.[statKey] || 0;
    const last10Avg = aggregates?.last10Avg?.[statKey] || 0;
    const last20Avg = aggregates?.last20Avg?.[statKey] || 0;
    
    // Fetch game logs
    const logsSnapshot = await db
      .collection('playerGameStats')
      .where('playerId', '==', playerId)
      .orderBy('date', 'desc')
      .limit(100)
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
      };
    });
    
    const last10Logs = allLogs.slice(0, 10);
    const last20Logs = allLogs.slice(0, 20);
    
    // Generate common lines
    const lines = generateCommonLines(seasonAvg, last10Avg, last20Avg);
    
    // Compute hit rates for each line
    const lineRows: PropLineRow[] = lines.map((line) => {
      const last10Rates = computeHitRates(last10Logs, statType, line);
      const last20Rates = computeHitRates(last20Logs, statType, line);
      const seasonRates = computeHitRates(allLogs, statType, line);
      
      return {
        line,
        last10Over: last10Rates.over,
        last10Under: last10Rates.under,
        last10Push: last10Rates.push,
        last20Over: last20Rates.over,
        last20Under: last20Rates.under,
        last20Push: last20Rates.push,
        seasonOver: seasonRates.over,
        seasonUnder: seasonRates.under,
        seasonPush: seasonRates.push,
      };
    });
    
    const propTable: PlayerPropTable = {
      playerId,
      playerName,
      statType,
      lineRows,
      generatedAt: Date.now(),
      seasonAvg,
      last10Avg,
      last20Avg,
    };
    
    return propTable;
  } catch (error) {
    console.error(`Error computing prop table for ${playerId} ${statType}:`, error);
    return null;
  }
}

/**
 * Store prop table in Firestore
 */
export async function storePlayerPropTable(
  propTable: PlayerPropTable,
  db: admin.firestore.Firestore
): Promise<void> {
  const docId = `${propTable.playerId}_${propTable.statType}`;
  
  await db.collection('playerPropTables').doc(docId).set(propTable);
}

/**
 * Compute prop tables for all stat types for a single player
 */
export async function computePlayerPropTables(
  playerId: string,
  db: admin.firestore.Firestore
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  const statTypes: StatType[] = ['PTS', 'REB', 'AST'];
  
  for (const statType of statTypes) {
    try {
      const propTable = await computePlayerPropTable(playerId, statType, db);
      
      if (propTable) {
        await storePlayerPropTable(propTable, db);
        success++;
        console.log(`✓ Computed ${statType} prop table for ${propTable.playerName}`);
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`Failed to compute ${statType} prop table for ${playerId}:`, error);
      failed++;
    }
  }
  
  return { success, failed };
}

/**
 * Compute prop tables for all active players
 */
export async function computePropTablesForAll(
  db: admin.firestore.Firestore
): Promise<{ success: number; failed: number }> {
  let totalSuccess = 0;
  let totalFailed = 0;
  
  try {
    // Fetch all active players
    const playersSnapshot = await db
      .collection('players')
      .where('isActive', '==', true)
      .get();
    
    console.log(`Computing prop tables for ${playersSnapshot.size} players...`);
    
    // Process in batches
    const batchSize = 5;
    const players = playersSnapshot.docs;
    
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(async (playerDoc) => {
          return computePlayerPropTables(playerDoc.id, db);
        })
      );
      
      results.forEach(({ success, failed }) => {
        totalSuccess += success;
        totalFailed += failed;
      });
      
      // Small delay between batches
      if (i + batchSize < players.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    
    console.log(`Prop tables computation complete: ${totalSuccess} success, ${totalFailed} failed`);
  } catch (error) {
    console.error('Error in computePropTablesForAll:', error);
  }
  
  return { success: totalSuccess, failed: totalFailed };
}

/**
 * Get prop table from Firestore
 */
export async function getPlayerPropTable(
  playerId: string,
  statType: StatType,
  db: admin.firestore.Firestore
): Promise<PlayerPropTable | null> {
  try {
    const docId = `${playerId}_${statType}`;
    const doc = await db.collection('playerPropTables').doc(docId).get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data() as PlayerPropTable;
  } catch (error) {
    console.error(`Error fetching prop table for ${playerId} ${statType}:`, error);
    return null;
  }
}
