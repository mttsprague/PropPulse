import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { PropCardData } from '@proppulse/shared';
import { ExportPropCardRequestSchema, EXPORT_CONFIG } from '@proppulse/shared';
import { authMiddleware } from '../middleware/auth';
import { checkUsageLimits } from '../middleware/usage';
import { generatePropCardImage } from '../utils/image-generator';

const db = admin.firestore();
const storage = admin.storage();

export const exportRouter = Router();

exportRouter.post(
  '/prop-card',
  authMiddleware,
  checkUsageLimits('export'),
  async (req: Request, res: Response) => {
    try {
      const uid = (req as any).user.uid;
      const validatedData = ExportPropCardRequestSchema.parse(req.body);

      let propCardData: PropCardData;

      // Get prop card data either from savedPropId or directly from request
      if (validatedData.savedPropId) {
        const savedPropDoc = await db
          .collection('users')
          .doc(uid)
          .collection('savedProps')
          .doc(validatedData.savedPropId)
          .get();

        if (!savedPropDoc.exists) {
          res.status(404).json({ error: 'Saved prop not found' });
          return;
        }

        const savedProp = savedPropDoc.data()!;
        
        // Check if we have cached card data
        if (savedProp.cachedCardData) {
          propCardData = savedProp.cachedCardData;
        } else {
          res.status(400).json({
            error: 'Prop card data not cached. Please regenerate the prop card first.',
          });
          return;
        }
      } else if (validatedData.propCardData) {
        propCardData = validatedData.propCardData;
      } else {
        res.status(400).json({ error: 'Either savedPropId or propCardData is required' });
        return;
      }

      // Generate image
      const imageBuffer = await generatePropCardImage(propCardData);

      // Upload to Cloud Storage
      const bucket = storage.bucket();
      const fileName = `exports/${uid}/${Date.now()}_${propCardData.player.name.replace(/\s/g, '_')}.png`;
      const file = bucket.file(fileName);

      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/png',
        },
      });

      // Generate signed URL (valid for 7 days)
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

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
            exportsCount: admin.firestore.FieldValue.increment(1),
          },
          { merge: true }
        );

      res.json({
        success: true,
        url: signedUrl,
      });
    } catch (error: any) {
      console.error('Error exporting prop card:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);
