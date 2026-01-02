# PropPulse Scripts

Utility scripts for data ingestion, validation, and testing.

## Scripts

### 1. `seed-data.js`
Seeds Firestore with test data for local development.

**Usage:**
```bash
cd scripts
npm install
node seed-data.js
```

**What it seeds:**
- 5 NBA teams
- 5 popular players (LeBron, Curry, Durant, Giannis, Jokic)
- 20 games per player (100 total game stats)
- 1 injury snapshot
- 1 daily changes document

**Requirements:**
- Firebase emulators running OR
- `GOOGLE_APPLICATION_CREDENTIALS` set for production

---

### 2. `cli-csv-import.js`
Import data from CSV files via admin API.

**Usage:**
```bash
# Set environment variables
export ADMIN_KEY="dev-admin-key"
export FUNCTIONS_BASE_URL="http://localhost:5001/proppulse-dev/us-central1/api"

# Import game logs
node cli-csv-import.js --file ../data/sample-game-logs.csv --type game-logs

# Import injuries
node cli-csv-import.js --file ../data/sample-injuries.csv --type injuries

# Import rosters
node cli-csv-import.js --file ../data/sample-rosters.csv --type roster
```

**Supported types:**
- `game-logs` - Player game statistics
- `injuries` - Injury reports
- `roster` - Team rosters

**CSV Templates:**
See `../data/sample-*.csv` for format examples.

---

### 3. `validate-ingestion.js`
End-to-end validation of the ingestion pipeline.

**Usage:**
```bash
# Local (emulators)
export ADMIN_KEY="dev-admin-key"
export API_URL="http://localhost:5001/proppulse-dev/us-central1/api"
node validate-ingestion.js

# Production
export ADMIN_KEY="YOUR_PRODUCTION_KEY"
export API_URL="https://us-central1-YOUR_PROJECT.cloudfunctions.net/api"
node validate-ingestion.js
```

**Tests run:**
1. ✅ Scraper health check
2. ✅ Database statistics
3. ✅ CSV import (game logs)
4. ✅ Ingestion job trigger (small test)
5. ✅ View recent ingestion runs

**Exit codes:**
- `0` - All tests passed
- `1` - Some tests failed

---

## Quick Commands (from root)

Add these to your workflow:

```bash
# Seed test data
pnpm seed

# Import CSV
pnpm ingest:csv -- --file data/sample-game-logs.csv --type game-logs

# Validate ingestion pipeline
pnpm ingest:validate
```

---

## Sample Data Files

Located in `../data/`:

### `sample-game-logs.csv`
20 game logs for popular players (LeBron, Curry, Durant, etc.)

### `sample-injuries.csv`
10 injury records with various statuses (OUT, QUESTIONABLE, PROBABLE)

### `sample-rosters.csv`
22 players across 11 teams

---

## Environment Variables

### Local Development
```bash
ADMIN_KEY="dev-admin-key"
FUNCTIONS_BASE_URL="http://localhost:5001/proppulse-dev/us-central1/api"
API_URL="http://localhost:5001/proppulse-dev/us-central1/api"
```

### Production
```bash
ADMIN_KEY="YOUR_SECURE_KEY"
FUNCTIONS_BASE_URL="https://us-central1-YOUR_PROJECT.cloudfunctions.net/api"
API_URL="https://us-central1-YOUR_PROJECT.cloudfunctions.net/api"
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

---

## Troubleshooting

### "ECONNREFUSED" error
- Ensure Firebase emulators are running: `firebase emulators:start`
- Check `FUNCTIONS_BASE_URL` is correct

### "Admin access required"
- Verify `ADMIN_KEY` matches Firebase config: `firebase functions:config:get admin.key`
- Or set locally: `firebase functions:config:set admin.key="dev-admin-key"`

### CSV import fails
- Check CSV format matches templates in `../data/`
- Ensure headers are correct (case-sensitive)
- Verify file path is correct

### Validation script hangs
- Check if ingestion job is taking too long (large player set)
- Reduce timeout or use smaller test dataset
- Check Cloud Functions logs for errors

---

## Development Workflow

**Typical workflow:**

1. **Start emulators:**
   ```bash
   pnpm emulators
   ```

2. **Seed test data:**
   ```bash
   pnpm seed
   ```

3. **Develop features** using seeded data

4. **Test CSV import:**
   ```bash
   pnpm ingest:csv -- --file data/sample-game-logs.csv --type game-logs
   ```

5. **Validate everything works:**
   ```bash
   pnpm ingest:validate
   ```

6. **Deploy to production:**
   ```bash
   pnpm functions:deploy
   ```

---

## Adding New Scripts

To add a new script:

1. Create `scripts/your-script.js`
2. Add to root `package.json` scripts:
   ```json
   "your-command": "node scripts/your-script.js"
   ```
3. Document in this README

---

**Last Updated**: January 2, 2026
