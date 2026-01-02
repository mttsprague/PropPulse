# Prop Card Export System - Deployment Guide

Complete deployment guide for the PNG export/share functionality in PropPulse.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT APPLICATIONS                      │
├──────────────────────┬──────────────────────────────────────┤
│   Web (Next.js)      │   Mobile (Expo/React Native)         │
│   - html-to-image    │   - react-native-view-shot           │
│   - ShareCard.tsx    │   - ShareCard.tsx                    │
│   - client-web.ts    │   - client-mobile.ts                 │
└──────────┬───────────┴──────────────────┬───────────────────┘
           │                              │
           │        Firebase Auth         │
           │              ↓               │
           └──────────────┼───────────────┘
                          │
           ┌──────────────┴──────────────┐
           │   Cloud Functions (API)     │
           │   - check-cache             │
           │   - check-quota             │
           │   - upload-url              │
           │   - register                │
           │   - get-export              │
           │   - cleanup (scheduled)     │
           └──────┬───────────┬──────────┘
                  │           │
         ┌────────┴────┐  ┌──┴─────────┐
         │  Firestore  │  │   Storage  │
         │  - cache    │  │  - exports │
         │  - metadata │  │  - signed  │
         │  - quota    │  │    URLs    │
         └─────────────┘  └────────────┘
                  │
         ┌────────┴────────────┐
         │  Cloud Run (Optional)│
         │  - Playwright render │
         │  - Canvas fallback   │
         └─────────────────────┘
```

## Prerequisites

1. **Firebase Project**
   - Firebase Authentication enabled
   - Firestore database created
   - Cloud Storage bucket created
   - Billing enabled (required for Cloud Functions)

2. **Google Cloud Project**
   - Same project as Firebase
   - Cloud Run API enabled (for server-side rendering)
   - Artifact Registry enabled (for Docker images)

3. **Local Development Tools**
   - Node.js 20+
   - Firebase CLI: `npm install -g firebase-tools`
   - gcloud CLI (for Cloud Run): [Install Guide](https://cloud.google.com/sdk/docs/install)
   - Docker (for building render service)

## Quick Start

### 1. Install Dependencies

```bash
# Root project
npm install

# Shared package (export utilities)
cd packages/shared
npm install

# Functions
cd ../../functions
npm install

# Render service (optional)
cd ../services/render
npm install
```

### 2. Configure Firebase

```bash
# Login to Firebase
firebase login

# Set your project ID
firebase use --add
# Select your project from the list

# Create .env file
cat > .env << EOF
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_API_KEY=your-api-key
FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
EOF
```

### 3. Deploy Firestore Security Rules

```bash
# From project root
firebase deploy --only firestore:rules

# Rules file: firebase-rules/export.rules
```

### 4. Deploy Storage Security Rules

```bash
firebase deploy --only storage:rules
```

### 5. Deploy Cloud Functions

```bash
# From functions directory
cd functions

# Build TypeScript
npm run build

# Deploy all export functions
firebase deploy --only functions:checkCache,functions:checkQuota,functions:getUploadUrl,functions:registerExport,functions:getExport,functions:getHistory,functions:cleanupJob,functions:manualCleanup

# Or deploy all functions
firebase deploy --only functions
```

### 6. Deploy Render Service (Optional - Cloud Run)

```bash
# From services/render directory
cd services/render

# Set your project ID
export PROJECT_ID=your-project-id

# Build Docker image
gcloud builds submit --tag gcr.io/$PROJECT_ID/prop-export-render

# Deploy to Cloud Run
gcloud run deploy prop-export-render \
  --image gcr.io/$PROJECT_ID/prop-export-render \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60s \
  --max-instances 10 \
  --allow-unauthenticated

# Get the service URL
gcloud run services describe prop-export-render \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)'
```

## Firestore Collections Setup

The export system uses these Firestore collections:

### 1. `exportCache` (Global)

Stores cached exports shared across users.

```typescript
{
  hash: string;              // SHA-256 hash of export params
  storagePath: string;       // Storage path to PNG file
  sizeBytes: number;         // File size
  propCardMeta: {
    playerId: string;
    playerName: string;
    statType: string;
    line: number;
    side: string;
  };
  lastAccessedAt: number;    // Timestamp
  usageCount: number;        // Hit count
  createdAt: number;         // Timestamp
  expiresAt: number;         // Timestamp (6 hours)
}
```

**Index Required:**
- `expiresAt` (ascending) - for cleanup queries

### 2. `users/{uid}/exports` (User-specific)

Stores each user's export history.

```typescript
{
  exportId: string;
  uid: string;
  propCardHash: string;
  viewMode: 'CASUAL' | 'PRO';
  theme: 'LIGHT' | 'DARK';
  storagePath: string;
  signedUrl: string;
  signedUrlExpiresAt: number;
  sizeBytes: number;
  cached: boolean;
  verificationId: string;
  createdAt: number;
  expiresAt: number;
}
```

**Index Required:**
- `createdAt` (descending) - for history queries

### 3. `usage/{uid}/daily/{date}`

Tracks daily export counts per user.

```typescript
{
  uid: string;
  date: string;              // YYYY-MM-DD format
  exports: number;           // Count for the day
  lastExportAt: number;      // Timestamp
  resetAt: number;           // Midnight UTC tomorrow
}
```

### 4. `userPlans/{uid}`

Stores user subscription plans.

```typescript
{
  uid: string;
  plan: 'FREE' | 'PRO';
  exportQuota: number;       // -1 for unlimited
  updatedAt: number;
}
```

## Create Indexes

```bash
# From project root
firebase deploy --only firestore:indexes

# Or manually in Firebase Console:
# 1. Go to Firestore -> Indexes
# 2. Add composite index:
#    Collection: exportCache
#    Fields: expiresAt (Ascending)
#
# 3. Add composite index:
#    Collection: users/{uid}/exports
#    Fields: createdAt (Descending)
```

## Web Client Setup

### Install Dependencies

```bash
cd apps/web
npm install html-to-image
```

### Usage Example

```tsx
import { useRef } from 'react';
import { ShareCard } from '@/components/ShareCard';
import { useExport } from '@proppulse/shared/export/client-web';
import { useAuth } from '@/hooks/useAuth'; // Your Firebase auth hook

function ExportButton({ propCard }) {
  const shareCardRef = useRef(null);
  const { user, getIdToken } = useAuth();
  
  const { exportCard, isExporting, progress, error } = useExport({
    authToken: await getIdToken(),
    apiBaseUrl: process.env.NEXT_PUBLIC_API_URL,
  });

  const handleExport = async () => {
    if (!shareCardRef.current) return;

    const result = await exportCard(
      shareCardRef.current,
      propCard,
      { theme: 'LIGHT', viewMode: 'CASUAL' }
    );

    if (result) {
      // Download or share
      const link = document.createElement('a');
      link.href = result.signedUrl;
      link.download = `${propCard.meta.playerName}-prop.png`;
      link.click();
    }
  };

  return (
    <div>
      {/* Hidden card for export */}
      <div style={{ position: 'absolute', left: '-9999px' }}>
        <ShareCard 
          ref={shareCardRef}
          propCard={propCard}
          theme="LIGHT"
          verificationId="ABCD-1234"
        />
      </div>

      <button onClick={handleExport} disabled={isExporting}>
        {isExporting ? progress : 'Export PNG'}
      </button>

      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

## Mobile Client Setup

### Install Dependencies

```bash
cd apps/mobile
npx expo install react-native-view-shot expo-sharing expo-file-system expo-media-library
```

### Usage Example

```tsx
import { useRef } from 'react';
import { View, Button } from 'react-native';
import { ShareCard } from '@/components/ShareCard';
import { useExport, shareExportMobile } from '@proppulse/shared/export/client-mobile';
import { useAuth } from '@/hooks/useAuth';

function ExportButton({ propCard }) {
  const shareCardRef = useRef(null);
  const { user, getIdToken } = useAuth();
  
  const { exportCard, isExporting, progress, error } = useExport({
    authToken: await getIdToken(),
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL,
  });

  const handleExport = async () => {
    const result = await exportCard(
      shareCardRef,
      propCard,
      { theme: 'LIGHT', viewMode: 'CASUAL' }
    );

    if (result) {
      // Share via native dialog
      await shareExportMobile(result.signedUrl, propCard);
    }
  };

  return (
    <View>
      {/* Hidden card for export */}
      <View style={{ position: 'absolute', left: -9999 }}>
        <ShareCard 
          ref={shareCardRef}
          propCard={propCard}
          theme="LIGHT"
          verificationId="ABCD-1234"
        />
      </View>

      <Button 
        title={isExporting ? progress : 'Share PNG'}
        onPress={handleExport}
        disabled={isExporting}
      />
    </View>
  );
}
```

## API Endpoints

All endpoints require `Authorization: Bearer <firebase-id-token>` header.

### POST /api/export/check-cache

Check if export exists in cache.

**Request:**
```json
{
  "hash": "a1b2c3d4..."
}
```

**Response (200):**
```json
{
  "storagePath": "exports/cache/a1b2c3d4.png",
  "signedUrl": "https://storage.googleapis.com/...",
  "expiresAt": 1234567890,
  "cached": true,
  "verificationId": "ABCD-1234"
}
```

**Response (404):**
```json
{
  "error": "Not found in cache"
}
```

### GET /api/export/check-quota

Check user's export quota.

**Response (200):**
```json
{
  "quota": {
    "allowed": true,
    "remaining": 0,
    "resetAt": 1234567890,
    "plan": "PRO"
  }
}
```

**Response (429):**
```json
{
  "error": "Quota exceeded",
  "quota": {
    "allowed": false,
    "remaining": 0,
    "resetAt": 1234567890,
    "plan": "FREE",
    "message": "Daily export limit reached. Upgrade to Pro for unlimited exports."
  }
}
```

### POST /api/export/upload-url

Get signed URL for uploading PNG.

**Request:**
```json
{
  "hash": "a1b2c3d4...",
  "contentType": "image/png",
  "sizeBytes": 123456
}
```

**Response (200):**
```json
{
  "uploadUrl": "https://storage.googleapis.com/upload/...",
  "storagePath": "exports/user123/2024-01-15/a1b2c3d4.png"
}
```

### POST /api/export/register

Register completed export.

**Request:**
```json
{
  "hash": "a1b2c3d4...",
  "storagePath": "exports/user123/2024-01-15/a1b2c3d4.png",
  "propCard": { /* PropCard object */ },
  "viewMode": "CASUAL",
  "theme": "LIGHT",
  "sizeBytes": 123456
}
```

**Response (200):**
```json
{
  "exportId": "user123_abc_xyz",
  "storagePath": "exports/user123/2024-01-15/a1b2c3d4.png",
  "signedUrl": "https://storage.googleapis.com/...",
  "expiresAt": 1234567890,
  "cached": false,
  "verificationId": "ABCD-1234"
}
```

### GET /api/export/:exportId

Get export by ID.

**Response (200):**
```json
{
  "exportId": "user123_abc_xyz",
  "storagePath": "exports/user123/2024-01-15/a1b2c3d4.png",
  "signedUrl": "https://storage.googleapis.com/...",
  "expiresAt": 1234567890,
  "cached": false,
  "verificationId": "ABCD-1234"
}
```

### GET /api/export/history?limit=50

Get user's export history.

**Response (200):**
```json
{
  "exports": [
    {
      "exportId": "user123_abc_xyz",
      "propCardHash": "a1b2c3d4...",
      "viewMode": "CASUAL",
      "theme": "LIGHT",
      "createdAt": 1234567890,
      "verificationId": "ABCD-1234"
    }
  ]
}
```

## User Plan Management

### Set User Plan (Admin Only)

```typescript
import { updateUserPlan } from '@proppulse/shared/export/quota';
import admin from 'firebase-admin';

const db = admin.firestore();

// Upgrade to Pro
await updateUserPlan('user-uid', 'PRO', db);

// Downgrade to Free
await updateUserPlan('user-uid', 'FREE', db);
```

### Check Quota Programmatically

```typescript
import { checkExportQuota } from '@proppulse/shared/export/quota';

const result = await checkExportQuota('user-uid', db);

if (result.allowed) {
  console.log(`Remaining exports: ${result.remaining}`);
} else {
  console.log(`Quota exceeded. Resets at: ${new Date(result.resetAt)}`);
}
```

## Monitoring & Maintenance

### View Logs

```bash
# Cloud Functions logs
firebase functions:log --only checkCache,registerExport

# Or in Firebase Console:
# Functions -> checkCache -> Logs

# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50
```

### Manual Cleanup

```bash
# Call cleanup endpoint (requires admin token)
curl -X POST https://your-region-your-project.cloudfunctions.net/manualCleanup \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"olderThanMs": 2592000000}' # 30 days
```

### Monitor Storage Usage

```bash
# List all exports
gsutil ls -l gs://your-project.appspot.com/exports/**

# Calculate total size
gsutil du -s gs://your-project.appspot.com/exports
```

## Troubleshooting

### Export Fails with "Quota Exceeded"

1. Check user's plan: `userPlans/{uid}`
2. Check daily usage: `usage/{uid}/daily/{date}`
3. Upgrade user to Pro or wait for reset (midnight UTC)

### Signed URL Expired

Signed URLs expire after 1 hour. Call `GET /api/export/:exportId` to get a fresh URL.

### Canvas Rendering Font Issues

Install system fonts on the server:

```bash
# Ubuntu/Debian
apt-get install fonts-liberation fonts-noto

# macOS
# Fonts are pre-installed

# Docker (add to Dockerfile)
RUN apt-get update && apt-get install -y fonts-liberation
```

### Playwright Timeout

Increase timeout in Cloud Run:

```bash
gcloud run services update prop-export-render --timeout 120s
```

### High Memory Usage

Increase Cloud Run memory:

```bash
gcloud run services update prop-export-render --memory 4Gi
```

## Cost Optimization

### Cache Hit Optimization

- 6-hour cache TTL reduces redundant renders
- Shared cache (`exports/cache/`) deduplicates across users
- Monitor cache hit rate: `usageCount` in `exportCache`

### Storage Cleanup

- Scheduled job runs daily at 2 AM CT
- Deletes exports older than 30 days
- Adjust threshold in `cleanupJob` function

### Cloud Functions

- Use caching to reduce function invocations
- Monitor function execution time and optimize
- Consider Cloud Run for high-volume rendering

### Cloud Run

- Set min-instances to 0 for cost savings
- Set max-instances to limit spend
- Use smaller machine types for canvas rendering

## Security Best Practices

1. **Always verify Firebase Auth tokens** - Never trust client requests
2. **Use signed URLs with short expiration** - Default 1 hour
3. **Enforce quota limits** - Prevent abuse via atomic transactions
4. **Validate file uploads** - Check content-type and size
5. **Rate limit API endpoints** - Use Firebase App Check or custom middleware
6. **Monitor for suspicious activity** - Alert on unusual usage patterns

## Performance Benchmarks

### Client-side Rendering (Web)
- Average: 2-3 seconds
- Size: 150-300 KB
- Success rate: 95%+

### Client-side Rendering (Mobile)
- Average: 3-5 seconds
- Size: 150-300 KB
- Success rate: 90%+

### Server-side Rendering (Playwright)
- Average: 5-8 seconds
- Size: 200-400 KB
- Success rate: 99%+

### Canvas Rendering
- Average: 1-2 seconds
- Size: 100-200 KB
- Success rate: 99%+

## Support

For issues or questions:
- Check Firebase Console logs
- Review Firestore security rules
- Verify Cloud Functions deployment
- Test with Postman/curl

## License

MIT
