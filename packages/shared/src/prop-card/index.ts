/**
 * Prop Card Engine - Main Entry Point
 * 
 * Complete prop research card generation system.
 * Integrates parsing, computation, insights, and caching.
 */

export * from './types';
export * from './parser';
export * from './computations';
export * from './insights';
export * from './cache';

import {
  PropQuery,
  PropCard,
  ParsedPropQuery,
  PlayerGameLog,
  Player,
  Team,
  Game,
  InjurySnapshot,
} from './types';
import { parsePropQueryFromText, resolvePlayerId } from './parser';
import { generatePropCard } from './computations';
import { generateInsights } from './insights';
import { getCachedPropCard, setCachedPropCard } from './cache';

/**
 * Firestore collections interface
 */
export interface FirestoreCollections {
  players: any; // FirebaseFirestore.CollectionReference
  teams: any;
  games: any;
  playerGameStats: any;
  injurySnapshots: any;
  computedPropCards: any; // Cache collection
}

/**
 * Generate prop card from query (main entry point)
 * 
 * This function:
 * 1. Checks cache first
 * 2. Fetches required data from Firestore
 * 3. Computes prop card
 * 4. Generates insights
 * 5. Caches result
 * 
 * @param query Prop query
 * @param collections Firestore collection references
 * @param skipCache Skip cache lookup/storage
 * @returns Complete prop card
 */
export async function generatePropCardFromQuery(
  query: PropQuery,
  collections: FirestoreCollections,
  skipCache = false
): Promise<PropCard> {
  // Check cache first
  if (!skipCache) {
    const cached = await getCachedPropCard(query, collections.computedPropCards);
    if (cached) {
      return cached;
    }
  }

  // Fetch player data
  const playerDoc = await collections.players.doc(query.playerId).get();
  if (!playerDoc.exists) {
    throw new Error(`Player not found: ${query.playerId}`);
  }
  const player = { id: playerDoc.id, ...playerDoc.data() } as Player;

  // Fetch team data
  const teamDoc = await collections.teams.doc(player.teamId).get();
  if (!teamDoc.exists) {
    throw new Error(`Team not found: ${player.teamId}`);
  }
  const team = { id: teamDoc.id, ...teamDoc.data() } as Team;

  // Fetch opponent team (if game is scheduled)
  let opponent: Team | null = null;
  const gameDate = query.gameDate || new Date().toISOString().split('T')[0];
  const gameSnapshot = await collections.games
    .where('date', '==', gameDate)
    .where('homeTeamId', 'in', [player.teamId])
    .limit(1)
    .get();

  if (!gameSnapshot.empty) {
    const gameData = gameSnapshot.docs[0].data() as Game;
    const opponentId =
      gameData.homeTeamId === player.teamId
        ? gameData.awayTeamId
        : gameData.homeTeamId;

    const opponentDoc = await collections.teams.doc(opponentId).get();
    if (opponentDoc.exists) {
      opponent = { id: opponentDoc.id, ...opponentDoc.data() } as Team;
    }
  }

  // Fetch player game logs for current season
  const currentSeason = getCurrentSeason();
  const gameLogsSnapshot = await collections.playerGameStats
    .where('playerId', '==', query.playerId)
    .orderBy('date', 'desc')
    .limit(100) // Get up to 100 games
    .get();

  const gameLogs: PlayerGameLog[] = [];
  gameLogsSnapshot.forEach((doc: any) => {
    gameLogs.push({ id: doc.id, ...doc.data() } as PlayerGameLog);
  });

  // Fetch all games for schedule context
  const gamesSnapshot = await collections.games
    .where('date', '>=', `${currentSeason}-10-01`)
    .where('date', '<=', `${currentSeason + 1}-06-30`)
    .orderBy('date', 'desc')
    .limit(500)
    .get();

  const games: Game[] = [];
  gamesSnapshot.forEach((doc: any) => {
    games.push({ id: doc.id, ...doc.data() } as Game);
  });

  // Fetch most recent injury snapshot
  const injurySnapshot = await getMostRecentInjurySnapshot(collections.injurySnapshots);

  // Generate prop card
  const card = await generatePropCard(
    query,
    gameLogs,
    player,
    team,
    opponent,
    games,
    injurySnapshot
  );

  // Generate insights
  card.summary.quickInsights = generateInsights(card);

  // Cache result
  if (!skipCache) {
    await setCachedPropCard(query, card, collections.computedPropCards);
  }

  return card;
}

/**
 * Generate prop card from natural language text
 * 
 * @param text Natural language query (e.g., "LeBron over 27.5 points")
 * @param collections Firestore collection references
 * @param skipCache Skip cache lookup/storage
 * @returns Complete prop card
 */
export async function generatePropCardFromText(
  text: string,
  collections: FirestoreCollections,
  skipCache = false
): Promise<PropCard> {
  // Parse text
  const parsed = parsePropQueryFromText(text);

  // Resolve player ID
  const playerId = await resolvePlayerId(parsed.playerName, collections.players);
  if (!playerId) {
    throw new Error(`Could not resolve player: ${parsed.playerName}`);
  }

  // Create prop query
  const query: PropQuery = {
    playerId,
    statType: parsed.statType,
    line: parsed.line,
    side: parsed.side,
    gameDate: parsed.gameDate,
  };

  // Generate card
  return generatePropCardFromQuery(query, collections, skipCache);
}

/**
 * Get current NBA season (year of season start)
 * 
 * NBA season starts in October, so:
 * - Jan-Sep: current year - 1
 * - Oct-Dec: current year
 */
function getCurrentSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  return month >= 10 ? year : year - 1;
}

/**
 * Get most recent injury snapshot
 */
async function getMostRecentInjurySnapshot(
  injurySnapshotsCollection: any
): Promise<InjurySnapshot | null> {
  try {
    const snapshot = await injurySnapshotsCollection
      .orderBy('snapshotDateTime', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as InjurySnapshot;
  } catch (error) {
    console.error('Error fetching injury snapshot:', error);
    return null;
  }
}

/**
 * Batch generate prop cards for multiple queries
 * 
 * @param queries Array of prop queries
 * @param collections Firestore collection references
 * @param skipCache Skip cache lookup/storage
 * @returns Array of prop cards
 */
export async function batchGeneratePropCards(
  queries: PropQuery[],
  collections: FirestoreCollections,
  skipCache = false
): Promise<PropCard[]> {
  const results = await Promise.allSettled(
    queries.map((query) =>
      generatePropCardFromQuery(query, collections, skipCache)
    )
  );

  return results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => (result as PromiseFulfilledResult<PropCard>).value);
}
