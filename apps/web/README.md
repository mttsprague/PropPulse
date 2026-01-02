# PropPulse Web App

Next.js 14 web application for PropPulse.

## Getting Started

### Install Dependencies
```bash
pnpm install
```

### Environment Setup

Create `.env.local`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FUNCTIONS_BASE_URL=http://localhost:5001/your-project/us-central1/api
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
pnpm build
pnpm start
```

## Pages

- `/` - Landing page
- `/auth/signin` - Sign in
- `/auth/signup` - Sign up
- `/dashboard` - Daily feed (What Changed Today?)
- `/research` - Prop card generator (TODO: implement)
- `/saved` - Saved props list (TODO: implement)
- `/billing` - Subscription management (TODO: implement)

## TODO: Complete Implementation

The following pages need to be implemented:

### `/research` - Prop Card Generator
- Player search autocomplete
- Stat type selector (PTS/REB/AST)
- Line input
- Over/Under selector
- Generate button
- Display prop card with hit rates, trends, insights
- Pro analytics tabs (for Pro users)
- Save and Export buttons

### `/saved` - Saved Props
- List all saved props
- Filter by tag, stat type, team
- Sort by date, hit rate
- Quick regenerate
- Notes editor
- Delete functionality

### `/billing` - Subscription
- Current plan display
- Usage stats (cards generated, exports used)
- Upgrade to Pro button (Stripe Checkout)
- Customer portal link
- Cancel subscription

## Components to Build

Create in `src/components/`:
- `PlayerSearch.tsx` - Autocomplete search
- `PropCardDisplay.tsx` - Prop card UI
- `HitRateChart.tsx` - Recharts visualization
- `InsightBadge.tsx` - Insight bullets
- `SavedPropCard.tsx` - Saved prop list item
- `UpgradePrompt.tsx` - Upgrade CTA for free users

## API Integration

Use `apiClient` from `lib/api-client.ts`:

```typescript
import { apiClient } from '@/lib/api-client';

// Generate prop card
const result = await apiClient.generatePropCard({
  playerName: 'LeBron James',
  statType: 'PTS',
  line: 25.5,
  overUnder: 'O',
});

// Save prop
await apiClient.createSavedProp({
  playerId: 'player-id',
  playerName: 'LeBron James',
  statType: 'PTS',
  line: 25.5,
  overUnder: 'O',
  tags: ['favorite'],
});
```

## Deployment

### Vercel (Recommended)

```bash
vercel --prod
```

Add environment variables in Vercel dashboard.

### Self-Hosted

```bash
pnpm build
pnpm start
```

## Styling

Uses TailwindCSS + Shadcn UI components. Color scheme:
- Primary: Purple (`#7C3AED`)
- Accent: Yellow (`#FBBF24`)

## Authentication

Firebase Auth with email/password. Context in `lib/auth-context.tsx`.

Protected routes should check:
```typescript
const { user, loading } = useAuth();

if (!loading && !user) {
  router.push('/auth/signin');
}
```
