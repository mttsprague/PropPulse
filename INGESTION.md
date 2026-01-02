# PropPulse Data Ingestion System

Complete guide to the NBA data ingestion pipeline for PropPulse.

---

## Overview

The ingestion system automatically scrapes and ingests NBA data from free public sources, storing structured data in Firestore for use by the PropPulse application.

### Architecture

```
┌─────────────────────┐
│  Cloud Scheduler    │ ← Cron triggers (3 AM, 9 AM, etc.)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Cloud Functions    │ ← Ingestion jobs
│  - ingestTeamsAndPlayers
│  - ingestSchedule
│  - ingestPlayerGameLogs
│  - ingestInjurySnapshot
│  - computeDailyChanges
│  - computePlayerAggregates
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Scrapers          │ ← Fetch & parse HTML
│  - teams-players.ts
│  - schedule.ts
│  - game-logs.ts
│  - injuries.ts
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Rate Limiter +     │ ← 20 req/min, caching, retries
│  Cache Layer        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Firestore          │ ← Structured data storage
│  - teams
│  - players
│  - games
│  - playerGameStats
│  - injurySnapshots
│  - dailyChanges
│  - playerAggregates
│  - scraperHealth
│  - ingestionRuns
└─────────────────────┘
```

---

## Data Sources

See [SOURCES.md](../SOURCES.md) for complete documentation.

**Primary sources:**
- **Basketball-Reference.com** - Game logs, schedule, rosters
- **ESPN.com** - Injury reports

**Rate limits:**
- Max 20 requests/minute globally
- 3-5 second delays between requests
- 12+ hour HTML caching

---

## Scheduled Jobs

### 1. Daily Full Ingestion (3 AM CT)
**Function**: `ingestPlayerStatsDaily`  
**Cron**: `0 3 * * *`  
**What it does**:
- Ingests previous day's completed games
- Scrapes player game logs for all players
- Computes player aggregates (season, last10, last20 averages)
- Computes daily changes (minutes spikes, back-to-backs)

**Duration**: ~30-45 minutes (400+ players)

### 2. Injury Snapshots (4x daily)
**Function**: `ingestInjuriesScheduled`  
**Cron**: `0 9,13,17,21 * * *` (9 AM, 1 PM, 5 PM, 9 PM CT)  
**What it does**:
- Scrapes ESPN injury report
- Creates timestamped snapshot in Firestore
- Resolves player names to IDs
- Computes daily changes (injury status changes)

**Duration**: ~30-60 seconds

### 3. Weekly Schedule & Rosters (Mondays 4 AM CT)
**Function**: `ingestScheduleWeekly`  
**Cron**: `0 4 * * 1`  
**What it does**:
- Scrapes full NBA schedule (October-June)
- Refreshes team rosters
- Updates player-team mappings

**Duration**: ~5-10 minutes

---

## Firestore Collections

### Ingestion Data Collections

#### `/teams/{teamId}`
```typescript
{
  id: string;              // "LAL", "GSW", etc.
  name: string;            // "Los Angeles Lakers"
  abbreviation: string;    // "LAL"
  updatedAt: number;       // Timestamp
}
```

#### `/players/{playerId}`
```typescript
{
  id: string;              // "jamesle01" (Basketball-Reference ID)
  name: string;            // "LeBron James"
  teamId: string;          // "LAL"
  position: string;        // "F", "G", "C", "F-G", etc.
  jerseyNumber?: string;   // "23"
  updatedAt: number;
}
```

#### `/games/{gameId}`
```typescript
{
  id: string;              // "2025-01-01_LAL_GSW"
  date: string;            // "2025-01-01" (ISO date)
  homeTeamId: string;      // "GSW"
  awayTeamId: string;      // "LAL"
  status: 'scheduled' | 'in_progress' | 'final';
  homeScore?: number;
  awayScore?: number;
  startTime?: string;      // "7:00 PM"
  updatedAt: number;
}
```

#### `/playerGameStats/{playerId}_{gameId}`
```typescript
{
  id: string;              // "jamesle01_2025-01-01_LAL_GSW"
  playerId: string;        // "jamesle01"
  gameId: string;          // "2025-01-01_LAL_GSW"
  date: string;            // "2025-01-01"
  teamId: string;          // "LAL"
  opponentTeamId: string;  // "GSW"
  homeAway: 'home' | 'away';
  minutes: number;         // 35.2
  pts: number;             // 28
  reb: number;             // 8
  ast: number;             // 7
  stl: number;             // 1
  blk: number;             // 1
  tov: number;             // 3
  fg: number;              // 11
  fga: number;             // 20
  fg3: number;             // 2
  fg3a: number;            // 6
  ft: number;              // 4
  fta: number;             // 5
  pf: number;              // 2
  plusMinus?: number;      // +8
  updatedAt: number;
  createdAt: number;
}
```

#### `/injurySnapshots/{timestamp}`
```typescript
{
  id: string;              // "1735689600000" (timestamp)
  snapshotDateTime: number;
  players: [
    {
      playerId: string;    // "jamesle01"
      playerName: string;  // "LeBron James"
      teamId: string;      // "LAL"
      teamName: string;    // "Los Angeles Lakers"
      status: string;      // "OUT", "QUESTIONABLE", etc.
      injuryType: string;  // "ankle"
      date?: string;       // Expected return date
      notes?: string;
    }
  ];
  updatedAt: number;
}
```

#### `/dailyChanges/{date}`
```typescript
{
  date: string;            // "2025-01-01"
  changes: [
    {
      category: 'injury' | 'minutes_spike' | 'back_to_back';
      playerId?: string;
      playerName: string;
      teamId?: string;
      summary: string;     // "LeBron James is now OUT"
      details: any;        // Additional context
      severity: 'high' | 'medium' | 'low';
    }
  ];
  updatedAt: number;
}
```

#### `/playerAggregates/{playerId}`
```typescript
{
  playerId: string;
  seasonAvg: {
    games: number;
    minutes: number;
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
    fg_pct: number;
    fg3_pct: number;
    ft_pct: number;
  };
  last10Avg: { /* same structure */ };
  last20Avg: { /* same structure */ };
  updatedAt: number;
}
```

### System Collections

#### `/scraperHealth/{scraperName}`
```typescript
{
  lastRunAt: number;
  status: 'ok' | 'warning' | 'broken';
  consecutiveErrors: number;
  errorCountLast7: number;
  lastErrorMessage?: string;
  lastSuccessAt: number;
  updatedAt: number;
}
```

#### `/ingestionRuns/{runId}`
```typescript
{
  runId: string;           // "daily-1735689600000"
  startedAt: number;
  endedAt?: number;
  status: 'running' | 'completed' | 'failed';
  jobs: {
    [jobName: string]: {
      status: 'pending' | 'running' | 'completed' | 'failed';
      stats: any;
      errors: string[];
      startedAt?: number;
      endedAt?: number;
    }
  };
  summary?: string;
}
```

---

## Local Development

### 1. Start Firebase Emulators

```bash
# Install dependencies
pnpm install

# Build shared package
cd packages/shared
pnpm build
cd ../..

# Start emulators
firebase emulators:start
```

Emulators will run on:
- Firestore: http://localhost:8080
- Functions: http://localhost:5001

### 2. Test Scrapers Manually

```bash
cd apps/functions

# Test teams/players scraper
node -e "
const { scrapeAllTeamsAndPlayers } = require('./dist/scrapers/teams-players');
scrapeAllTeamsAndPlayers().then(console.log);
"

# Test schedule scraper
node -e "
const { scrapeSeasonSchedule } = require('./dist/scrapers/schedule');
scrapeSeasonSchedule(2025).then(console.log);
"

# Test game logs scraper
node -e "
const { scrapePlayerGameLog } = require('./dist/scrapers/game-logs');
scrapePlayerGameLog('jamesle01').then(console.log);
"

# Test injury scraper
node -e "
const { scrapeInjuryReport } = require('./dist/scrapers/injuries');
scrapeInjuryReport().then(console.log);
"
```

### 3. Trigger Ingestion Jobs via Admin API

```bash
# Set admin key
export ADMIN_KEY="dev-admin-key"
export API_URL="http://localhost:5001/proppulse-dev/us-central1/api"

# Ingest teams and players
curl -X POST "$API_URL/admin/ingest/teams-players" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"season": 2025}'

# Ingest schedule
curl -X POST "$API_URL/admin/ingest/schedule" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"season": 2025}'

# Ingest game logs (for specific players)
curl -X POST "$API_URL/admin/ingest/game-logs" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"playerIds": ["jamesle01", "curryst01"], "season": 2025}'

# Ingest injuries
curl -X POST "$API_URL/admin/ingest/injuries" \
  -H "x-admin-key: $ADMIN_KEY"

# Compute daily changes
curl -X POST "$API_URL/admin/compute/daily-changes" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-01-01"}'

# Compute player aggregates
curl -X POST "$API_URL/admin/compute/aggregates" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"playerId": "jamesle01"}'
```

### 4. Check Status

```bash
# Get scraper health
curl "$API_URL/admin/health" -H "x-admin-key: $ADMIN_KEY"

# Get recent ingestion runs
curl "$API_URL/admin/ingestion-runs?limit=10" -H "x-admin-key: $ADMIN_KEY"

# Get database stats
curl "$API_URL/admin/stats" -H "x-admin-key: $ADMIN_KEY"
```

---

## CSV Fallback System

When scrapers break, use CSV imports to manually upload data.

### Get CSV Templates

```bash
curl "$API_URL/admin/csv-templates" -H "x-admin-key: $ADMIN_KEY"
```

### Import Game Logs CSV

```bash
# Using CLI tool
export ADMIN_KEY="dev-admin-key"
export FUNCTIONS_BASE_URL="http://localhost:5001/proppulse-dev/us-central1/api"

node scripts/cli-csv-import.js \
  --file data/game-logs-2025-01-01.csv \
  --type game-logs
```

### Import Injuries CSV

```bash
node scripts/cli-csv-import.js \
  --file data/injuries-2025-01-01.csv \
  --type injuries
```

### Import Team Rosters CSV

```bash
node scripts/cli-csv-import.js \
  --file data/rosters-2025.csv \
  --type roster
```

---

## Production Deployment

### 1. Set Admin Key

```bash
firebase functions:config:set admin.key="YOUR_SECURE_RANDOM_KEY"
```

### 2. Deploy Functions

```bash
cd apps/functions
pnpm build
firebase deploy --only functions
```

### 3. Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 4. Verify Cloud Scheduler Jobs

Go to [Google Cloud Console](https://console.cloud.google.com) > Cloud Scheduler

Verify jobs are created:
- `ingestPlayerStatsDaily` - 0 3 * * * (3 AM CT)
- `ingestInjuriesScheduled` - 0 9,13,17,21 * * * (9 AM, 1 PM, 5 PM, 9 PM CT)
- `ingestScheduleWeekly` - 0 4 * * 1 (4 AM CT Mondays)

### 5. Manual First Run

```bash
# Set production URL and admin key
export ADMIN_KEY="YOUR_ADMIN_KEY"
export API_URL="https://us-central1-YOUR_PROJECT.cloudfunctions.net/api"

# Ingest teams and players
curl -X POST "$API_URL/admin/ingest/teams-players" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"season": 2025}'

# Wait for completion (check logs)
firebase functions:log --limit 50

# Ingest schedule
curl -X POST "$API_URL/admin/ingest/schedule" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"season": 2025}'

# Ingest game logs (will take 30-45 minutes)
curl -X POST "$API_URL/admin/ingest/game-logs" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"season": 2025}'
```

---

## Troubleshooting

### Scraper Is "Broken"

**Check health status:**
```bash
curl "$API_URL/admin/health" -H "x-admin-key: $ADMIN_KEY"
```

**Common fixes:**
1. Website HTML changed → Update selectors in `scrapers/*.ts`
2. Rate limited → Increase delays in `rate-limiter.ts`
3. IP blocked → Use Cloud Run with rotating IPs (future improvement)
4. Use CSV fallback immediately while fixing

### No Data Appearing

**Check ingestion runs:**
```bash
curl "$API_URL/admin/ingestion-runs?limit=5" -H "x-admin-key: $ADMIN_KEY"
```

**Check Cloud Functions logs:**
```bash
firebase functions:log --limit 100
```

**Verify Firestore rules allow writes:**
```bash
# Rules should allow admin writes
firebase deploy --only firestore:rules
```

### Slow Ingestion

- Game logs take 30-45 minutes for all players (rate limited)
- Reduce player count for testing
- Increase rate limit if confident source can handle it
- Consider Cloud Run for parallelization (future)

### Cloud Scheduler Not Triggering

**Check scheduler status:**
```bash
gcloud scheduler jobs list
```

**Manually trigger:**
```bash
gcloud scheduler jobs run ingestPlayerStatsDaily
```

**Check permissions:**
- Cloud Scheduler needs `cloudscheduler.jobs.run` permission
- Service account needs `cloudfunctions.functions.invoke` permission

---

## Monitoring

### Daily Checks
- [ ] Check scraper health: all status "ok"
- [ ] Check last ingestion run: completed successfully
- [ ] Check player count: ~450 active players
- [ ] Check game logs: recent games have stats

### Weekly Checks
- [ ] Review scraper error counts
- [ ] Check Cloud Functions costs
- [ ] Check Firestore read/write costs
- [ ] Verify schedule is up to date

### Alerts to Set Up
- Scraper status → "broken" for >1 hour
- Ingestion run failed 2+ times in a row
- Zero game logs ingested for 2+ days
- Cloud Functions timeout errors

---

## Cost Optimization

### Current Costs (Estimated)
- **Cloud Functions**: $5-10/month (500+ executions/month)
- **Firestore**: $5-15/month (reads/writes + storage)
- **Cloud Storage**: $1-2/month (HTML cache)
- **Total**: ~$15-30/month

### Cost Reduction Tips
1. Increase cache TTLs (currently 12-24 hours)
2. Reduce scraping frequency (daily → every 2 days for game logs)
3. Use Firestore free tier efficiently
4. Only ingest active players (exclude injured/inactive)
5. Delete old injury snapshots (keep last 30 days)

---

## Future Improvements

### Short-term
- [ ] Add unit tests with fixture HTML
- [ ] Add NBA.com/stats as backup source
- [ ] Implement Puppeteer for JavaScript-heavy pages
- [ ] Add email/Slack alerts on scraper failures

### Medium-term
- [ ] Cloud Run for parallel scraping (faster ingestion)
- [ ] Machine learning to detect HTML structure changes
- [ ] Auto-generate selectors from examples
- [ ] Community-contributed data validation

### Long-term
- [ ] Partner with data providers for official feeds
- [ ] Build distributed scraping with rotating IPs
- [ ] Real-time injury updates via webhooks
- [ ] Contribute to open-source NBA data projects

---

**Last Updated**: January 2, 2026  
**Maintained by**: PropPulse Engineering Team
