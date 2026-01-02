/**
 * Export API Cloud Functions
 * 
 * Provides REST endpoints for prop card export functionality
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  ExportRequest,
  ExportResponse,
  ExportError,
  ExportErrorCode,
} from '@proppulse/shared/export/types';
import {
  checkExportQuota,
  incrementExportCount,
  getUserPlan,
} from '@proppulse/shared/export/quota';
import {
  getCachedExport,
  setCachedExport,
  storeExportMetadata,
  getExportMetadata,
  generateSignedUrl,
  cleanupExpiredExports,
  getUserExportHistory,
} from '@proppulse/shared/export/cache';
import {
  generateExportHash,
  generateVerificationId,
  generateStoragePath,
  generateCacheStoragePath,
  generateExportId,
} from '@proppulse/shared/export/hash';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();
const auth = admin.auth();

/**
 * Middleware to verify Firebase Auth token
 */
async function verifyAuth(req: functions.https.Request): Promise<admin.auth.DecodedIdToken> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ExportError('Unauthorized', ExportErrorCode.AUTH_REQUIRED);
  }

  const token = authHeader.split('Bearer ')[1];
  
  try {
    return await auth.verifyIdToken(token);
  } catch (error) {
    throw new ExportError('Invalid token', ExportErrorCode.AUTH_REQUIRED);
  }
}

/**
 * POST /api/export/check-cache
 * 
 * Check if an export already exists in cache
 */
export const checkCache = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await verifyAuth(req);

    const { hash } = req.body;

    if (!hash || typeof hash !== 'string') {
      res.status(400).json({ error: 'Invalid hash' });
      return;
    }

    // Check cache
    const cached = await getCachedExport(hash, db);

    if (!cached) {
      res.status(404).json({ error: 'Not found in cache' });
      return;
    }

    // Generate fresh signed URL
    const signedUrl = await generateSignedUrl(cached.storagePath, storage);
    const expiresAt = Date.now() + 3600 * 1000; // 1 hour

    const response: Partial<ExportResponse> = {
      storagePath: cached.storagePath,
      signedUrl,
      expiresAt,
      cached: true,
      verificationId: generateVerificationId(hash),
    };

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ExportError) {
      res.status(error.statusCode || 500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * GET /api/export/check-quota
 * 
 * Check user's export quota status
 */
export const checkQuota = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const decodedToken = await verifyAuth(req);
    const uid = decodedToken.uid;

    const quotaCheck = await checkExportQuota(uid, db);

    if (!quotaCheck.allowed) {
      res.status(429).json({
        error: quotaCheck.message || 'Quota exceeded',
        quota: quotaCheck,
      });
      return;
    }

    res.status(200).json({ quota: quotaCheck });
  } catch (error) {
    if (error instanceof ExportError) {
      res.status(error.statusCode || 500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * POST /api/export/upload-url
 * 
 * Generate a signed upload URL for Firebase Storage
 */
export const getUploadUrl = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const decodedToken = await verifyAuth(req);
    const uid = decodedToken.uid;

    const { hash, contentType, sizeBytes } = req.body;

    if (!hash || contentType !== 'image/png') {
      res.status(400).json({ error: 'Invalid parameters' });
      return;
    }

    // Generate storage path
    const storagePath = generateStoragePath(uid, hash);

    // Generate signed upload URL (1 hour expiry)
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 3600 * 1000, // 1 hour
      contentType: 'image/png',
    });

    res.status(200).json({
      uploadUrl,
      storagePath,
    });
  } catch (error) {
    if (error instanceof ExportError) {
      res.status(error.statusCode || 500).json({ error: error.message });
    } else {
      console.error('Upload URL error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * POST /api/export/register
 * 
 * Register a completed export with metadata
 */
export const registerExport = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const decodedToken = await verifyAuth(req);
    const uid = decodedToken.uid;

    const { hash, storagePath, propCard, viewMode, theme, sizeBytes } = req.body;

    // Validate parameters
    if (!hash || !storagePath || !propCard || !viewMode || !theme) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    // Increment export count (atomic transaction)
    await incrementExportCount(uid, db);

    // Store in cache
    await setCachedExport(hash, storagePath, sizeBytes || 0, propCard, db);

    // Generate export ID
    const exportId = generateExportId(uid);

    // Generate signed URL for download
    const signedUrl = await generateSignedUrl(storagePath, storage);
    const signedUrlExpiresAt = Date.now() + 3600 * 1000; // 1 hour

    // Store export metadata
    await storeExportMetadata(
      {
        exportId,
        uid,
        propCardHash: hash,
        viewMode,
        theme,
        storagePath,
        signedUrl,
        signedUrlExpiresAt,
        sizeBytes: sizeBytes || 0,
        cached: false,
        verificationId: generateVerificationId(hash),
        createdAt: Date.now(),
        expiresAt: Date.now() + 6 * 3600 * 1000, // 6 hours
      },
      db
    );

    const response: ExportResponse = {
      exportId,
      storagePath,
      signedUrl,
      expiresAt: signedUrlExpiresAt,
      cached: false,
      verificationId: generateVerificationId(hash),
    };

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ExportError) {
      res.status(error.statusCode || 500).json({ error: error.message });
    } else {
      console.error('Register export error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * GET /api/export/:exportId
 * 
 * Retrieve export metadata by ID
 */
export const getExport = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const decodedToken = await verifyAuth(req);
    const uid = decodedToken.uid;

    // Extract exportId from path
    const exportId = req.path.split('/').pop();

    if (!exportId) {
      res.status(400).json({ error: 'Missing exportId' });
      return;
    }

    // Get metadata
    const metadata = await getExportMetadata(uid, exportId, db);

    if (!metadata) {
      res.status(404).json({ error: 'Export not found' });
      return;
    }

    // Check if signed URL expired
    if (metadata.signedUrlExpiresAt < Date.now()) {
      // Generate new signed URL
      const signedUrl = await generateSignedUrl(metadata.storagePath, storage);
      const signedUrlExpiresAt = Date.now() + 3600 * 1000;

      // Update metadata
      await db
        .collection('users')
        .doc(uid)
        .collection('exports')
        .doc(exportId)
        .update({
          signedUrl,
          signedUrlExpiresAt,
        });

      metadata.signedUrl = signedUrl;
      metadata.signedUrlExpiresAt = signedUrlExpiresAt;
    }

    const response: ExportResponse = {
      exportId: metadata.exportId,
      storagePath: metadata.storagePath,
      signedUrl: metadata.signedUrl,
      expiresAt: metadata.signedUrlExpiresAt,
      cached: metadata.cached,
      verificationId: metadata.verificationId,
    };

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ExportError) {
      res.status(error.statusCode || 500).json({ error: error.message });
    } else {
      console.error('Get export error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * GET /api/export/history
 * 
 * Get user's export history
 */
export const getHistory = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const decodedToken = await verifyAuth(req);
    const uid = decodedToken.uid;

    const limit = parseInt(req.query.limit as string) || 50;

    const history = await getUserExportHistory(uid, db, limit);

    res.status(200).json({ exports: history });
  } catch (error) {
    if (error instanceof ExportError) {
      res.status(error.statusCode || 500).json({ error: error.message });
    } else {
      console.error('Get history error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * POST /api/export/cleanup
 * 
 * Scheduled cleanup job for expired exports (runs daily)
 */
export const cleanupJob = functions.pubsub
  .schedule('0 2 * * *') // 2 AM daily
  .timeZone('America/Chicago')
  .onRun(async (context) => {
    try {
      // Clean up exports older than 30 days
      const olderThanMs = 30 * 24 * 3600 * 1000;
      
      const deletedCount = await cleanupExpiredExports(db, storage, olderThanMs);

      console.log(`Cleanup job completed: ${deletedCount} exports deleted`);
    } catch (error) {
      console.error('Cleanup job error:', error);
    }
  });

/**
 * Manual cleanup endpoint (admin only)
 */
export const manualCleanup = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const decodedToken = await verifyAuth(req);

    // Check if user is admin (implement your own admin check)
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();

    if (!userData?.isAdmin) {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    const olderThanMs = parseInt(req.body.olderThanMs) || 30 * 24 * 3600 * 1000;
    
    const deletedCount = await cleanupExpiredExports(db, storage, olderThanMs);

    res.status(200).json({
      message: 'Cleanup completed',
      deletedCount,
    });
  } catch (error) {
    if (error instanceof ExportError) {
      res.status(error.statusCode || 500).json({ error: error.message });
    } else {
      console.error('Manual cleanup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
