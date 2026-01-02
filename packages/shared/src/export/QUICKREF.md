# Export System Quick Reference

Quick commands and snippets for using the Prop Card Export system.

## Installation

```bash
# Web dependencies
npm install html-to-image

# Mobile dependencies
npx expo install react-native-view-shot expo-sharing expo-file-system expo-media-library

# Server dependencies (optional)
npm install canvas playwright
```

## Basic Usage

### Web Export

```tsx
import { ShareCard } from '@/components/ShareCard';
import { useExport } from '@proppulse/shared/export/client-web';

const { exportCard, isExporting } = useExport({
  authToken: await user.getIdToken(),
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL,
});

const result = await exportCard(elementRef.current, propCard);
```

### Mobile Export

```tsx
import { ShareCard } from '@/components/ShareCard';
import { useExport, shareExportMobile } from '@proppulse/shared/export/client-mobile';

const { exportCard } = useExport({
  authToken: await user.getIdToken(),
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL,
});

const result = await exportCard(viewRef, propCard);
await shareExportMobile(result.signedUrl, propCard);
```

## Cloud Functions Deployment

```bash
# Deploy all export functions
firebase deploy --only functions:checkCache,functions:checkQuota,functions:getUploadUrl,functions:registerExport,functions:getExport,functions:getHistory,functions:cleanupJob

# Or individual function
firebase deploy --only functions:registerExport
```

## Cloud Run Deployment

```bash
# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT_ID/prop-export-render
gcloud run deploy prop-export-render \
  --image gcr.io/PROJECT_ID/prop-export-render \
  --platform managed \
  --region us-central1 \
  --memory 2Gi
```

## Security Rules Deployment

```bash
firebase deploy --only firestore:rules,storage:rules
```

## Quota Management

```typescript
// Check quota
const quota = await checkExportQuota(uid, db);
console.log(`Remaining: ${quota.remaining}, Plan: ${quota.plan}`);

// Upgrade user
await updateUserPlan(uid, 'PRO', db);

// Downgrade user
await updateUserPlan(uid, 'FREE', db);
```

## Cache Operations

```typescript
// Check cache
const cached = await getCachedExport(hash, db);

// Store in cache
await setCachedExport(hash, storagePath, sizeBytes, propCard, db);

// Cleanup old exports
const deleted = await cleanupExpiredExports(db, storage, 30 * 24 * 3600 * 1000);
```

## Hash Generation

```typescript
import { generateExportHash, generateVerificationId } from '@proppulse/shared/export/hash';

const hash = generateExportHash(propCard, 'CASUAL', 'LIGHT');
// "a1b2c3d4e5f6789012345678901234567890abcd"

const verificationId = generateVerificationId(hash);
// "ABCD-1234"
```

## Storage Paths

```typescript
import { generateStoragePath, generateCacheStoragePath } from '@proppulse/shared/export/hash';

// User-specific path
const userPath = generateStoragePath(uid, hash);
// "exports/user123/2024-01-15/a1b2c3d4.png"

// Shared cache path
const cachePath = generateCacheStoragePath(hash);
// "exports/cache/a1b2c3d4.png"
```

## API Testing

```bash
# Check cache
curl -X POST https://REGION-PROJECT.cloudfunctions.net/checkCache \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hash":"a1b2c3d4..."}'

# Check quota
curl -X GET https://REGION-PROJECT.cloudfunctions.net/checkQuota \
  -H "Authorization: Bearer TOKEN"

# Get export
curl -X GET https://REGION-PROJECT.cloudfunctions.net/getExport/EXPORT_ID \
  -H "Authorization: Bearer TOKEN"

# Manual cleanup
curl -X POST https://REGION-PROJECT.cloudfunctions.net/manualCleanup \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"olderThanMs":2592000000}'
```

## Firestore Queries

```typescript
// Get user exports
const exports = await db
  .collection('users')
  .doc(uid)
  .collection('exports')
  .orderBy('createdAt', 'desc')
  .limit(50)
  .get();

// Get expired cache entries
const expired = await db
  .collection('exportCache')
  .where('expiresAt', '<', Date.now())
  .limit(500)
  .get();

// Get daily usage
const usage = await db
  .collection('usage')
  .doc(uid)
  .collection('daily')
  .doc(new Date().toISOString().split('T')[0])
  .get();

// Get user plan
const plan = await db.collection('userPlans').doc(uid).get();
```

## Theme Configurations

```typescript
import { THEME_CONFIGS } from '@proppulse/shared/export/types';

// Light theme
const light = THEME_CONFIGS.LIGHT;
// { width: 600, height: 800, scale: 2, backgroundColor: '#ffffff', ... }

// Dark theme
const dark = THEME_CONFIGS.DARK;
// { width: 600, height: 800, scale: 2, backgroundColor: '#1f2937', ... }
```

## Error Handling

```typescript
import { ExportError, ExportErrorCode } from '@proppulse/shared/export/types';

try {
  await exportCard(element, propCard);
} catch (error) {
  if (error instanceof ExportError) {
    switch (error.code) {
      case ExportErrorCode.QUOTA_EXCEEDED:
        console.log('Upgrade to Pro for unlimited exports');
        break;
      case ExportErrorCode.RENDER_FAILED:
        console.log('Try again or use server-side rendering');
        break;
      case ExportErrorCode.AUTH_REQUIRED:
        console.log('Please sign in');
        break;
    }
  }
}
```

## Monitoring Commands

```bash
# View function logs
firebase functions:log --only registerExport --lines 100

# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50

# Check storage usage
gsutil du -s gs://PROJECT_ID.appspot.com/exports

# List recent exports
gsutil ls -l gs://PROJECT_ID.appspot.com/exports/** | head -20

# Count cache entries
# (Run in Firestore Console or via Firebase Admin SDK)
```

## Common Patterns

### Export with Progress

```tsx
const [progress, setProgress] = useState('');

await exportPropCardWeb(
  element,
  propCard,
  {
    theme: 'LIGHT',
    onProgress: setProgress,
  },
  firebaseConfig
);
```

### Retry on Failure

```typescript
async function exportWithRetry(element, propCard, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await exportCard(element, propCard);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### Download Export

```typescript
import { downloadExport } from '@proppulse/shared/export/client-web';

const result = await exportCard(element, propCard);
downloadExport(
  result.signedUrl,
  `${propCard.meta.playerName}-${propCard.meta.statType}.png`
);
```

### Share Export

```typescript
// Web
import { shareExport } from '@proppulse/shared/export/client-web';
await shareExport(result.signedUrl, propCard);

// Mobile
import { shareExportMobile } from '@proppulse/shared/export/client-mobile';
await shareExportMobile(result.signedUrl, propCard);
```

### Save to Photo Library (Mobile)

```typescript
import { saveExportToLibrary } from '@proppulse/shared/export/client-mobile';
await saveExportToLibrary(result.signedUrl);
```

## Constants

```typescript
// Quota limits
QUOTA_LIMITS.FREE = 1  // 1 export per day
QUOTA_LIMITS.PRO = -1  // Unlimited

// Cache TTL
CACHE_TTL_MS = 21600000  // 6 hours

// Dimensions
THEME_CONFIGS.LIGHT.width = 600
THEME_CONFIGS.LIGHT.height = 800
THEME_CONFIGS.LIGHT.scale = 2  // 1200x1600 actual pixels
```

## Environment Variables

```bash
# Web (.env.local)
NEXT_PUBLIC_API_URL=https://REGION-PROJECT.cloudfunctions.net
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...

# Mobile (.env)
EXPO_PUBLIC_API_URL=https://REGION-PROJECT.cloudfunctions.net
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...

# Functions (functions/.env)
FIREBASE_PROJECT_ID=...
RENDER_SERVICE_URL=https://prop-export-render-...run.app
```

## Testing Endpoints Locally

```bash
# Start Functions emulator
firebase emulators:start --only functions,firestore,storage

# Test endpoints
curl http://localhost:5001/PROJECT_ID/us-central1/checkQuota \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)"
```

## Performance Tips

1. **Use cache**: Check cache before rendering
2. **Optimize images**: Use WebP for intermediate storage
3. **Batch exports**: Queue multiple exports client-side
4. **Monitor quota**: Show remaining exports to users
5. **Lazy load**: Only render ShareCard when needed
6. **Preload fonts**: Load fonts before capturing

## Support

- **Documentation**: `/packages/shared/src/export/README.md`
- **API Reference**: See type definitions in `types.ts`
- **Examples**: Check `examples/` directory
- **Issues**: GitHub Issues or Firebase Console logs
