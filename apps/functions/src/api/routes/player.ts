import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { Player } from '@proppulse/shared';

const db = admin.firestore();

export const playerRouter = Router();

// Search players by name
playerRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const query = q.toLowerCase();
    const playersSnapshot = await db.collection('players').get();

    const results = playersSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Player))
      .filter(player => player.name.toLowerCase().includes(query))
      .slice(0, Number(limit));

    res.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Error searching players:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get player by ID
playerRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const playerDoc = await db.collection('players').doc(id).get();

    if (!playerDoc.exists) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const player = { id: playerDoc.id, ...playerDoc.data() } as Player;

    // Fetch recent stats
    const statsSnapshot = await db
      .collection('playerGameStats')
      .where('playerId', '==', id)
      .orderBy('date', 'desc')
      .limit(10)
      .get();

    const recentStats = statsSnapshot.docs.map(doc => doc.data());

    res.json({
      success: true,
      data: {
        player,
        recentStats,
      },
    });
  } catch (error: any) {
    console.error('Error fetching player:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
