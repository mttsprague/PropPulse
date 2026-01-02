import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { WatchlistItem } from '@proppulse/shared';
import { WatchlistItemSchema } from '@proppulse/shared';
import { authMiddleware } from '../middleware/auth';

const db = admin.firestore();

export const watchlistRouter = Router();

// Get all watchlist items
watchlistRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;

    const snapshot = await db
      .collection('users')
      .doc(uid)
      .collection('watchlist')
      .orderBy('createdAt', 'desc')
      .get();

    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as WatchlistItem[];

    res.json({ success: true, data: items });
  } catch (error: any) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add to watchlist
watchlistRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;
    const validatedData = WatchlistItemSchema.parse(req.body);

    const item: Omit<WatchlistItem, 'id'> = {
      ...validatedData,
      createdAt: new Date().toISOString(),
    };

    const docRef = await db
      .collection('users')
      .doc(uid)
      .collection('watchlist')
      .add(item);

    res.json({
      success: true,
      data: { id: docRef.id, ...item },
    });
  } catch (error: any) {
    console.error('Error adding to watchlist:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Remove from watchlist
watchlistRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    await db
      .collection('users')
      .doc(uid)
      .collection('watchlist')
      .doc(id)
      .delete();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
