import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { DailyChange } from '@proppulse/shared';
import { DailyFeedRequestSchema } from '@proppulse/shared';
import { authMiddleware } from '../middleware/auth';

const db = admin.firestore();

export const dailyFeedRouter = Router();

dailyFeedRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;
    const validatedData = DailyFeedRequestSchema.parse(req.query);
    const date = validatedData.date || new Date().toISOString().split('T')[0];
    const watchlistOnly = validatedData.watchlistOnly || false;

    // Fetch daily changes
    const dailyChangesDoc = await db.collection('dailyChanges').doc(date).get();

    if (!dailyChangesDoc.exists) {
      res.json({
        success: true,
        data: {
          date,
          changes: [],
        },
      });
      return;
    }

    let changes: DailyChange[] = dailyChangesDoc.data()!.changes || [];

    // Filter by watchlist if requested
    if (watchlistOnly) {
      const watchlistSnapshot = await db
        .collection('users')
        .doc(uid)
        .collection('watchlist')
        .get();

      const watchedPlayerIds = new Set(
        watchlistSnapshot.docs
          .filter(doc => doc.data().type === 'player')
          .map(doc => doc.data().refId)
      );

      const watchedTeamIds = new Set(
        watchlistSnapshot.docs
          .filter(doc => doc.data().type === 'team')
          .map(doc => doc.data().refId)
      );

      changes = changes.filter(
        change =>
          (change.playerId && watchedPlayerIds.has(change.playerId)) ||
          (change.teamId && watchedTeamIds.has(change.teamId))
      );
    }

    res.json({
      success: true,
      data: {
        date,
        changes,
      },
    });
  } catch (error: any) {
    console.error('Error fetching daily feed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
