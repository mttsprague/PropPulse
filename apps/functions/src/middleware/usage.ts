import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { PLAN_LIMITS } from '@proppulse/shared';

type LimitType = 'propCard' | 'savedProp' | 'export';

export function checkUsageLimits(limitType: LimitType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const uid = user.uid;
      const plan = user.plan || 'free';

      const limits = PLAN_LIMITS[plan as 'free' | 'pro'];

      // Check relevant limit
      let limitField: string;
      let limitValue: number;

      switch (limitType) {
        case 'propCard':
          limitField = 'propCardsGeneratedCount';
          limitValue = limits.propCardsPerDay;
          break;
        case 'savedProp':
          limitField = 'savedPropsCount';
          limitValue = limits.savedPropsMax;
          break;
        case 'export':
          limitField = 'exportsCount';
          limitValue = limits.exportsPerDay;
          break;
        default:
          next();
          return;
      }

      // Skip check for pro users with unlimited access
      if (limitValue === Infinity) {
        next();
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const usageDoc = await admin
        .firestore()
        .collection('usage')
        .doc(uid)
        .collection('daily')
        .doc(today)
        .get();

      const currentUsage = usageDoc.exists ? usageDoc.data()![limitField] || 0 : 0;

      if (limitType === 'savedProp') {
        // For saved props, check total count across all saved props
        const savedPropsSnapshot = await admin
          .firestore()
          .collection('users')
          .doc(uid)
          .collection('savedProps')
          .get();

        if (savedPropsSnapshot.size >= limitValue) {
          res.status(429).json({
            error: 'Saved props limit reached',
            limit: limitValue,
            current: savedPropsSnapshot.size,
            upgradeRequired: true,
          });
          return;
        }
      } else {
        // For daily limits
        if (currentUsage >= limitValue) {
          res.status(429).json({
            error: `Daily ${limitType} limit reached`,
            limit: limitValue,
            current: currentUsage,
            upgradeRequired: true,
          });
          return;
        }
      }

      next();
    } catch (error) {
      console.error('Usage check error:', error);
      res.status(500).json({ error: 'Failed to check usage limits' });
    }
  };
}
