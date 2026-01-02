/**
 * Computation Jobs
 * 
 * Compute derived data: daily changes, player aggregates
 */

import { getFirestore } from 'firebase-admin/firestore';
import { compareInjurySnapshots, InjurySnapshot } from '../scrapers/injuries';

const db = getFirestore();

interface DailyChange {
  category: 'injury' | 'minutes_spike' | 'back_to_back';
  playerId?: string;
  playerName: string;
  teamId?: string;
  summary: string;
  details: any;
  severity: 'high' | 'medium' | 'low';
}

interface PlayerAggregates {
  playerId: string;
  seasonAvg: {
    games: number;
    minutes: number;
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
    fg_pct: number;
    fg3_pct: number;
    ft_pct: number;
  };
  last10Avg: {
    games: number;
    minutes: number;
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
  };
  last20Avg: {
    games: number;
    minutes: number;
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
  };
  updatedAt: number;
}

/**
 * Compute Daily Changes
 */
export async function computeDailyChanges(
  date: string = new Date().toISOString().split('T')[0]
): Promise<void> {
  console.log(`Computing daily changes for ${date}...`);

  const changes: DailyChange[] = [];

  // 1. Injury Changes
  const injuryChanges = await detectInjuryChanges();
  changes.push(...injuryChanges);

  // 2. Minutes Spikes
  const minutesSpikes = await detectMinutesSpikes(date);
  changes.push(...minutesSpikes);

  // 3. Back-to-Backs
  const backToBacks = await detectBackToBackGames(date);
  changes.push(...backToBacks);

  // Write to Firestore
  await db.collection('dailyChanges').doc(date).set({
    date,
    changes,
    updatedAt: Date.now(),
  });

  console.log(`Daily changes computed: ${changes.length} changes`);
}

/**
 * Detect injury changes from snapshots
 */
async function detectInjuryChanges(): Promise<DailyChange[]> {
  const changes: DailyChange[] = [];

  try {
    // Get last 2 injury snapshots
    const snapshotsSnapshot = await db
      .collection('injurySnapshots')
      .orderBy('snapshotDateTime', 'desc')
      .limit(2)
      .get();

    if (snapshotsSnapshot.docs.length < 2) {
      console.log('Not enough injury snapshots for comparison');
      return changes;
    }

    const [currentDoc, previousDoc] = snapshotsSnapshot.docs;
    const current: InjurySnapshot = currentDoc.data() as InjurySnapshot;
    const previous: InjurySnapshot = previousDoc.data() as InjurySnapshot;

    const injuryChanges = compareInjurySnapshots(previous, current);

    injuryChanges.forEach((change) => {
      let summary = '';
      
      if (change.changeType === 'new_injury') {
        summary = `${change.playerName} is now ${change.newStatus}`;
      } else if (change.changeType === 'status_change') {
        summary = `${change.playerName} status changed from ${change.oldStatus} to ${change.newStatus}`;
      } else if (change.changeType === 'recovered') {
        summary = `${change.playerName} is no longer on injury report`;
      }

      changes.push({
        category: 'injury',
        playerId: change.playerId,
        playerName: change.playerName,
        summary,
        details: change,
        severity: change.severity,
      });
    });

    console.log(`Detected ${changes.length} injury changes`);
  } catch (error: any) {
    console.error('Error detecting injury changes:', error.message);
  }

  return changes;
}

/**
 * Detect minutes spikes (player minutes ±8+ from last 10 game avg)
 */
async function detectMinutesSpikes(date: string): Promise<DailyChange[]> {
  const changes: DailyChange[] = [];

  try {
    // Get games from date
    const gamesSnapshot = await db
      .collection('games')
      .where('date', '==', date)
      .where('status', '==', 'final')
      .get();

    for (const gameDoc of gamesSnapshot.docs) {
      const game = gameDoc.data();

      // Get player game stats for this game
      const statsSnapshot = await db
        .collection('playerGameStats')
        .where('gameId', '==', game.id)
        .get();

      for (const statDoc of statsSnapshot.docs) {
        const stat = statDoc.data();

        // Get player aggregates
        const aggDoc = await db
          .collection('playerAggregates')
          .doc(stat.playerId)
          .get();

        if (!aggDoc.exists) {
          continue;
        }

        const agg = aggDoc.data() as PlayerAggregates;
        const last10Avg = agg.last10Avg.minutes;
        const currentMinutes = stat.minutes;

        const diff = currentMinutes - last10Avg;

        if (Math.abs(diff) >= 8) {
          // Get player name
          const playerDoc = await db.collection('players').doc(stat.playerId).get();
          const playerName = playerDoc.exists ? playerDoc.data()?.name : stat.playerId;

          const direction = diff > 0 ? 'increase' : 'decrease';
          const summary = `${playerName} played ${currentMinutes.toFixed(1)} minutes (${direction} of ${Math.abs(diff).toFixed(1)} from 10-game avg)`;

          changes.push({
            category: 'minutes_spike',
            playerId: stat.playerId,
            playerName,
            teamId: stat.teamId,
            summary,
            details: {
              currentMinutes,
              last10Avg,
              difference: diff,
            },
            severity: Math.abs(diff) >= 12 ? 'high' : 'medium',
          });
        }
      }
    }

    console.log(`Detected ${changes.length} minutes spikes`);
  } catch (error: any) {
    console.error('Error detecting minutes spikes:', error.message);
  }

  return changes;
}

/**
 * Detect back-to-back games
 */
async function detectBackToBackGames(date: string): Promise<DailyChange[]> {
  const changes: DailyChange[] = [];

  try {
    // Parse date
    const currentDate = new Date(date);
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    // Get games for current date
    const todayGamesSnapshot = await db
      .collection('games')
      .where('date', '==', date)
      .get();

    // Get games for next date
    const tomorrowGamesSnapshot = await db
      .collection('games')
      .where('date', '==', nextDateStr)
      .get();

    const todayTeams = new Set<string>();
    todayGamesSnapshot.docs.forEach((doc) => {
      const game = doc.data();
      todayTeams.add(game.homeTeamId);
      todayTeams.add(game.awayTeamId);
    });

    const tomorrowTeams = new Set<string>();
    tomorrowGamesSnapshot.docs.forEach((doc) => {
      const game = doc.data();
      tomorrowTeams.add(game.homeTeamId);
      tomorrowTeams.add(game.awayTeamId);
    });

    // Find teams playing both days
    const backToBackTeams = Array.from(todayTeams).filter((team) =>
      tomorrowTeams.has(team)
    );

    for (const teamId of backToBackTeams) {
      // Get team name
      const teamDoc = await db.collection('teams').doc(teamId).get();
      const teamName = teamDoc.exists ? teamDoc.data()?.name : teamId;

      changes.push({
        category: 'back_to_back',
        teamId,
        playerName: teamName,
        summary: `${teamName} playing back-to-back games (${date} and ${nextDateStr})`,
        details: {
          date1: date,
          date2: nextDateStr,
        },
        severity: 'medium',
      });
    }

    console.log(`Detected ${changes.length} back-to-back situations`);
  } catch (error: any) {
    console.error('Error detecting back-to-backs:', error.message);
  }

  return changes;
}

/**
 * Compute Player Aggregates
 */
export async function computePlayerAggregates(
  playerId?: string
): Promise<void> {
  console.log('Computing player aggregates...');

  // Get player IDs
  let playerIds: string[] = [];
  
  if (playerId) {
    playerIds = [playerId];
  } else {
    const playersSnapshot = await db.collection('players').get();
    playerIds = playersSnapshot.docs.map((doc) => doc.id);
  }

  console.log(`Computing aggregates for ${playerIds.length} players...`);

  for (const pid of playerIds) {
    try {
      await computePlayerAggregate(pid);
    } catch (error: any) {
      console.error(`Error computing aggregate for ${pid}:`, error.message);
    }
  }

  console.log('Player aggregates computation completed');
}

/**
 * Compute aggregates for a single player
 */
async function computePlayerAggregate(playerId: string): Promise<void> {
  // Get all game logs for player, ordered by date desc
  const logsSnapshot = await db
    .collection('playerGameStats')
    .where('playerId', '==', playerId)
    .orderBy('date', 'desc')
    .get();

  const logs = logsSnapshot.docs.map((doc) => doc.data());

  if (logs.length === 0) {
    console.log(`No game logs found for ${playerId}`);
    return;
  }

  // Compute season average (all games)
  const seasonAvg = computeAverage(logs);

  // Compute last 10 average
  const last10Logs = logs.slice(0, Math.min(10, logs.length));
  const last10Avg = computeAverage(last10Logs);

  // Compute last 20 average
  const last20Logs = logs.slice(0, Math.min(20, logs.length));
  const last20Avg = computeAverage(last20Logs);

  const aggregates: PlayerAggregates = {
    playerId,
    seasonAvg,
    last10Avg,
    last20Avg,
    updatedAt: Date.now(),
  };

  // Write to Firestore
  await db.collection('playerAggregates').doc(playerId).set(aggregates);
}

/**
 * Compute average stats from game logs
 */
function computeAverage(logs: any[]): any {
  if (logs.length === 0) {
    return {
      games: 0,
      minutes: 0,
      pts: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      fg_pct: 0,
      fg3_pct: 0,
      ft_pct: 0,
    };
  }

  const sum = logs.reduce(
    (acc, log) => ({
      minutes: acc.minutes + (log.minutes || 0),
      pts: acc.pts + (log.pts || 0),
      reb: acc.reb + (log.reb || 0),
      ast: acc.ast + (log.ast || 0),
      stl: acc.stl + (log.stl || 0),
      blk: acc.blk + (log.blk || 0),
      tov: acc.tov + (log.tov || 0),
      fg: acc.fg + (log.fg || 0),
      fga: acc.fga + (log.fga || 0),
      fg3: acc.fg3 + (log.fg3 || 0),
      fg3a: acc.fg3a + (log.fg3a || 0),
      ft: acc.ft + (log.ft || 0),
      fta: acc.fta + (log.fta || 0),
    }),
    {
      minutes: 0,
      pts: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      fg: 0,
      fga: 0,
      fg3: 0,
      fg3a: 0,
      ft: 0,
      fta: 0,
    }
  );

  const count = logs.length;

  return {
    games: count,
    minutes: sum.minutes / count,
    pts: sum.pts / count,
    reb: sum.reb / count,
    ast: sum.ast / count,
    stl: sum.stl / count,
    blk: sum.blk / count,
    tov: sum.tov / count,
    fg_pct: sum.fga > 0 ? (sum.fg / sum.fga) * 100 : 0,
    fg3_pct: sum.fg3a > 0 ? (sum.fg3 / sum.fg3a) * 100 : 0,
    ft_pct: sum.fta > 0 ? (sum.ft / sum.fta) * 100 : 0,
  };
}
