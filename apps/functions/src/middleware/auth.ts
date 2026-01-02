import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Fetch user data
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    (req as any).user = {
      uid: decodedToken.uid,
      ...userDoc.data(),
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}
