# PropPulse Data Sources

This document describes the free data sources used by PropPulse's ingestion pipeline, scraping strategies, rate limits, and fallback procedures.

---

## Data Sources

### 1. Basketball-Reference.com
**URL**: https://www.basketball-reference.com  
**What it provides**:
- Complete NBA schedule (past, current, future)
- Player game logs (detailed stats per game)
- Team rosters with player positions
- Historical data going back decades

**Scraping frequency**:
- Schedule: Weekly refresh (Monday 4 AM)
- Player game logs: Daily at 3 AM (previous day's completed games)
- Rosters: Weekly refresh (Monday 4 AM)

**Parsing approach**:
- HTML scraping with Cheerio
- Table-based parsing (`<table id="schedule">`, `<table id="pgl_basic">`)
- Well-structured HTML with stable selectors

**Rate limits**:
- Max 20 requests/minute
- Add 3-5 second delays between requests
- Cache HTML responses for 12+ hours

**Fallback if broken**:
- CSV upload via admin endpoint
- Manual data entry
- Switch to ESPN if structure changes

**Terms of Service notes**:
- Basketball-Reference allows reasonable scraping for personal/research use
- We implement respectful rate limits
- We cache aggressively to minimize requests
- We run batch jobs (not per-user requests)

---

### 2. ESPN.com Injury Report
**URL**: https://www.espn.com/nba/injuries  
**What it provides**:
- Current injury status for all NBA players
- Injury type/description
- Expected return dates (when available)
- Updated multiple times daily

**Scraping frequency**:
- 4x daily: 9 AM, 1 PM, 5 PM, 9 PM CT

**Parsing approach**:
- HTML scraping with Cheerio
- Injury tables grouped by team
- Player names linked to player pages

**Rate limits**:
- Single request per injury snapshot
- Max 1 request every 4 hours

**Fallback if broken**:
- RotoWire injury page as backup
- Manual CSV upload with injury data
- NBA.com official injury report (harder to parse)

**Terms of Service notes**:
- ESPN allows reasonable scraping
- Single page load every 4 hours is minimal impact

---

### 3. Basketball-Reference Team Pages (Rosters)
**URL**: https://www.basketball-reference.com/teams/{TEAM}/2025.html  
**What it provides**:
- Current team rosters
- Player IDs (derived from URLs)
- Positions
- Jersey numbers

**Scraping frequency**:
- Weekly (Monday 4 AM)
- Or on-demand via admin trigger

**Parsing approach**:
- Parse roster table on each team page
- Extract player links: `/players/j/jamesle01.html` → playerId: `jamesle01`
- Map to team

**Rate limits**:
- 30 teams = 30 requests
- Spread over 2-3 minutes (5-10 sec delays)

**Fallback if broken**:
- CSV upload with player-team mappings
- ESPN rosters as backup

---

## Scraping Infrastructure

### Caching Strategy
All HTML responses are cached in Cloud Storage:
- Bucket: `{project-id}.appspot.com`
- Path: `/scraper-cache/{source}/{date}/{hash}.html`
- TTL: 12-24 hours depending on source
- ETags stored in Firestore for conditional requests

### Rate Limiting
Global rate limiter enforces:
- Max 20 requests/minute across all scrapers
- Exponential backoff on errors (2s, 4s, 8s, 16s)
- Jitter added to prevent thundering herd
- Circuit breaker after 5 consecutive failures

### Health Monitoring
Each scraper reports health to `/scraperHealth/{scraperName}`:
- `lastRunAt`: Timestamp of last attempt
- `status`: `ok` | `warning` | `broken`
- `errorCountLast7`: Count of errors in last 7 days
- `lastErrorMessage`: Most recent error
- `lastSuccessAt`: Last successful run

Status transitions:
- `ok` → `warning`: 1-2 failures
- `warning` → `broken`: 3+ consecutive failures
- `broken` → `ok`: successful run after fixing

### User-Agent
All requests use:
```
User-Agent: PropPulse-DataBot/1.0 (+https://proppulse.com/about)
```

---

## Data Freshness Guarantees

| Data Type | Refresh Frequency | Lag Time |
|-----------|------------------|----------|
| Player Game Logs | Daily 3 AM CT | 3-6 hours after games end |
| Injury Reports | 4x daily | Real-time to 4 hours |
| Schedule | Weekly | Near real-time |
| Rosters | Weekly | Days to weeks |
| Aggregates | Daily 3 AM CT | 3-6 hours |

---

## CSV Fallback Templates

### Player Game Logs CSV
```csv
playerId,date,teamId,opponentTeamId,homeAway,minutes,pts,reb,ast,stl,blk,tov,fg,fga,fg3,fg3a,ft,fta
jamesle01,2025-01-01,LAL,GSW,home,35,28,8,7,1,1,3,11,20,2,6,4,5
curryst01,2025-01-01,GSW,LAL,away,33,30,5,6,2,0,2,10,18,6,12,4,4
```

### Injury Snapshot CSV
```csv
playerId,status,injuryType,expectedReturn
jamesle01,OUT,ankle,2025-01-10
curryst01,QUESTIONABLE,shoulder,
duranke01,PROBABLE,rest,
```

### Team Roster CSV
```csv
teamId,teamName,playerId,playerName,position,jerseyNumber
LAL,Los Angeles Lakers,jamesle01,LeBron James,F,23
GSW,Golden State Warriors,curryst01,Stephen Curry,G,30
```

---

## Troubleshooting Scraper Breaks

### Symptom: Scraper status is "broken"

**Step 1: Check scraperHealth**
```typescript
// Query Firestore
db.collection('scraperHealth').doc('basketball-reference-game-logs').get()
```

**Step 2: Check recent error**
Look at `lastErrorMessage` field.

**Common issues**:
- `Selector not found` → Website HTML changed
- `Timeout` → Website slow or blocking
- `429 Too Many Requests` → Rate limit hit
- `403 Forbidden` → IP blocked or User-Agent blocked

**Step 3: Test scraper manually**
```bash
cd apps/functions
npm run test:scraper -- game-logs
```

**Step 4: Fix selector or switch source**
Update parser in `/apps/functions/src/scrapers/{name}.ts`

**Step 5: Use CSV fallback**
```bash
pnpm import:csv --file game-logs-2025-01-01.csv
```

---

## Legal & Ethical Considerations

### Rate Limits
We enforce strict rate limits to be respectful:
- Never more than 1 request per 3 seconds per domain
- Daily scraping (not per-user)
- Aggressive caching

### Robots.txt Compliance
We check and respect robots.txt:
- Basketball-Reference: Allows reasonable crawling
- ESPN: Allows reasonable crawling

### Data Ownership
- We do not claim ownership of scraped data
- Data is publicly available
- We add value through aggregation and analysis
- Users must not redistribute raw data

### Fallback Strategy
If a source blocks us or changes terms:
1. Immediately switch to CSV import mode
2. Notify admins via logs
3. Research alternative sources
4. Update scrapers within 48 hours

---

## Future Improvements

### Short-term
- Add NBA.com/stats as backup source
- Implement Puppeteer scraper for JavaScript-heavy pages
- Add scraper unit tests with fixture HTML

### Medium-term
- Machine learning to detect HTML structure changes
- Auto-generate selectors from examples
- Distributed scraping with Cloud Run

### Long-term
- Partner with data providers for official feeds
- Contribute to open-source NBA data projects
- Build community-contributed data validation

---

**Last Updated**: January 2, 2026  
**Maintained by**: PropPulse Engineering Team
