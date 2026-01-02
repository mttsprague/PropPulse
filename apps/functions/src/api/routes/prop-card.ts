import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import {
  PropCardRequest,
  PropCardResponse,
  PropCardData,
  PlayerGameStat,
  Player,
  InjuryPlayer,
  StatType,
  OverUnder,
} from '@proppulse/shared';
import {
  PropCardRequestSchema,
  calculateHitRates,
  calculateRecentTrend,
  calculateProAnalytics,
  generateInsights,
} from '@proppulse/shared';
import { authMiddleware } from '../middleware/auth';
import { checkUsageLimits } from '../middleware/usage';

const db = admin.firestore();

export const propCardRouter = Router();

propCardRouter.post(
  '/',
  authMiddleware,
  checkUsageLimits('propCard'),
  async (req: Request, res: Response) => {
    try {
      // Validate request
      const validatedData = PropCardRequestSchema.parse(req.body);
      const { playerId, playerName, statType, line, overUnder, includePro } = validatedData;
      const uid = (req as any).user.uid;
      const userPlan = (req as any).user.plan;

      // Find player
      let player: Player | null = null;

      if (playerId) {
        const playerDoc = await db.collection('players').doc(playerId).get();
        if (playerDoc.exists) {
          player = { id: playerDoc.id, ...playerDoc.data() } as Player;
        }
      } else if (playerName) {
        const playersSnapshot = await db
          .collection('players')
          .where('name', '==', playerName)
          .limit(1)
          .get();
        
        if (!playersSnapshot.empty) {
          const doc = playersSnapshot.docs[0];
          player = { id: doc.id, ...doc.data() } as Player;
        }
      }

      if (!player) {
        res.status(404).json({ success: false, error: 'Player not found' });
        return;
      }

      // Fetch player game stats
      const statsSnapshot = await db
        .collection('playerGameStats')
        .where('playerId', '==', player.id)
        .orderBy('date', 'desc')
        .limit(100) // Fetch up to 100 games for season data
        .get();

      const games: PlayerGameStat[] = statsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as PlayerGameStat[];

      if (games.length === 0) {
        res.status(404).json({ success: false, error: 'No game data found for player' });
        return;
      }

      // Fetch team names for display
      const teamIds = new Set(games.map(g => g.opponentTeamId));
      const teamDocs = await Promise.all(
        Array.from(teamIds).map(id => db.collection('teams').doc(id).get())
      );
      const teamMap = new Map(
        teamDocs
          .filter(doc => doc.exists)
          .map(doc => [doc.id, doc.data()!.abbreviation || doc.data()!.name])
      );

      // Calculate hit rates
      const hitRates = calculateHitRates(games, statType, line, overUnder);

      // Calculate recent trend
      const recentTrend = calculateRecentTrend(games, statType, line, overUnder, teamMap);

      // Fetch injury context
      const latestInjurySnapshot = await db
        .collection('injurySnapshots')
        .orderBy('snapshotDateTime', 'desc')
        .limit(1)
        .get();

      const injuredTeammates: InjuryPlayer[] = [];
      if (!latestInjurySnapshot.empty) {
        const snapshot = latestInjurySnapshot.docs[0].data();
        const teamInjuries = snapshot.players.filter(
          (p: InjuryPlayer) => p.teamId === player!.teamId && p.playerId !== player!.id
        );
        injuredTeammates.push(...teamInjuries);
      }

      // Check back-to-back status
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const recentGamesSnapshot = await db
        .collection('games')
        .where('date', 'in', [yesterday, today, tomorrow])
        .get();

      const teamGames = recentGamesSnapshot.docs
        .map(doc => doc.data())
        .filter(
          game =>
            game.homeTeamId === player!.teamId || game.awayTeamId === player!.teamId
        );

      const isBackToBack = teamGames.filter(g => g.date === yesterday || g.date === today).length > 1;
      const nextGameIsBackToBack = teamGames.filter(g => g.date === today || g.date === tomorrow).length > 1;

      const context = {
        isBackToBack,
        nextGameIsBackToBack,
        injuredTeammates,
        lastGameDate: games[0]?.date,
        nextGameDate: teamGames.find(g => g.date === today || g.date === tomorrow)?.date,
      };

      // Pro analytics (if user is pro or includePro requested)
      let proAnalytics = undefined;
      if (userPlan === 'pro' || includePro) {
        proAnalytics = calculateProAnalytics(games, statType, line, overUnder);
      }

      // Generate insights
      const insights = generateInsights({
        games,
        statType,
        line,
        overUnder,
        minutesTrend: recentTrend.minutesTrend,
        volatility: proAnalytics?.volatility || {
          stdDev: 0,
          coefficientOfVariation: 0,
          rating: 'low',
        },
        trendSlope: proAnalytics?.trendSlope || {
          slope: 0,
          direction: 'stable',
          strength: 'weak',
        },
        minutesStability: proAnalytics?.minutesStability || {
          stdDev: 0,
          rating: 'stable',
        },
        lineSensitivity: proAnalytics?.lineSensitivity || {
          withinOneLast20: 0,
          withinOnePercent: 0,
          pushRateLast20: 0,
          rating: 'low',
        },
        injuredTeammates,
        isBackToBack,
      });

      const propCardData: PropCardData = {
        player,
        statType,
        line,
        overUnder,
        hitRates,
        recentTrend,
        context,
        insights,
        proAnalytics,
        generatedAt: new Date().toISOString(),
      };

      // Track usage
      await incrementUsage(uid, 'propCardsGeneratedCount');

      res.json({
        success: true,
        data: propCardData,
      } as PropCardResponse);
    } catch (error: any) {
      console.error('Error generating prop card:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to generate prop card',
      });
    }
  }
);

async function incrementUsage(uid: string, field: string) {
  const today = new Date().toISOString().split('T')[0];
  const usageRef = db.collection('usage').doc(uid).collection('daily').doc(today);
  
  await usageRef.set(
    {
      date: today,
      [field]: admin.firestore.FieldValue.increment(1),
    },
    { merge: true }
  );
}
