# Search System - Quick Start Guide

## 🚀 Quick Deployment (5 Steps)

### Step 1: Install Dependencies

```bash
# Shared package
cd packages/shared
npm install

# Functions
cd ../../functions
npm install

# Web
cd ../apps/web
npm install fuse.js

# Mobile
cd ../mobile
npm install fuse.js
```

### Step 2: Deploy Firestore Indexes

```bash
# From project root
firebase deploy --only firestore:indexes

# Wait for indexes to build (5-10 minutes)
# Check status: https://console.firebase.google.com/project/YOUR-PROJECT/firestore/indexes
```

### Step 3: Deploy Cloud Functions

```bash
cd functions
npm run build

# Deploy search functions
firebase deploy --only functions:searchPlayers,functions:topPlayers

# Deploy scheduled jobs
firebase deploy --only functions:computeAggregatesDaily,functions:computePropTablesDaily,functions:buildSearchIndexWeekly

# Deploy manual triggers
firebase deploy --only functions:rebuildSearchIndex,functions:computeAggregatesManual,functions:computePropTablesManual
```

### Step 4: Initial Data Setup

```bash
# Set your Cloud Functions URL
export API_URL="https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net"

# 1. Compute player aggregates (takes 5-10 minutes for 500+ players)
curl -X POST $API_URL/computeAggregatesManual

# 2. Compute prop tables (takes 10-15 minutes)
curl -X POST $API_URL/computePropTablesManual

# 3. Build search index (takes 1-2 minutes)
curl -X POST $API_URL/rebuildSearchIndex
```

### Step 5: Configure Environment Variables

```bash
# Get your search index URL from step 4 response
# Should be: https://storage.googleapis.com/YOUR-BUCKET/search/player-index.json

# Web (.env.local)
echo "NEXT_PUBLIC_SEARCH_INDEX_URL=YOUR_INDEX_URL" >> apps/web/.env.local
echo "NEXT_PUBLIC_API_URL=$API_URL" >> apps/web/.env.local

# Mobile (.env)
echo "EXPO_PUBLIC_SEARCH_INDEX_URL=YOUR_INDEX_URL" >> apps/mobile/.env
echo "EXPO_PUBLIC_API_URL=$API_URL" >> apps/mobile/.env
```

## ✅ Verification

### Test Search API

```bash
# Search for "lebron"
curl "$API_URL/searchPlayers?q=lebron&limit=5"

# Should return results with player info
```

### Test Search Index

```bash
# Download index file
curl https://storage.googleapis.com/YOUR-BUCKET/search/player-index.json | jq '.metadata'

# Should show:
# {
#   "version": "1.0",
#   "generatedAt": ...,
#   "playerCount": 530,
#   "checksum": "..."
# }
```

### Test Aggregates

```bash
# Check a player's aggregates (replace with real player ID)
# In Firebase Console: Firestore -> playerAggregates -> {playerId}

# Should see:
# - seasonAvg
# - last5Avg
# - last10Avg
# - last20Avg
```

### Test Prop Tables

```bash
# In Firebase Console: Firestore -> playerPropTables -> {playerId}_PTS

# Should see:
# - lineRows array with hit rates
# - generatedAt timestamp
```

## 📊 Scheduled Jobs

Jobs run automatically:

- **3 AM CT Daily**: Compute player aggregates (`computeAggregatesDaily`)
- **4 AM CT Daily**: Compute prop tables (`computePropTablesDaily`)
- **5 AM CT Sunday**: Rebuild search index (`buildSearchIndexWeekly`)

Check job status in Firestore `jobs` collection.

## 🔧 Manual Triggers

Re-run jobs manually:

```bash
# Recompute aggregates
curl -X POST $API_URL/computeAggregatesManual

# Recompute prop tables
curl -X POST $API_URL/computePropTablesManual

# Rebuild search index
curl -X POST $API_URL/rebuildSearchIndex
```

## 🧪 Testing Search in Web App

```tsx
// Test component: apps/web/components/test-search.tsx
'use client';

import { usePlayerSearch } from '@/hooks/usePlayerSearch';

export function TestSearch() {
  const { query, setQuery, results, isLoading, indexLoaded } = usePlayerSearch();

  return (
    <div className="p-8">
      <div>Index Loaded: {indexLoaded ? '✓' : '✗'}</div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search players..."
        className="border p-2 w-full"
      />
      {isLoading && <div>Loading...</div>}
      <div>
        {results.map((p) => (
          <div key={p.playerId}>
            {p.name} - {p.teamAbbr} - {p.position}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 📈 Performance Targets

- ✅ Search index loads in < 500ms
- ✅ Fuse.js returns results in < 10ms
- ✅ Firestore fallback < 200ms
- ✅ Player page loads in < 500ms
- ✅ Common lines table instant (precomputed)

## 🐛 Troubleshooting

### Search Index Not Loading

```bash
# Check CORS settings on Cloud Storage bucket
gsutil cors get gs://YOUR-BUCKET

# Set CORS if needed
echo '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json
gsutil cors set cors.json gs://YOUR-BUCKET
```

### Firestore Permission Errors

```bash
# Ensure indexes are built
firebase deploy --only firestore:indexes

# Check index status in console
```

### Missing Aggregates/Prop Tables

```bash
# Run manual jobs
curl -X POST $API_URL/computeAggregatesManual
curl -X POST $API_URL/computePropTablesManual

# Check Cloud Functions logs
firebase functions:log --only computeAggregatesManual
```

### Slow Search Queries

```bash
# Check if search index is loaded
# Should see "Search index loaded: XXX players" in browser console

# If not loading, check:
# 1. NEXT_PUBLIC_SEARCH_INDEX_URL is set
# 2. URL is accessible (test in browser)
# 3. CORS is enabled on bucket
```

## 📚 Documentation

- **Full Documentation**: `/packages/shared/src/search/README.md`
- **API Reference**: See type definitions in `/packages/shared/src/search/types.ts`
- **Examples**: Check README for component examples

## 🎯 Next Steps

1. ✅ Deploy and verify all jobs running
2. ✅ Build web search component with keyboard nav
3. ✅ Build mobile search component
4. ✅ Build player page with common lines table
5. ✅ Implement "Create Prop Card" quick action
6. ✅ Add SEO metadata and static generation
7. ⏭️ Add recently searched players
8. ⏭️ Add trending players
9. ⏭️ Build team pages

## 🚨 Important Notes

- **First Run**: Initial aggregate/prop table computation takes 15-20 minutes for 500+ players
- **Daily Jobs**: Run automatically, no manual intervention needed
- **Search Index**: Cached globally in client, only fetched once per session
- **Firestore Indexes**: MUST be deployed and built before querying
- **Rate Limits**: Cloud Functions have default limits, increase if needed

## 💡 Pro Tips

1. **Preload Index**: Load search index on app startup for instant search
2. **Cache Results**: Client-side caching reduces API calls
3. **Optimize Queries**: Use aggregates instead of querying game logs
4. **Monitor Jobs**: Check `jobs` collection for failures
5. **Test Locally**: Use Firebase emulators for local testing

## 🔗 Useful Links

- [Firebase Console](https://console.firebase.google.com/)
- [Cloud Functions Logs](https://console.cloud.google.com/logs)
- [Cloud Storage Browser](https://console.cloud.google.com/storage)
- [Firestore Indexes](https://console.firebase.google.com/project/YOUR-PROJECT/firestore/indexes)
