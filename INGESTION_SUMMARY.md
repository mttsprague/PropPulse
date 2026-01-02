# PropPulse NBA Data Ingestion Pipeline - Complete Build Summary

## 🎯 What Was Built

A **production-ready, automated NBA data ingestion system** that scrapes free public sources, processes data, and stores it in Firestore for use by the PropPulse application.

### Key Features
✅ **Automated scheduling** via Cloud Scheduler (daily, 4x daily, weekly)  
✅ **Rate-limited scraping** (20 req/min) with caching and retries  
✅ **Idempotent ingestion** - can safely re-run without duplicates  
✅ **Health monitoring** - tracks scraper status and errors  
✅ **CSV fallback system** - manual uploads when scrapers break  
✅ **Admin API** - trigger jobs and view status  
✅ **Comprehensive logging** - ingestion runs tracked in Firestore  

---

## 📁 Complete File Structure

```
PropPulse/
├── SOURCES.md                          # Data source documentation
├── INGESTION.md                        # Complete ingestion guide
├── package.json                        # Added ingestion scripts
├── firestore.rules                     # Updated with ingestion security
├── firestore.indexes.json              # Added required indexes
│
├── data/                               # Sample CSV files
│   ├── sample-game-logs.csv
│   ├── sample-injuries.csv
│   └── sample-rosters.csv
│
├── scripts/
│   ├── cli-csv-import.js               # CLI tool for CSV uploads
│   └── validate-ingestion.js           # E2E validation script
│
└── apps/functions/src/
    ├── index.ts                        # Updated with schedulers
    │
    ├── utils/
    │   ├── rate-limiter.ts             # Token bucket rate limiter
    │   ├── fetch-and-cache.ts          # HTTP wrapper with caching
    │   └── csv-import.ts               # CSV parsing and import
    │
    ├── scrapers/
    │   ├── teams-players.ts            # Basketball-Reference rosters
    │   ├── schedule.ts                 # Basketball-Reference schedule
    │   ├── game-logs.ts                # Basketball-Reference game logs
    │   └── injuries.ts                 # ESPN injury reports
    │
    ├── jobs/
    │   ├── ingestion.ts                # Orchestrates scrapers → Firestore
    │   └── computation.ts              # Daily changes & aggregates
    │
    └── api/admin/
        └── ingestion.ts                # Admin endpoints
```

---

## 🔄 Data Flow

```
┌──────────────────┐
│ Cloud Scheduler  │ ← Cron: 3 AM daily, 9 AM/1 PM/5 PM/9 PM, Monday 4 AM
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Cloud Functions  │ ← Triggers: ingestPlayerStatsDaily, ingestInjuriesScheduled, ingestScheduleWeekly
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Jobs Layer       │ ← Orchestrates: ingestTeamsAndPlayers(), ingestSchedule(), etc.
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Scrapers Layer   │ ← Parses HTML: teams-players.ts, schedule.ts, game-logs.ts, injuries.ts
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Fetch & Cache    │ ← Rate limits, caches HTML in Cloud Storage, retries on failure
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Basketball-Ref   │ ← Free source: rosters, schedules, game logs
│ ESPN.com         │ ← Free source: injury reports
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Firestore        │ ← Stores: teams, players, games, playerGameStats, etc.
└──────────────────┘
```

---

## 📊 Firestore Collections Created

| Collection | Purpose | Document Count (Expected) |
|------------|---------|---------------------------|
| `teams` | NBA team info | 30 |
| `players` | Active NBA players | ~450 |
| `games` | Season schedule | ~1,230/season |
| `playerGameStats` | Individual game performances | ~40,000/season |
| `injurySnapshots` | Timestamped injury reports | ~120/month |
| `dailyChanges` | Computed daily feed | ~180/season |
| `playerAggregates` | Season/last10/last20 averages | ~450 |
| `scraperHealth` | Scraper status tracking | ~5 |
| `ingestionRuns` | Job execution logs | ~100/month |

---

## ⏰ Scheduled Jobs

### 1. Daily Full Ingestion (3 AM CT)
**Function**: `ingestPlayerStatsDaily`  
**Cron**: `0 3 * * *`  
**Actions**:
- Scrapes game logs for all active players
- Computes player aggregates (season, last10, last20)
- Computes daily changes (minutes spikes, back-to-backs)
- **Duration**: 30-45 minutes
- **Cost**: ~$0.10-0.20 per run

### 2. Injury Snapshots (4x Daily)
**Function**: `ingestInjuriesScheduled`  
**Cron**: `0 9,13,17,21 * * *`  
**Actions**:
- Scrapes ESPN injury report
- Creates timestamped snapshot
- Computes injury status changes
- **Duration**: 30-60 seconds
- **Cost**: ~$0.01 per run

### 3. Weekly Schedule & Rosters (Monday 4 AM CT)
**Function**: `ingestScheduleWeekly`  
**Cron**: `0 4 * * 1`  
**Actions**:
- Scrapes full NBA schedule
- Refreshes team rosters
- Updates player-team mappings
- **Duration**: 5-10 minutes
- **Cost**: ~$0.05 per run

---

## 🛠️ Admin API Endpoints

All endpoints require `x-admin-key` header or admin Firebase claim.

### Health & Status
- `GET /admin/health` - Scraper health status
- `GET /admin/ingestion-runs?limit=20` - Recent ingestion runs
- `GET /admin/stats` - Database statistics

### Manual Triggers
- `POST /admin/ingest/teams-players` - Ingest teams and players
- `POST /admin/ingest/schedule` - Ingest schedule
- `POST /admin/ingest/game-logs` - Ingest game logs
- `POST /admin/ingest/injuries` - Ingest injury snapshot
- `POST /admin/compute/daily-changes` - Compute daily changes
- `POST /admin/compute/aggregates` - Compute player aggregates

### CSV Imports
- `POST /admin/import/game-logs-csv` - Import game logs from CSV
- `POST /admin/import/injuries-csv` - Import injuries from CSV
- `POST /admin/import/roster-csv` - Import team rosters from CSV
- `GET /admin/csv-templates` - Get CSV templates

---

## 🚀 How to Use

### Local Development

1. **Start emulators:**
   ```bash
   pnpm install
   pnpm build
   pnpm emulators
   ```

2. **Test CSV import:**
   ```bash
   export ADMIN_KEY="dev-admin-key"
   export API_URL="http://localhost:5001/proppulse-dev/us-central1/api"
   
   pnpm ingest:csv -- --file data/sample-game-logs.csv --type game-logs
   ```

3. **Validate ingestion:**
   ```bash
   pnpm ingest:validate
   ```

4. **Manually trigger jobs:**
   ```bash
   curl -X POST "$API_URL/admin/ingest/teams-players" \
     -H "x-admin-key: $ADMIN_KEY" \
     -H "Content-Type: application/json" \
     -d '{"season": 2025}'
   ```

### Production Deployment

1. **Set admin key:**
   ```bash
   firebase functions:config:set admin.key="YOUR_SECURE_KEY"
   ```

2. **Deploy:**
   ```bash
   cd apps/functions
   pnpm build
   firebase deploy --only functions,firestore:rules,firestore:indexes
   ```

3. **Verify schedulers:**
   ```bash
   gcloud scheduler jobs list
   ```

4. **First run:**
   ```bash
   export ADMIN_KEY="YOUR_ADMIN_KEY"
   export API_URL="https://us-central1-YOUR_PROJECT.cloudfunctions.net/api"
   
   # Ingest teams and players
   curl -X POST "$API_URL/admin/ingest/teams-players" \
     -H "x-admin-key: $ADMIN_KEY" \
     -H "Content-Type: application/json" \
     -d '{"season": 2025}'
   ```

---

## 🔍 Validation Checklist

### After Deployment
- [ ] Cloud Scheduler jobs created (check Google Cloud Console)
- [ ] Firestore rules deployed
- [ ] Firestore indexes created
- [ ] Admin key set in Firebase config
- [ ] Storage bucket exists

### After First Ingestion
- [ ] Teams collection has 30 documents
- [ ] Players collection has 400+ documents
- [ ] Games collection has 1000+ documents
- [ ] PlayerGameStats collection has data
- [ ] Scraper health shows "ok" status

### Weekly Checks
- [ ] Ingestion runs completing successfully
- [ ] No scrapers in "broken" status
- [ ] Daily changes being computed
- [ ] Player aggregates updating

---

## 📈 Expected Performance

### Ingestion Times
- **Teams & Players**: 2-3 minutes (30 teams × 5-6 sec delay)
- **Schedule**: 5-10 minutes (9 months of games)
- **Game Logs (all players)**: 30-45 minutes (450 players × 3 sec delay)
- **Injury Snapshot**: 30-60 seconds (1 request)

### Data Volumes
- **Season game logs**: ~40,000 documents (450 players × ~70 games)
- **Daily updates**: ~450 game logs/day (450 players × 1 game avg)
- **Injury snapshots**: 4/day = 120/month
- **Storage**: ~500 MB/season (including cached HTML)

### Costs (Estimated)
- **Cloud Functions**: $10-15/month
- **Firestore**: $5-10/month
- **Cloud Storage**: $1-2/month
- **Cloud Scheduler**: $0.30/month
- **Total**: ~$20-30/month

---

## 🔒 Security

### Firestore Rules
- ✅ Ingestion collections: **public read, admin-only write**
- ✅ Scraper health: **admin-only read**
- ✅ Ingestion runs: **admin-only read**
- ✅ User data: **owner-only access**

### Admin Authentication
Two methods supported:
1. **Admin key header**: `x-admin-key: YOUR_KEY`
2. **Firebase auth with admin claim**: User document has `admin: true`

### Rate Limiting
- Global rate limiter enforces 20 req/min
- Prevents abuse and respects source websites
- Exponential backoff on errors

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| [SOURCES.md](../SOURCES.md) | Data source details, rate limits, fallbacks |
| [INGESTION.md](../INGESTION.md) | Complete ingestion system guide |
| [BUILD_SUMMARY.md](../BUILD_SUMMARY.md) | Overall MVP build summary |
| [DEPLOYMENT.md](../DEPLOYMENT.md) | Production deployment guide |

---

## 🐛 Troubleshooting

### Scraper is "broken"
1. Check scraper health: `GET /admin/health`
2. View last error in `scraperHealth` collection
3. Common causes:
   - Website HTML structure changed → Update selectors
   - Rate limited → Increase delays
   - IP blocked → Use Cloud Run (future)
4. Use CSV fallback while fixing

### No data appearing
1. Check ingestion runs: `GET /admin/ingestion-runs`
2. Check Cloud Functions logs: `firebase functions:log`
3. Verify Firestore rules allow writes
4. Check indexes are deployed

### Scheduler not triggering
1. Verify jobs exist: `gcloud scheduler jobs list`
2. Check permissions: Service account needs `cloudfunctions.functions.invoke`
3. Manually trigger: `gcloud scheduler jobs run ingestPlayerStatsDaily`

---

## 🎉 Success Criteria

The ingestion pipeline is ready when:

✅ All scrapers show "ok" status  
✅ Teams collection has 30 documents  
✅ Players collection has 400+ documents  
✅ Games collection has 1000+ documents  
✅ PlayerGameStats collection has recent games  
✅ Injury snapshots being created 4x daily  
✅ Daily changes being computed  
✅ Player aggregates updating  
✅ Scheduled jobs running automatically  
✅ CSV imports working  
✅ Admin API accessible  

---

## 🚧 Known Limitations & Future Improvements

### Current Limitations
- Scraping is sequential (not parallelized)
- Full game log ingestion takes 30-45 minutes
- No real-time injury updates (4x daily snapshots)
- HTML structure changes can break scrapers

### Planned Improvements
- **Cloud Run parallelization** - Ingest multiple players simultaneously
- **ML-based structure detection** - Auto-adapt to HTML changes
- **Additional data sources** - NBA.com/stats as backup
- **Real-time webhooks** - Instant injury updates
- **Community validation** - Crowdsourced data verification

---

## 📞 Support

For issues or questions:
1. Check [INGESTION.md](../INGESTION.md) for detailed troubleshooting
2. Review Cloud Functions logs
3. Check scraper health status
4. Use CSV fallback if urgent

---

**Last Updated**: January 2, 2026  
**Version**: 1.0.0  
**Status**: Production Ready ✅
