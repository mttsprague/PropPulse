# PropPulse - Quick Start Guide

## Installation (5 minutes)

```bash
# 1. Install dependencies
pnpm install

# 2. Build shared package
cd packages/shared
pnpm build
cd ../..

# 3. Set up Firebase
firebase login
firebase init

# 4. Copy environment files
cp .env.example .env
cd apps/web && cp .env.example .env.local && cd ../..

# 5. Start emulators and dev servers
firebase emulators:start &
cd apps/web && pnpm dev &
```

## Key Commands

### Development
```bash
pnpm dev                    # Start all apps in dev mode
pnpm web:dev                # Start web app only
pnpm mobile:dev             # Start mobile app only
pnpm functions:dev          # Start functions in emulator
```

### Building
```bash
pnpm build                  # Build all packages
cd packages/shared && pnpm build    # Build shared package
cd apps/functions && pnpm build     # Build functions
```

### Deployment
```bash
firebase deploy --only functions    # Deploy Cloud Functions
firebase deploy --only firestore    # Deploy Firestore rules/indexes
cd apps/web && vercel --prod        # Deploy web app to Vercel
```

### Testing Ingestion
```bash
# Trigger manual ingestion (requires admin key)
curl -X POST http://localhost:5001/<project-id>/us-central1/runIngestion \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"job":"game-logs"}'
```

## Project Structure Quick Reference

```
PropPulse/
├── apps/
│   ├── functions/src/
│   │   ├── api/routes/          # API endpoints
│   │   ├── ingestion/           # Data scrapers
│   │   ├── middleware/          # Auth & rate limiting
│   │   └── index.ts             # Entry point
│   ├── web/src/
│   │   ├── app/                 # Next.js pages
│   │   ├── components/          # React components
│   │   └── lib/                 # Utils, API client, Firebase
│   └── mobile/
│       └── App.tsx              # Expo app entry
├── packages/shared/src/
│   ├── types.ts                 # TypeScript types
│   ├── calculations.ts          # Hit rate & analytics
│   ├── insights.ts              # Insight generation
│   └── constants.ts             # Config constants
└── firebase.json                # Firebase config
```

## Essential Files to Edit

### 1. Implement Scrapers
Edit `apps/functions/src/ingestion/`:
- `game-logs.ts` - Add Basketball-Reference scraping
- `injuries.ts` - Add ESPN injury report scraping
- `schedule.ts` - Add schedule scraping

### 2. Complete Web Pages
Create in `apps/web/src/app/`:
- `research/page.tsx` - Prop card generator
- `saved/page.tsx` - Saved props list
- `billing/page.tsx` - Subscription management

### 3. Add UI Components
Create in `apps/web/src/components/`:
- `PlayerSearch.tsx` - Player autocomplete
- `PropCardDisplay.tsx` - Prop card UI
- `HitRateChart.tsx` - Charts with Recharts

### 4. Mobile Screens
Create in `apps/mobile/src/screens/`:
- `ResearchScreen.tsx`
- `SavedPropsScreen.tsx`
- `PropCardDetailScreen.tsx`

## Common Issues & Solutions

### "Cannot find module '@proppulse/shared'"
```bash
cd packages/shared && pnpm build
```

### "Firebase permission denied"
```bash
firebase deploy --only firestore:rules
```

### "Stripe webhook not working"
- Check webhook secret in `.env`
- Use Stripe CLI: `stripe listen --forward-to <url>/stripe`

### "No data in prop cards"
- Run manual ingestion or upload CSV
- Check Firestore for `playerGameStats` collection

## Data Seeding for Testing

### Option 1: Manual CSV Upload
Create `test-data.csv`:
```csv
playerId,playerName,date,opponent,homeAway,minutes,pts,reb,ast,started
lebron,LeBron James,2025-01-01,GSW,home,35,28,7,8,true
lebron,LeBron James,2024-12-30,PHX,away,38,31,6,9,true
```

Upload via protected endpoint.

### Option 2: Hardcode Test Data
In `apps/functions/src/ingestion/game-logs.ts`, add hardcoded data:

```typescript
const testData: PlayerGameStat[] = [
  {
    id: 'lebron_game1',
    playerId: 'lebron',
    gameId: 'game1',
    date: '2025-01-01',
    minutes: 35,
    pts: 28,
    reb: 7,
    ast: 8,
    opponentTeamId: 'GSW',
    homeAway: 'home',
    started: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // ... more games
];

// Store in Firestore
const batch = db.batch();
testData.forEach(stat => {
  batch.set(db.collection('playerGameStats').doc(stat.id), stat);
});
await batch.commit();
```

## Next Steps After Setup

1. **Seed Data**: Add test player game logs to Firestore
2. **Test Prop Card**: Generate a card for "LeBron James O25.5 PTS"
3. **Implement Missing Pages**: Build `/research`, `/saved`, `/billing`
4. **Configure Stripe**: Set up products and webhook
5. **Deploy**: Push to production

## Support & Resources

- **Firebase Docs**: https://firebase.google.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Stripe Docs**: https://stripe.com/docs
- **Basketball-Reference**: https://www.basketball-reference.com

## Disclaimers

Always include:
- "For informational purposes only"
- "Not betting advice"
- "Past performance does not guarantee future results"

Display prominently on all pages and exports.

---

**Happy building! 🚀**
