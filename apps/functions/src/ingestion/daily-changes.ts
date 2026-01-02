import * as admin from 'firebase-admin';
import { DailyChange, InjuryPlayer, PlayerGameStat } from '@proppulse/shared';
import { detectDailyChanges } from '@proppulse/shared';

const db = admin.firestore();

/**
 * Compute daily changes for "What Changed Today?" feed
 * 
 * Compares:
 * 1. Current vs previous injury snapshots
 * 2. Recent minutes trends vs historical
 * 3. Back-to-back game schedules
 */
export async function computeDailyChanges(date: string): Promise<void> {
  console.log(`Computing daily changes for ${date}...`);

  try {
    // Fetch latest two injury snapshots
    const injurySnapshots = await db
      .collection('injurySnapshots')
      .orderBy('snapshotDateTime', 'desc')
      .limit(2)
      .get();

    const currentInjuries: InjuryPlayer[] = 
      injurySnapshots.docs[0]?.data().players || [];
    const previousInjuries: InjuryPlayer[] = 
      injurySnapshots.docs[1]?.data().players || [];

    // Compute minutes trends (simplified)
    const currentMinutes = await computeRecentMinutes(date);
    const yesterday = new Date(new Date(date).getTime() - 86400000).toISOString().split('T')[0];
    const previousMinutes = await computeRecentMinutes(yesterday);

    // Fetch back-to-back teams
    const backToBackTeams = await findBackToBackTeams(date);

    // Detect changes
    const changes = detectDailyChanges({
      currentInjuries,
      previousInjuries,
      currentMinutes,
      previousMinutes,
      backToBackTeams,
    });

    // Store daily changes
    await db
      .collection('dailyChanges')
      .doc(date)
      .set({
        date,
        changes,
        updatedAt: new Date().toISOString(),
      });

    console.log(`Computed ${changes.length} changes for ${date}`);
  } catch (error) {
    console.error('Error computing daily changes:', error);
    throw error;
  }
}

async function computeRecentMinutes(upToDate: string): Promise<Map<string, number>> {
  const minutesMap = new Map<string, number>();

  // Fetch all player aggregates (or compute on the fly)
  const aggregatesSnapshot = await db.collection('playerAggregates').get();

  aggregatesSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const playerId = doc.id;
    const last10Avg = data.last10Averages?.minutes || 0;
    minutesMap.set(playerId, last10Avg);
  });

  return minutesMap;
}

async function findBackToBackTeams(date: string): Promise<string[]> {
  const yesterday = new Date(new Date(date).getTime() - 86400000).toISOString().split('T')[0];

  const [todayGames, yesterdayGames] = await Promise.all([
    db.collection('games').where('date', '==', date).get(),
    db.collection('games').where('date', '==', yesterday).get(),
  ]);

  const teamsPlayingToday = new Set<string>();
  todayGames.docs.forEach(doc => {
    const game = doc.data();
    teamsPlayingToday.add(game.homeTeamId);
    teamsPlayingToday.add(game.awayTeamId);
  });

  const teamsPlayingYesterday = new Set<string>();
  yesterdayGames.docs.forEach(doc => {
    const game = doc.data();
    teamsPlayingYesterday.add(game.homeTeamId);
    teamsPlayingYesterday.add(game.awayTeamId);
  });

  // Teams playing both days are on back-to-back
  const backToBackTeams: string[] = [];
  teamsPlayingToday.forEach(teamId => {
    if (teamsPlayingYesterday.has(teamId)) {
      backToBackTeams.push(teamId);
    }
  });

  return backToBackTeams;
}
