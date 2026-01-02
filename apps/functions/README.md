# PropPulse Cloud Functions

This directory contains all Firebase Cloud Functions for the PropPulse backend.

## Structure

```
functions/
├── src/
│   ├── api/              # HTTP API endpoints
│   │   ├── routes/       # Individual route handlers
│   │   └── index.ts      # API router
│   ├── ingestion/        # Data scraping and ingestion jobs
│   │   ├── teams-players.ts
│   │   ├── game-logs.ts
│   │   ├── injuries.ts
│   │   ├── schedule.ts
│   │   └── daily-changes.ts
│   ├── middleware/       # Auth and rate limiting
│   ├── stripe/           # Stripe webhook handler
│   ├── utils/            # Utility functions
│   └── index.ts          # Main entry point
├── package.json
└── tsconfig.json
```

## API Endpoints

### Public Endpoints
- `GET /api/health` - Health check

### Authenticated Endpoints
- `POST /api/prop-card` - Generate prop research card
- `GET /api/player/search?q={query}` - Search players
- `GET /api/player/:id` - Get player details
- `GET /api/saved-props` - List saved props
- `POST /api/saved-props` - Create saved prop
- `PATCH /api/saved-props/:id` - Update saved prop
- `DELETE /api/saved-props/:id` - Delete saved prop
- `GET /api/feed` - Daily changes feed
- `POST /api/export/prop-card` - Export prop card to PNG
- `GET /api/watchlist` - Get watchlist
- `POST /api/watchlist` - Add to watchlist
- `DELETE /api/watchlist/:id` - Remove from watchlist

### Protected Endpoints (Admin Only)
- `POST /ingestTeamsAndPlayersOnce` - Trigger teams/players ingestion
- `POST /runIngestion` - Manually trigger any ingestion job

## Scheduled Jobs

- `ingestPlayerStatsDaily` - Runs daily at 3 AM CST
- `ingestInjuriesScheduled` - Runs 4x daily (9 AM, 1 PM, 5 PM, 9 PM CST)
- `ingestScheduleWeekly` - Runs weekly on Sundays at 4 AM CST

## Development

### Install Dependencies
```bash
pnpm install
```

### Build
```bash
pnpm build
```

### Deploy
```bash
firebase deploy --only functions
```

### Local Testing
```bash
firebase emulators:start
```

## Configuration

Set admin key:
```bash
firebase functions:config:set admin.key="your-secure-key"
```

## Environment Variables

Functions use Firebase config. For local development, create `.env`:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Implementing Scrapers

To implement production scraping:

1. **Choose Data Source**: Basketball-Reference or ESPN
2. **Add Axios Request**: Fetch HTML with proper headers
3. **Parse with Cheerio**: Extract data from HTML
4. **Store in Firestore**: Use batch writes with merge
5. **Cache Raw HTML**: Save to Cloud Storage for debugging
6. **Add Health Checks**: Log scraper status to `scraperHealth` collection
7. **Implement Retry Logic**: Exponential backoff on failures

Example:
```typescript
const response = await axios.get(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PropPulse/1.0)' },
  timeout: 10000,
});

const $ = cheerio.load(response.data);
// Parse data...
```

## Troubleshooting

### Function deployment fails
- Check Node version (must be 20)
- Ensure shared package is built: `cd packages/shared && pnpm build`

### Cannot read from Firestore
- Check security rules are deployed
- Verify user is authenticated

### Webhook not receiving events
- Check Stripe webhook secret matches
- Verify webhook endpoint URL is correct
- Test with Stripe CLI: `stripe listen --forward-to http://localhost:5001/.../stripe`
