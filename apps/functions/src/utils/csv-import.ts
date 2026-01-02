/**
 * CSV Import Utility
 * 
 * Fallback system for manual data upload when scrapers fail
 */

import { getFirestore } from 'firebase-admin/firestore';
import { parse } from 'csv-parse/sync';

const db = getFirestore();

interface PlayerGameLogCSV {
  playerId: string;
  date: string;
  teamId: string;
  opponentTeamId: string;
  homeAway: 'home' | 'away';
  minutes: string;
  pts: string;
  reb: string;
  ast: string;
  stl?: string;
  blk?: string;
  tov?: string;
  fg?: string;
  fga?: string;
  fg3?: string;
  fg3a?: string;
  ft?: string;
  fta?: string;
}

interface InjuryCSV {
  playerId: string;
  status: string;
  injuryType: string;
  expectedReturn?: string;
}

interface TeamRosterCSV {
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  position: string;
  jerseyNumber?: string;
}

/**
 * Parse and validate player game logs CSV
 */
export function parsePlayerGameLogsCSV(csvContent: string): any[] {
  try {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as PlayerGameLogCSV[];

    const gameLogs = records.map((record) => {
      // Generate game ID
      const gameId = `${record.date}_${record.homeAway === 'away' ? record.teamId : record.opponentTeamId}_${record.homeAway === 'away' ? record.opponentTeamId : record.teamId}`;

      return {
        id: `${record.playerId}_${gameId}`,
        playerId: record.playerId,
        gameId,
        date: record.date,
        teamId: record.teamId,
        opponentTeamId: record.opponentTeamId,
        homeAway: record.homeAway,
        minutes: parseFloat(record.minutes) || 0,
        pts: parseInt(record.pts, 10) || 0,
        reb: parseInt(record.reb, 10) || 0,
        ast: parseInt(record.ast, 10) || 0,
        stl: parseInt(record.stl || '0', 10),
        blk: parseInt(record.blk || '0', 10),
        tov: parseInt(record.tov || '0', 10),
        fg: parseInt(record.fg || '0', 10),
        fga: parseInt(record.fga || '0', 10),
        fg3: parseInt(record.fg3 || '0', 10),
        fg3a: parseInt(record.fg3a || '0', 10),
        ft: parseInt(record.ft || '0', 10),
        fta: parseInt(record.fta || '0', 10),
        pf: 0,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      };
    });

    return gameLogs;
  } catch (error: any) {
    throw new Error(`CSV parsing error: ${error.message}`);
  }
}

/**
 * Parse and validate injury CSV
 */
export function parseInjuryCSV(csvContent: string): any[] {
  try {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as InjuryCSV[];

    const injuries = records.map((record) => ({
      playerId: record.playerId,
      status: record.status.toUpperCase(),
      injuryType: record.injuryType,
      expectedReturn: record.expectedReturn || undefined,
    }));

    return injuries;
  } catch (error: any) {
    throw new Error(`CSV parsing error: ${error.message}`);
  }
}

/**
 * Parse and validate team roster CSV
 */
export function parseTeamRosterCSV(csvContent: string): { teams: any[]; players: any[] } {
  try {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as TeamRosterCSV[];

    const teamsMap = new Map<string, any>();
    const players: any[] = [];

    records.forEach((record) => {
      // Add team if not already added
      if (!teamsMap.has(record.teamId)) {
        teamsMap.set(record.teamId, {
          id: record.teamId,
          name: record.teamName,
          abbreviation: record.teamId,
          updatedAt: Date.now(),
        });
      }

      // Add player
      players.push({
        id: record.playerId,
        name: record.playerName,
        teamId: record.teamId,
        position: record.position,
        jerseyNumber: record.jerseyNumber || undefined,
        updatedAt: Date.now(),
      });
    });

    return {
      teams: Array.from(teamsMap.values()),
      players,
    };
  } catch (error: any) {
    throw new Error(`CSV parsing error: ${error.message}`);
  }
}

/**
 * Import player game logs from CSV
 */
export async function importPlayerGameLogsCSV(
  csvContent: string,
  runId?: string
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;

  try {
    const gameLogs = parsePlayerGameLogsCSV(csvContent);

    console.log(`Importing ${gameLogs.length} game logs from CSV...`);

    // Batch write
    let batch = db.batch();
    let opsInBatch = 0;

    for (const log of gameLogs) {
      try {
        const docRef = db.collection('playerGameStats').doc(log.id);
        const doc = await docRef.get();

        batch.set(docRef, log, { merge: true });

        if (doc.exists) {
          updated++;
        } else {
          inserted++;
        }

        opsInBatch++;

        if (opsInBatch >= 500) {
          await batch.commit();
          batch = db.batch();
          opsInBatch = 0;
        }
      } catch (error: any) {
        errors.push(`Error importing log ${log.id}: ${error.message}`);
      }
    }

    // Commit remaining
    if (opsInBatch > 0) {
      await batch.commit();
    }

    // Log to ingestion run if provided
    if (runId) {
      await db.collection('ingestionRuns').doc(runId).set({
        runId,
        startedAt: Date.now(),
        endedAt: Date.now(),
        status: 'completed',
        jobs: {
          csvImport: {
            status: 'completed',
            stats: { inserted, updated },
            errors,
            startedAt: Date.now(),
            endedAt: Date.now(),
          },
        },
        summary: `CSV import: ${inserted} inserted, ${updated} updated`,
      });
    }

    console.log(`CSV import completed: ${inserted} inserted, ${updated} updated`);
    return { inserted, updated, errors };
  } catch (error: any) {
    errors.push(`CSV import failed: ${error.message}`);
    throw error;
  }
}

/**
 * Import injury snapshot from CSV
 */
export async function importInjuryCSV(
  csvContent: string
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    const injuries = parseInjuryCSV(csvContent);

    console.log(`Importing ${injuries.length} injuries from CSV...`);

    // Create snapshot
    const snapshotId = Date.now().toString();
    const snapshot = {
      id: snapshotId,
      snapshotDateTime: Date.now(),
      players: injuries,
      updatedAt: Date.now(),
    };

    await db.collection('injurySnapshots').doc(snapshotId).set(snapshot);

    console.log(`Injury CSV import completed: ${injuries.length} injuries`);
    return { count: injuries.length, errors };
  } catch (error: any) {
    errors.push(`Injury CSV import failed: ${error.message}`);
    throw error;
  }
}

/**
 * Import team rosters from CSV
 */
export async function importTeamRosterCSV(
  csvContent: string
): Promise<{ teamsCount: number; playersCount: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    const { teams, players } = parseTeamRosterCSV(csvContent);

    console.log(`Importing ${teams.length} teams and ${players.length} players from CSV...`);

    // Write teams
    let batch = db.batch();
    let opsInBatch = 0;

    for (const team of teams) {
      const docRef = db.collection('teams').doc(team.id);
      batch.set(docRef, team, { merge: true });
      opsInBatch++;

      if (opsInBatch >= 500) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }

    // Write players
    for (const player of players) {
      const docRef = db.collection('players').doc(player.id);
      batch.set(docRef, player, { merge: true });
      opsInBatch++;

      if (opsInBatch >= 500) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }

    // Commit remaining
    if (opsInBatch > 0) {
      await batch.commit();
    }

    console.log(`Roster CSV import completed: ${teams.length} teams, ${players.length} players`);
    return {
      teamsCount: teams.length,
      playersCount: players.length,
      errors,
    };
  } catch (error: any) {
    errors.push(`Roster CSV import failed: ${error.message}`);
    throw error;
  }
}

/**
 * Generate sample CSV templates
 */
export const CSV_TEMPLATES = {
  playerGameLogs: `playerId,date,teamId,opponentTeamId,homeAway,minutes,pts,reb,ast,stl,blk,tov,fg,fga,fg3,fg3a,ft,fta
jamesle01,2025-01-01,LAL,GSW,home,35,28,8,7,1,1,3,11,20,2,6,4,5
curryst01,2025-01-01,GSW,LAL,away,33,30,5,6,2,0,2,10,18,6,12,4,4
duranke01,2025-01-01,PHO,LAC,home,36,27,7,5,1,2,2,10,22,3,8,4,4`,

  injuries: `playerId,status,injuryType,expectedReturn
jamesle01,OUT,ankle,2025-01-10
curryst01,QUESTIONABLE,shoulder,
duranke01,PROBABLE,rest,`,

  teamRoster: `teamId,teamName,playerId,playerName,position,jerseyNumber
LAL,Los Angeles Lakers,jamesle01,LeBron James,F,23
LAL,Los Angeles Lakers,davisan02,Anthony Davis,F-C,3
GSW,Golden State Warriors,curryst01,Stephen Curry,G,30
GSW,Golden State Warriors,thompkl01,Klay Thompson,G,11`,
};
