# PropPulse Ingestion Pipeline - End-to-End Validation Guide

## Overview

This guide walks you through validating the complete NBA data ingestion pipeline from scratch.

---

## Prerequisites

- [ ] Node.js 20+ installed
- [ ] pnpm installed
- [ ] Firebase CLI installed: `npm install -g firebase-tools`
- [ ] Firebase project created
- [ ] Logged into Firebase: `firebase login`

---

## Phase 1: Local Setup & Testing

### Step 1: Install Dependencies

```bash
# From project root
pnpm install

# Build shared package
cd packages/shared
pnpm build
cd ../..

# Install scripts dependencies
cd scripts
npm install
cd ..
```

**Expected output:**
- All dependencies installed without errors
- Shared package built successfully

---

### Step 2: Start Firebase Emulators

```bash
firebase emulators:start
```

**Expected output:**
```
✔  All emulators ready!
┌─────────────┬────────────────┬─────────────────────────────────┐
│ Emulator    │ Host:Port      │ View in Emulator Suite         │
├─────────────┼────────────────┼─────────────────────────────────┤
│ Functions   │ localhost:5001 │ http://localhost:4000/functions │
│ Firestore   │ localhost:8080 │ http://localhost:4000/firestore │
│ Storage     │ localhost:9199 │ http://localhost:4000/storage   │
└─────────────┴────────────────┴─────────────────────────────────┘
```

**Verify:**
- [ ] Functions emulator running on port 5001
- [ ] Firestore emulator running on port 8080
- [ ] Storage emulator running on port 9199
- [ ] Emulator UI accessible at http://localhost:4000

---

### Step 3: Seed Test Data

```bash
pnpm seed
```

**Expected output:**
```
Seeding PropPulse test data...
✓ Seeded 5 teams
✓ Seeded 5 players
✓ Seeded 20 games
✓ Seeded 100 player game stats
✓ Seeded 1 injury snapshot
✓ Seeded 1 daily changes document
✅ Test data seeded successfully!
```

**Verify in Firestore Emulator UI (http://localhost:4000/firestore):**
- [ ] `/teams` has 5 documents (LAL, GSW, PHO, LAC, DEN)
- [ ] `/players` has 5 documents (jamesle01, curryst01, etc.)
- [ ] `/games` has 20 documents
- [ ] `/playerGameStats` has 100 documents
- [ ] `/injurySnapshots` has 1 document
- [ ] `/dailyChanges` has 1 document

---

### Step 4: Test CSV Import

```bash
export ADMIN_KEY="dev-admin-key"
export API_URL="http://localhost:5001/proppulse-dev/us-central1/api"

pnpm ingest:csv -- --file data/sample-game-logs.csv --type game-logs
```

**Expected output:**
```
Reading CSV file: /path/to/data/sample-game-logs.csv
CSV size: 1.23 KB
Uploading to: http://localhost:5001/.../admin/import/game-logs-csv
✅ CSV import successful!

Response:
{
  "message": "Game logs imported from CSV",
  "inserted": 20,
  "updated": 0,
  "errors": []
}
```

**Verify:**
- [ ] No errors in output
- [ ] Inserted count > 0
- [ ] Check Firestore: `/playerGameStats` increased by ~20 documents

---

### Step 5: Test Admin API Endpoints

#### Health Check
```bash
curl -s "$API_URL/admin/health" \
  -H "x-admin-key: $ADMIN_KEY" | jq
```

**Expected output:**
```json
{
  "health": []
}
```
*(Empty initially - scrapers haven't run yet)*

#### Database Stats
```bash
curl -s "$API_URL/admin/stats" \
  -H "x-admin-key: $ADMIN_KEY" | jq
```

**Expected output:**
```json
{
  "stats": {
    "teams": 5,
    "players": 5,
    "games": 20,
    "playerGameStats": 120,
    "injurySnapshots": 1,
    "dailyChanges": 1,
    "playerAggregates": 0
  }
}
```

**Verify:**
- [ ] All counts match seeded/imported data
- [ ] No errors returned

---

### Step 6: Trigger Small Ingestion Job

```bash
curl -s -X POST "$API_URL/admin/ingest/game-logs" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"playerIds": ["jamesle01"], "season": 2025}' | jq
```

**Expected output:**
```json
{
  "message": "Game logs ingestion started",
  "runId": "game-logs-1735689600000",
  "checkStatus": "/admin/ingestion-runs"
}
```

**Wait 10-15 seconds for scraping to complete, then check status:**

```bash
curl -s "$API_URL/admin/ingestion-runs?limit=1" \
  -H "x-admin-key: $ADMIN_KEY" | jq
```

**Expected output:**
```json
{
  "runs": [
    {
      "runId": "game-logs-1735689600000",
      "startedAt": 1735689600000,
      "endedAt": 1735689612000,
      "status": "completed",
      "jobs": {
        "playerGameLogs": {
          "status": "completed",
          "stats": {
            "logsInserted": 15,
            "logsUpdated": 0,
            "playersProcessed": 1
          },
          "errors": []
        }
      },
      "summary": "Game logs: 15 inserted, 0 updated for 1 players."
    }
  ]
}
```

**Verify:**
- [ ] Status is "completed"
- [ ] No errors in output
- [ ] Game logs were inserted
- [ ] Check Firestore: new documents in `/playerGameStats`

---

### Step 7: Run Full Validation Script

```bash
pnpm ingest:validate
```

**Expected output:**
```
PropPulse Ingestion Pipeline - E2E Validation
API URL: http://localhost:5001/proppulse-dev/us-central1/api

============================================================
Test 1: Scraper Health
============================================================

⚠️  No scraper health records found

============================================================
Test 2: Database Statistics
============================================================

Current database counts:
  - teams: 5
  - players: 5
  - games: 20
  - playerGameStats: 135
  - injurySnapshots: 1
  - dailyChanges: 1
  - playerAggregates: 0

============================================================
Test 3: CSV Import (Game Logs)
============================================================

Reading CSV: /path/to/data/sample-game-logs.csv
CSV size: 1.23 KB
✅ Import successful:
  - Inserted: 0
  - Updated: 20

============================================================
Test 4: Ingestion Job (Small Test)
============================================================

Triggering game logs ingestion for 2 players...
✅ Game logs ingestion started
Run ID: game-logs-1735689700000
Waiting 10 seconds for job to complete...
Job status: completed
  - Logs inserted: 18
  - Logs updated: 0
  - Players processed: 2

============================================================
Test 5: Recent Ingestion Runs
============================================================

Found 2 recent runs:
  1. game-logs-1735689700000 - completed (2026-01-02T...)
     Game logs: 18 inserted, 0 updated for 2 players.
  2. game-logs-1735689600000 - completed (2026-01-02T...)
     Game logs: 15 inserted, 0 updated for 1 players.

============================================================
Test Summary
============================================================

Passed: 5/5

✅ scraperHealth
✅ databaseStats
✅ csvImport
✅ ingestionJob
✅ ingestionRuns

🎉 All tests passed! Ingestion pipeline is ready.
```

**Verify:**
- [ ] All 5 tests passed
- [ ] No errors in output
- [ ] Exit code 0

---

## Phase 2: Production Deployment

### Step 8: Configure Firebase

```bash
# Set admin key
firebase functions:config:set admin.key="YOUR_SECURE_RANDOM_KEY"

# Verify config
firebase functions:config:get
```

**Expected output:**
```json
{
  "admin": {
    "key": "YOUR_SECURE_RANDOM_KEY"
  }
}
```

---

### Step 9: Deploy Functions

```bash
cd apps/functions
pnpm build
firebase deploy --only functions
```

**Expected output:**
```
✔  functions: Finished running predeploy script.
i  functions: preparing codebase default for deployment
...
✔  functions[api(us-central1)] Successful create operation.
✔  functions[stripe(us-central1)] Successful create operation.
✔  functions[ingestPlayerStatsDaily(us-central1)] Successful create operation.
✔  functions[ingestInjuriesScheduled(us-central1)] Successful create operation.
✔  functions[ingestScheduleWeekly(us-central1)] Successful create operation.
...
✔  Deploy complete!
```

**Verify:**
- [ ] All functions deployed successfully
- [ ] No deployment errors
- [ ] Check Firebase Console: Functions tab shows all functions

---

### Step 10: Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

**Expected output:**
```
=== Deploying to 'your-project'...

i  firestore: reading indexes from firestore.indexes.json...
i  firestore: reading rules from firestore.rules...
✔  firestore: released rules firestore.rules to cloud.firestore
✔  firestore: deployed indexes in firestore.indexes.json successfully
```

**Verify:**
- [ ] Rules deployed
- [ ] Indexes created
- [ ] Check Firebase Console: Firestore > Rules and Indexes tabs

---

### Step 11: Verify Cloud Scheduler Jobs

```bash
gcloud scheduler jobs list
```

**Expected output:**
```
ID                           LOCATION      SCHEDULE        TARGET_TYPE  STATE
firebase-schedule-ingestPlayerStatsDaily-us-central1  us-central1   0 3 * * *       Pub/Sub      ENABLED
firebase-schedule-ingestInjuriesScheduled-us-central1 us-central1   0 9,13,17,21 * * * Pub/Sub   ENABLED
firebase-schedule-ingestScheduleWeekly-us-central1    us-central1   0 4 * * 1       Pub/Sub      ENABLED
```

**Verify:**
- [ ] 3 scheduler jobs created
- [ ] All jobs are ENABLED
- [ ] Schedules match expected crons

---

### Step 12: First Production Ingestion

```bash
export ADMIN_KEY="YOUR_SECURE_KEY"
export API_URL="https://us-central1-YOUR_PROJECT.cloudfunctions.net/api"

# Ingest teams and players
curl -X POST "$API_URL/admin/ingest/teams-players" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"season": 2025}'
```

**Expected output:**
```json
{
  "message": "Teams and players ingestion started",
  "runId": "teams-players-1735690000000",
  "checkStatus": "/admin/ingestion-runs"
}
```

**Wait 2-3 minutes, then check logs:**

```bash
firebase functions:log --limit 20
```

**Look for:**
- [ ] "Teams and players ingestion completed"
- [ ] "Scraped X players for Y team"
- [ ] No error messages

**Check Firestore in Console:**
- [ ] `/teams` has ~30 documents
- [ ] `/players` has ~400 documents

---

### Step 13: Ingest Schedule

```bash
curl -X POST "$API_URL/admin/ingest/schedule" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"season": 2025}'
```

**Wait 5-10 minutes, check logs, verify:**
- [ ] `/games` has ~1200 documents in Firestore

---

### Step 14: Ingest Game Logs (Small Test)

```bash
# Test with just 5 players first
curl -X POST "$API_URL/admin/ingest/game-logs" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "playerIds": ["jamesle01", "curryst01", "duranke01", "antetgi01", "jokicni01"],
    "season": 2025
  }'
```

**Wait 1-2 minutes, verify:**
- [ ] `/playerGameStats` has new documents
- [ ] Check ingestion run status is "completed"

**For full ingestion (all players - takes 30-45 minutes):**
```bash
curl -X POST "$API_URL/admin/ingest/game-logs" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"season": 2025}'
```

---

### Step 15: Verify Scraper Health

```bash
curl -s "$API_URL/admin/health" \
  -H "x-admin-key: $ADMIN_KEY" | jq
```

**Expected output:**
```json
{
  "health": [
    {
      "name": "basketball-reference-rosters",
      "status": "ok",
      "lastRunAt": 1735690000000,
      "consecutiveErrors": 0,
      "errorCountLast7": 0,
      "lastSuccessAt": 1735690000000
    },
    {
      "name": "basketball-reference-schedule",
      "status": "ok",
      ...
    }
  ]
}
```

**Verify:**
- [ ] All scrapers have status "ok" or "warning"
- [ ] No scrapers with status "broken"
- [ ] Recent `lastRunAt` timestamps

---

## Phase 3: Ongoing Monitoring

### Daily Checks

```bash
# Check recent ingestion runs
curl -s "$API_URL/admin/ingestion-runs?limit=5" \
  -H "x-admin-key: $ADMIN_KEY" | jq

# Check scraper health
curl -s "$API_URL/admin/health" \
  -H "x-admin-key: $ADMIN_KEY" | jq

# Check database stats
curl -s "$API_URL/admin/stats" \
  -H "x-admin-key: $ADMIN_KEY" | jq
```

### Cloud Functions Logs

```bash
# View recent logs
firebase functions:log --limit 50

# Filter by function
firebase functions:log --only ingestPlayerStatsDaily --limit 20

# Follow logs in real-time
firebase functions:log --tail
```

### Cloud Scheduler Verification

```bash
# List all jobs
gcloud scheduler jobs list

# View job details
gcloud scheduler jobs describe firebase-schedule-ingestPlayerStatsDaily-us-central1

# Manually trigger a job
gcloud scheduler jobs run firebase-schedule-ingestPlayerStatsDaily-us-central1
```

---

## Success Criteria

✅ **Local Development:**
- [ ] Emulators start without errors
- [ ] Test data seeds successfully
- [ ] CSV imports work
- [ ] Validation script passes all tests
- [ ] Admin API endpoints respond correctly

✅ **Production Deployment:**
- [ ] All Cloud Functions deployed
- [ ] Firestore rules and indexes deployed
- [ ] Cloud Scheduler jobs created and enabled
- [ ] Admin key configured

✅ **Production Data:**
- [ ] Teams: ~30 documents
- [ ] Players: ~400 documents
- [ ] Games: ~1200 documents
- [ ] PlayerGameStats: ~40,000 documents (after full ingestion)
- [ ] InjurySnapshots: Being created 4x daily
- [ ] DailyChanges: Being computed daily
- [ ] PlayerAggregates: Updating daily

✅ **Monitoring:**
- [ ] All scrapers status "ok"
- [ ] Recent ingestion runs "completed"
- [ ] No errors in Cloud Functions logs
- [ ] Scheduled jobs running automatically

---

## Troubleshooting Common Issues

### Issue: "ECONNREFUSED" during local testing
**Solution:** Ensure emulators are running: `firebase emulators:start`

### Issue: "Admin access required"
**Solution:** 
- Local: Check `ADMIN_KEY` is "dev-admin-key"
- Production: Check Firebase config: `firebase functions:config:get admin.key`

### Issue: Scraper shows "broken" status
**Solution:**
1. Check error in scraper health: `GET /admin/health`
2. View Cloud Functions logs
3. Use CSV fallback while fixing
4. Update selectors in scraper files if HTML changed

### Issue: Game logs ingestion times out
**Solution:**
- Increase Cloud Functions timeout (max 540s)
- Split into smaller batches
- Check rate limiter settings

### Issue: Cloud Scheduler not triggering
**Solution:**
1. Verify jobs exist: `gcloud scheduler jobs list`
2. Check service account permissions
3. Manually trigger to test: `gcloud scheduler jobs run JOB_NAME`

---

## Next Steps

After validation is complete:

1. **Monitor daily** - Check scraper health and ingestion runs
2. **Set up alerts** - Cloud Monitoring alerts for failures
3. **Optimize costs** - Review Cloud Functions usage, adjust caching
4. **Add more players** - Gradually increase ingestion scope
5. **Build UI** - Connect web/mobile apps to ingested data

---

**Validation Complete!** 🎉

The PropPulse ingestion pipeline is now fully operational and ready to power your NBA prop research application.

---

**Last Updated**: January 2, 2026  
**Version**: 1.0.0
