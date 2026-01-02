/**
 * Ingestion Jobs
 * 
 * Orchestrates scrapers and writes data to Firestore
 */

import { getFirestore, WriteBatch } from 'firebase-admin/firestore';
import {
  scrapeAllTeamsAndPlayers,
  validateTeamsAndPlayers,
  TeamData,
  PlayerData,
} from '../scrapers/teams-players';
import {
  scrapeSeasonSchedule,
  validateSchedule,
  GameData,
} from '../scrapers/schedule';
import {
  scrapePlayerGameLogs,
  validateGameLogs,
  PlayerGameLogData,
} from '../scrapers/game-logs';
import {
  scrapeInjuryReport,
  createInjurySnapshot,
  compareInjurySnapshots,
  validateInjuries,
  InjurySnapshot,
} from '../scrapers/injuries';

const db = getFirestore();

interface IngestionResult {
  success: boolean;
  stats: {
    inserted?: number;
    updated?: number;
    deleted?: number;
    errors?: number;
  };
  errors: string[];
  duration: number;
}

interface IngestionRunData {
  runId: string;
  startedAt: number;
  endedAt?: number;
  status: 'running' | 'completed' | 'failed';
  jobs: Record<string, {
    status: 'pending' | 'running' | 'completed' | 'failed';
    stats: any;
    errors: string[];
    startedAt?: number;
    endedAt?: number;
  }>;
  summary?: string;
}

/**
 * Create ingestion run record
 */
async function createIngestionRun(runId: string): Promise<void> {
  const runData: IngestionRunData = {
    runId,
    startedAt: Date.now(),
    status: 'running',
    jobs: {},
  };

  await db.collection('ingestionRuns').doc(runId).set(runData);
}

/**
 * Update job status in ingestion run
 */
async function updateJobStatus(
  runId: string,
  jobName: string,
  status: 'pending' | 'running' | 'completed' | 'failed',
  stats?: any,
  errors?: string[]
): Promise<void> {
  const updateData: any = {
    [`jobs.${jobName}.status`]: status,
  };

  if (status === 'running') {
    updateData[`jobs.${jobName}.startedAt`] = Date.now();
  }

  if (status === 'completed' || status === 'failed') {
    updateData[`jobs.${jobName}.endedAt`] = Date.now();
    if (stats) {
      updateData[`jobs.${jobName}.stats`] = stats;
    }
    if (errors) {
      updateData[`jobs.${jobName}.errors`] = errors;
    }
  }

  await db.collection('ingestionRuns').doc(runId).update(updateData);
}

/**
 * Complete ingestion run
 */
async function completeIngestionRun(
  runId: string,
  status: 'completed' | 'failed',
  summary: string
): Promise<void> {
  await db.collection('ingestionRuns').doc(runId).update({
    endedAt: Date.now(),
    status,
    summary,
  });
}

/**
 * Batch write helper with Firestore limits (500 ops per batch)
 */
async function batchWrite<T>(
  collection: string,
  items: T[],
  getDocId: (item: T) => string,
  transform: (item: T) => any
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  let batch: WriteBatch = db.batch();
  let opsInBatch = 0;

  for (const item of items) {
    const docId = getDocId(item);
    const docRef = db.collection(collection).doc(docId);
    
    // Check if exists
    const doc = await docRef.get();
    const isNew = !doc.exists;

    const data = transform(item);
    batch.set(docRef, data, { merge: true });
    
    if (isNew) {
      inserted++;
    } else {
      updated++;
    }

    opsInBatch++;

    // Commit batch if we reach limit
    if (opsInBatch >= 500) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  // Commit remaining operations
  if (opsInBatch > 0) {
    await batch.commit();
  }

  return { inserted, updated };
}

/**
 * Ingest Teams and Players
 */
export async function ingestTeamsAndPlayers(
  runId?: string,
  season: number = 2025
): Promise<IngestionResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  if (runId) {
    await updateJobStatus(runId, 'teamsAndPlayers', 'running');
  }

  try {
    console.log('Starting teams and players ingestion...');

    // Scrape data
    const { teams, players } = await scrapeAllTeamsAndPlayers(season);

    // Validate
    const validation = validateTeamsAndPlayers(teams, players);
    if (!validation.valid) {
      errors.push(...validation.errors);
      console.warn('Validation warnings:', validation.errors);
    }

    // Write teams
    console.log(`Writing ${teams.length} teams to Firestore...`);
    const teamsResult = await batchWrite(
      'teams',
      teams,
      (team) => team.id,
      (team) => team
    );

    // Write players
    console.log(`Writing ${players.length} players to Firestore...`);
    const playersResult = await batchWrite(
      'players',
      players,
      (player) => player.id,
      (player) => player
    );

    const duration = Date.now() - startTime;
    const stats = {
      teamsInserted: teamsResult.inserted,
      teamsUpdated: teamsResult.updated,
      playersInserted: playersResult.inserted,
      playersUpdated: playersResult.updated,
    };

    console.log('Teams and players ingestion completed:', stats);

    if (runId) {
      await updateJobStatus(runId, 'teamsAndPlayers', 'completed', stats, errors);
    }

    return {
      success: true,
      stats,
      errors,
      duration,
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    errors.push(errorMessage);
    console.error('Teams and players ingestion failed:', error);

    if (runId) {
      await updateJobStatus(runId, 'teamsAndPlayers', 'failed', {}, errors);
    }

    return {
      success: false,
      stats: { errors: 1 },
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Ingest Schedule
 */
export async function ingestSchedule(
  runId?: string,
  season: number = 2025
): Promise<IngestionResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  if (runId) {
    await updateJobStatus(runId, 'schedule', 'running');
  }

  try {
    console.log(`Starting schedule ingestion for ${season} season...`);

    // Scrape schedule
    const games = await scrapeSeasonSchedule(season);

    // Validate
    const validation = validateSchedule(games);
    if (!validation.valid) {
      errors.push(...validation.errors);
      console.warn('Validation warnings:', validation.errors);
    }

    // Write games
    console.log(`Writing ${games.length} games to Firestore...`);
    const gamesResult = await batchWrite(
      'games',
      games,
      (game) => game.id,
      (game) => game
    );

    const duration = Date.now() - startTime;
    const stats = {
      gamesInserted: gamesResult.inserted,
      gamesUpdated: gamesResult.updated,
    };

    console.log('Schedule ingestion completed:', stats);

    if (runId) {
      await updateJobStatus(runId, 'schedule', 'completed', stats, errors);
    }

    return {
      success: true,
      stats,
      errors,
      duration,
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    errors.push(errorMessage);
    console.error('Schedule ingestion failed:', error);

    if (runId) {
      await updateJobStatus(runId, 'schedule', 'failed', {}, errors);
    }

    return {
      success: false,
      stats: { errors: 1 },
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Ingest Player Game Logs
 */
export async function ingestPlayerGameLogs(
  runId?: string,
  playerIds?: string[],
  season: number = 2025
): Promise<IngestionResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  if (runId) {
    await updateJobStatus(runId, 'playerGameLogs', 'running');
  }

  try {
    console.log('Starting player game logs ingestion...');

    // Get player IDs if not provided
    if (!playerIds || playerIds.length === 0) {
      console.log('Fetching all player IDs from Firestore...');
      const playersSnapshot = await db.collection('players').get();
      playerIds = playersSnapshot.docs.map((doc) => doc.id);
      console.log(`Found ${playerIds.length} players`);
    }

    // Scrape game logs
    const gameLogs = await scrapePlayerGameLogs(playerIds, season);

    // Validate
    const validation = validateGameLogs(gameLogs);
    if (!validation.valid) {
      errors.push(...validation.errors);
      console.warn('Validation warnings:', validation.errors);
    }

    // Write game logs
    console.log(`Writing ${gameLogs.length} game logs to Firestore...`);
    const logsResult = await batchWrite(
      'playerGameStats',
      gameLogs,
      (log) => log.id,
      (log) => log
    );

    const duration = Date.now() - startTime;
    const stats = {
      logsInserted: logsResult.inserted,
      logsUpdated: logsResult.updated,
      playersProcessed: playerIds.length,
    };

    console.log('Player game logs ingestion completed:', stats);

    if (runId) {
      await updateJobStatus(runId, 'playerGameLogs', 'completed', stats, errors);
    }

    return {
      success: true,
      stats,
      errors,
      duration,
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    errors.push(errorMessage);
    console.error('Player game logs ingestion failed:', error);

    if (runId) {
      await updateJobStatus(runId, 'playerGameLogs', 'failed', {}, errors);
    }

    return {
      success: false,
      stats: { errors: 1 },
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Ingest Injury Snapshot
 */
export async function ingestInjurySnapshot(
  runId?: string
): Promise<IngestionResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  if (runId) {
    await updateJobStatus(runId, 'injurySnapshot', 'running');
  }

  try {
    console.log('Starting injury snapshot ingestion...');

    // Scrape injuries
    const injuries = await scrapeInjuryReport();

    // Validate
    const validation = validateInjuries(injuries);
    if (!validation.valid) {
      errors.push(...validation.errors);
      console.warn('Validation warnings:', validation.errors);
    }

    // Resolve player IDs from names
    console.log('Resolving player IDs from names...');
    const playersSnapshot = await db.collection('players').get();
    const playerNameMap = new Map(
      playersSnapshot.docs.map((doc) => {
        const data = doc.data();
        return [data.name.toLowerCase(), doc.id];
      })
    );

    injuries.forEach((injury) => {
      const playerId = playerNameMap.get(injury.playerName.toLowerCase());
      if (playerId) {
        injury.playerId = playerId;
      }
    });

    // Create snapshot
    const snapshot = createInjurySnapshot(injuries);

    // Write snapshot
    await db.collection('injurySnapshots').doc(snapshot.id).set(snapshot);

    const duration = Date.now() - startTime;
    const stats = {
      injuriesRecorded: injuries.length,
      playersResolved: injuries.filter((i) => i.playerId).length,
    };

    console.log('Injury snapshot ingestion completed:', stats);

    if (runId) {
      await updateJobStatus(runId, 'injurySnapshot', 'completed', stats, errors);
    }

    return {
      success: true,
      stats,
      errors,
      duration,
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    errors.push(errorMessage);
    console.error('Injury snapshot ingestion failed:', error);

    if (runId) {
      await updateJobStatus(runId, 'injurySnapshot', 'failed', {}, errors);
    }

    return {
      success: false,
      stats: { errors: 1 },
      errors,
      duration: Date.now() - startTime,
    };
  }
}

export { createIngestionRun, completeIngestionRun };
