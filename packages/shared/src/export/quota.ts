/**
 * Export Quota Manager
 * 
 * Enforces usage limits based on user plan
 */

import {
  QuotaCheckResult,
  UserPlan,
  DailyUsage,
  ExportError,
  ExportErrorCode,
} from './types';

/**
 * Default quota limits
 */
const QUOTA_LIMITS = {
  FREE: 1, // 1 export per day
  PRO: -1, // Unlimited
};

/**
 * Check if user has remaining export quota
 * 
 * @param uid User ID
 * @param db Firestore database reference
 * @returns Quota check result
 */
export async function checkExportQuota(
  uid: string,
  db: any // FirebaseFirestore.Firestore
): Promise<QuotaCheckResult> {
  try {
    // Get user plan
    const planDoc = await db.collection('userPlans').doc(uid).get();
    
    const plan: UserPlan = planDoc.exists
      ? (planDoc.data() as UserPlan)
      : {
          uid,
          plan: 'FREE',
          exportQuota: QUOTA_LIMITS.FREE,
          updatedAt: Date.now(),
        };

    // Pro plan has unlimited exports
    if (plan.plan === 'PRO' || plan.exportQuota === -1) {
      return {
        allowed: true,
        remaining: -1,
        resetAt: getNextResetTime(),
        plan: 'PRO',
      };
    }

    // Check daily usage
    const today = new Date().toISOString().split('T')[0];
    const usageRef = db
      .collection('usage')
      .doc(uid)
      .collection('daily')
      .doc(today);

    const usageDoc = await usageRef.get();
    const usage: DailyUsage = usageDoc.exists
      ? (usageDoc.data() as DailyUsage)
      : {
          uid,
          date: today,
          exports: 0,
          lastExportAt: 0,
          resetAt: getNextResetTime(),
        };

    const remaining = Math.max(0, plan.exportQuota - usage.exports);

    if (remaining <= 0) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: usage.resetAt,
        plan: plan.plan,
        message: `Daily export limit reached (${plan.exportQuota}/day). Upgrade to Pro for unlimited exports.`,
      };
    }

    return {
      allowed: true,
      remaining,
      resetAt: usage.resetAt,
      plan: plan.plan,
    };
  } catch (error) {
    console.error('Error checking export quota:', error);
    throw new ExportError(
      ExportErrorCode.UNAUTHORIZED,
      'Failed to check export quota',
      500
    );
  }
}

/**
 * Increment export count for user
 * 
 * Uses Firestore transaction for atomic increment
 * 
 * @param uid User ID
 * @param db Firestore database reference
 */
export async function incrementExportCount(
  uid: string,
  db: any // FirebaseFirestore.Firestore
): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const usageRef = db
      .collection('usage')
      .doc(uid)
      .collection('daily')
      .doc(today);

    await db.runTransaction(async (transaction: any) => {
      const usageDoc = await transaction.get(usageRef);

      if (!usageDoc.exists) {
        // Create new usage document
        transaction.set(usageRef, {
          uid,
          date: today,
          exports: 1,
          lastExportAt: Date.now(),
          resetAt: getNextResetTime(),
        });
      } else {
        // Increment existing count
        transaction.update(usageRef, {
          exports: (usageDoc.data().exports || 0) + 1,
          lastExportAt: Date.now(),
        });
      }
    });
  } catch (error) {
    console.error('Error incrementing export count:', error);
    throw new ExportError(
      ExportErrorCode.UNAUTHORIZED,
      'Failed to update export count',
      500
    );
  }
}

/**
 * Get next quota reset time (midnight UTC)
 * 
 * @returns Unix timestamp
 */
function getNextResetTime(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

/**
 * Get user plan
 * 
 * @param uid User ID
 * @param db Firestore database reference
 * @returns User plan
 */
export async function getUserPlan(
  uid: string,
  db: any
): Promise<UserPlan> {
  const planDoc = await db.collection('userPlans').doc(uid).get();

  if (!planDoc.exists) {
    // Return default free plan
    return {
      uid,
      plan: 'FREE',
      exportQuota: QUOTA_LIMITS.FREE,
      updatedAt: Date.now(),
    };
  }

  return planDoc.data() as UserPlan;
}

/**
 * Update user plan
 * 
 * @param uid User ID
 * @param plan Plan type
 * @param db Firestore database reference
 */
export async function updateUserPlan(
  uid: string,
  plan: 'FREE' | 'PRO',
  db: any
): Promise<void> {
  const quota = plan === 'PRO' ? -1 : QUOTA_LIMITS.FREE;

  await db
    .collection('userPlans')
    .doc(uid)
    .set(
      {
        uid,
        plan,
        exportQuota: quota,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
}
