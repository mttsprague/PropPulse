import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { SavedProp, SavedPropRequest } from '@proppulse/shared';
import { SavedPropRequestSchema, UpdateSavedPropSchema } from '@proppulse/shared';
import { authMiddleware } from '../middleware/auth';
import { checkUsageLimits } from '../middleware/usage';

const db = admin.firestore();

export const savedPropsRouter = Router();

// Get all saved props for user
savedPropsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;
    const { tag, statType, sortBy = 'createdAt' } = req.query;

    let query = db.collection('users').doc(uid).collection('savedProps');

    if (tag) {
      query = query.where('tags', 'array-contains', tag) as any;
    }

    if (statType) {
      query = query.where('statType', '==', statType) as any;
    }

    const snapshot = await query.orderBy(sortBy as string, 'desc').get();

    const savedProps = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as SavedProp[];

    res.json({ success: true, data: savedProps });
  } catch (error: any) {
    console.error('Error fetching saved props:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create saved prop
savedPropsRouter.post(
  '/',
  authMiddleware,
  checkUsageLimits('savedProp'),
  async (req: Request, res: Response) => {
    try {
      const uid = (req as any).user.uid;
      const validatedData = SavedPropRequestSchema.parse(req.body);

      const savedProp: Omit<SavedProp, 'id'> = {
        ...validatedData,
        tags: validatedData.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await db
        .collection('users')
        .doc(uid)
        .collection('savedProps')
        .add(savedProp);

      // Track usage
      const today = new Date().toISOString().split('T')[0];
      await db
        .collection('usage')
        .doc(uid)
        .collection('daily')
        .doc(today)
        .set(
          {
            date: today,
            savedPropsCount: admin.firestore.FieldValue.increment(1),
          },
          { merge: true }
        );

      res.json({
        success: true,
        data: { id: docRef.id, ...savedProp },
      });
    } catch (error: any) {
      console.error('Error creating saved prop:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }
);

// Get saved prop by ID
savedPropsRouter.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    const doc = await db
      .collection('users')
      .doc(uid)
      .collection('savedProps')
      .doc(id)
      .get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Saved prop not found' });
      return;
    }

    res.json({
      success: true,
      data: { id: doc.id, ...doc.data() },
    });
  } catch (error: any) {
    console.error('Error fetching saved prop:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update saved prop
savedPropsRouter.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;
    const { id } = req.params;
    const validatedData = UpdateSavedPropSchema.parse(req.body);

    const updateData = {
      ...validatedData,
      updatedAt: new Date().toISOString(),
    };

    await db
      .collection('users')
      .doc(uid)
      .collection('savedProps')
      .doc(id)
      .update(updateData);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating saved prop:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Delete saved prop
savedPropsRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    await db
      .collection('users')
      .doc(uid)
      .collection('savedProps')
      .doc(id)
      .delete();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting saved prop:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
