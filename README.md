# PropPulse - NBA Player Prop Research Workflow Saver

**PropPulse** is a micro-SaaS MVP that helps NBA prop researchers save time by instantly generating comprehensive prop research cards with hit rates, trends, game context, and injury insights. It's an analytics workflow tool, **not a betting advice product**.

---

## 🎯 Features

### Core Features
- **Prop Research Card Generator**: Input player name, stat type (PTS/REB/AST), line, and O/U to generate instant analytics
- **Hit Rate Analytics**: Last 10, Last 20, and Season hit rates with W-L-P records
- **Recent Trends**: Last 5 game logs, rolling averages, and minutes trends
- **Context Insights**: Back-to-back flags, injured teammates, and 3 rule-based insight bullets
- **Pro Analytics** (Pro plan): Splits (home/away, rest days), distribution histograms, volatility, trend slopes, and line sensitivity
- **Daily "What Changed Today?" Feed**: Injury status changes, minutes spikes, and back-to-back schedules
- **Saved Props**: Bookmark props with notes and tags
- **Export to PNG**: Generate shareable prop card images with watermark and disclaimers

### Tiered Plans
- **Free**: 5 prop cards/day, 15 saved props max, 1 export/day
- **Pro ($12-19/month)**: Unlimited cards, saves, and exports + Pro analytics

---

## 🏗️ Architecture

### Monorepo Structure
```
PropPulse/
├── apps/
│   ├── web/              # Next.js 14 web app
│   ├── mobile/           # Expo React Native app
│   └── functions/        # Firebase Cloud Functions
├── packages/
│   └── shared/           # Shared types, schemas, calculations
├── firebase.json
├── firestore.rules
├── storage.rules
├── firestore.indexes.json
└── README.md
```

### Tech Stack
- **Frontend**: Next.js 14 (App Router), React Native (Expo)
- **Backend**: Firebase (Auth, Firestore, Cloud Functions, Storage, Scheduler)
- **Payments**: Stripe
- **Styling**: TailwindCSS, Shadcn UI
- **Data Ingestion**: Custom scrapers (Basketball-Reference, ESPN) with fallback CSV upload

---

## 📋 Prerequisites

- **Node.js**: 20.x or higher
- **pnpm**: 8.x or higher
- **Firebase CLI**: `npm install -g firebase-tools`
- **Stripe Account** (for payments)
- **Firebase Project** (create at [console.firebase.google.com](https://console.firebase.google.com))

---

## 🚀 Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url> PropPulse
cd PropPulse
pnpm install
```

### 2. Firebase Setup

#### Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (e.g., `proppulse-prod`)
3. Enable:
   - **Authentication** → Email/Password provider
   - **Firestore Database** → Start in production mode
   - **Storage** → Default bucket
   - **Functions** → Node 20 runtime

#### Initialize Firebase
```bash
firebase login
firebase init
```

Select:
- Firestore
- Functions
- Storage
- Emulators

Use existing project and select your Firebase project.

#### Set Admin API Key (for protected endpoints)
```bash
firebase functions:config:set admin.key="YOUR_SECURE_ADMIN_KEY"
```

### 3. Configure Environment Variables

#### Root `.env` (for functions)
```bash
cp .env.example .env
```

Edit `.env` with your Firebase and Stripe credentials.

#### Web App `.env.local`
```bash
cd apps/web
cp .env.example .env.local
```

Add your Firebase config and Stripe publishable key.

#### Mobile App Environment
Update `apps/mobile/app.json` and create a `config.ts` file with Firebase config.

### 4. Deploy Firestore Rules and Indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
```

### 5. Build Shared Package

```bash
cd packages/shared
pnpm build
```

### 6. Deploy Cloud Functions

```bash
cd apps/functions
pnpm build
firebase deploy --only functions
```

### 7. Set Up Stripe

1. Create a Stripe account
2. Create a product "PropPulse Pro" with a monthly price
3. Copy the Price ID to `.env` as `STRIPE_PRICE_ID_PRO_MONTHLY`
4. Set up webhook endpoint pointing to your Functions URL + `/stripe`
5. Copy webhook secret to `.env` as `STRIPE_WEBHOOK_SECRET`

---

## 🧪 Development

### Run Locally with Emulators

#### Terminal 1: Start Firebase Emulators
```bash
firebase emulators:start
```

#### Terminal 2: Start Web App
```bash
cd apps/web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

#### Terminal 3: Start Mobile App
```bash
cd apps/mobile
pnpm start
```

Scan QR code with Expo Go app.

---

## 📊 Data Ingestion

PropPulse requires player game logs, schedules, and injury data. There are two modes:

### Mode 1: Automated Scraping (Production)

The ingestion pipeline scrapes data from Basketball-Reference and ESPN. Scheduled jobs run via Cloud Scheduler:

- **Player Stats**: Daily at 3 AM CST (`ingestPlayerStatsDaily`)
- **Injuries**: 4x daily at 9 AM, 1 PM, 5 PM, 9 PM CST (`ingestInjuriesScheduled`)
- **Schedule**: Weekly on Sundays at 4 AM CST (`ingestScheduleWeekly`)

#### Enable Cloud Scheduler

```bash
firebase deploy --only functions
```

Then in [Google Cloud Console](https://console.cloud.google.com):
1. Go to Cloud Scheduler
2. Verify scheduled jobs are created
3. Manually trigger to test

#### Configure Scraper Sources

Edit ingestion files in `apps/functions/src/ingestion/`:
- `teams-players.ts`
- `game-logs.ts`
- `injuries.ts`
- `schedule.ts`

Implement actual scraping logic using Cheerio to parse Basketball-Reference or ESPN pages.

**Important**: Add rate limiting, retry logic, and caching. Store raw HTML in Cloud Storage for debugging.

### Mode 2: Manual CSV Upload (Fallback)

When scrapers fail or for initial data seeding, use the manual upload endpoint.

#### Teams and Players
Call the protected endpoint:
```bash
curl -X POST https://<your-functions-url>/ingestTeamsAndPlayersOnce \
  -H "x-admin-key: YOUR_ADMIN_KEY"
```

#### Player Game Stats CSV Upload

Create a CSV with format:
```csv
playerId,playerName,date,opponent,homeAway,minutes,pts,reb,ast,started
player1,LeBron James,2025-01-01,LAL,away,35,28,7,8,true
```

Upload and parse using a protected Cloud Function endpoint.

---

## 🔐 Security

### Firestore Rules
- Public read for cached data (teams, players, games, stats)
- User-specific write/read for saved props and watchlist
- Admin-only write for ingestion data

### API Rate Limiting
Implemented in middleware. Adjust limits in `packages/shared/src/constants.ts`.

### Stripe Webhooks
Webhook signature verification ensures only Stripe can update subscription status.

---

## 💳 Billing Flow

1. User signs up (free plan by default)
2. User clicks "Upgrade to Pro" → redirects to Stripe Checkout
3. On successful payment, Stripe webhook updates Firestore user doc with `plan: 'pro'`
4. Usage middleware checks plan and enforces limits

---

## 📱 Mobile App

The Expo app mirrors core web functionality:
- Dashboard feed
- Prop search and card generation
- Saved props list
- Export/share

To build for production:
```bash
cd apps/mobile
expo build:android
expo build:ios
```

---

## 🧪 Testing

### Test Prop Card Generation

1. Sign up and log in
2. Navigate to `/research`
3. Enter player name (e.g., "LeBron James")
4. Select stat type (PTS), enter line (25.5), select Over
5. Generate prop card

You'll need game data in Firestore for this to work. Use manual CSV upload initially.

### Test Daily Feed

1. Ingest injury snapshots
2. Run `computeDailyChanges` function
3. View `/dashboard` to see changes

---

## 🚢 Deployment

### Deploy Functions
```bash
cd apps/functions
pnpm build
firebase deploy --only functions
```

### Deploy Web App (Vercel)

```bash
cd apps/web
vercel --prod
```

Set environment variables in Vercel dashboard.

### Deploy Mobile App

Follow [Expo EAS Build](https://docs.expo.dev/build/introduction/) instructions.

---

## 📝 Important Notes

### Disclaimers

PropPulse includes prominent disclaimers:
- "For informational purposes only. Not betting advice."
- "Past performance does not guarantee future results."

These appear on:
- Landing page footer
- Dashboard
- Export images
- Mobile app

### No Sportsbook Integration

PropPulse does NOT integrate with sportsbooks or betting APIs. Users manually enter lines.

### Responsible Scraping

- Scrape at low frequency (daily for stats, 4x daily for injuries)
- Use polite User-Agent headers
- Cache responses to avoid redundant requests
- Implement fallback CSV upload for reliability

---

## 🐛 Troubleshooting

### Functions Not Deploying
- Ensure Node 20 runtime: check `apps/functions/package.json` engines
- Build shared package first: `cd packages/shared && pnpm build`

### Firestore Permission Denied
- Check `firestore.rules` are deployed
- Verify user is authenticated
- Check user document exists in `/users/{uid}`

### Stripe Webhook Not Working
- Verify webhook secret matches `.env`
- Check Cloud Functions logs: `firebase functions:log`
- Test with Stripe CLI: `stripe listen --forward-to <your-functions-url>/stripe`

### No Data in Prop Cards
- Run manual ingestion: `curl -X POST <functions-url>/runIngestion -H "x-admin-key: YOUR_KEY" -d '{"job":"game-logs"}'`
- Check Firestore for `playerGameStats` collection

---

## 📚 Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Expo Documentation](https://docs.expo.dev)
- [Stripe Documentation](https://stripe.com/docs)
- [Basketball-Reference](https://www.basketball-reference.com)

---

## 🎉 What's Next?

### MVP Enhancements
- Implement actual scraping logic in ingestion modules
- Add unit tests for calculations
- Add admin dashboard for scraper health monitoring
- Implement Puppeteer-based PNG export
- Add SEO pages for top players

### Feature Roadmap
- Additional stat types (3PM, STL, BLK, etc.)
- Player comparison tool
- Advanced filters (opponent, home/away, rest days)
- Historical prop tracking and performance analytics
- Email/SMS notifications for watchlist changes

---

## 📄 License

Proprietary - PropPulse MVP

---

## 🙏 Acknowledgments

PropPulse is a workflow tool designed to save time for NBA analytics enthusiasts. It is **not financial or betting advice**. Always research responsibly and comply with local laws.

---

**Built with ❤️ for the NBA analytics community.**
