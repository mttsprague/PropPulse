# PropPulse Deployment Guide

## Pre-Deployment Checklist

### 1. Environment Setup
- [ ] Firebase project created
- [ ] Stripe account configured
- [ ] All environment variables set
- [ ] Firebase CLI installed and authenticated

### 2. Code Quality
- [ ] All TypeScript compiles without errors
- [ ] Shared package builds successfully
- [ ] No console errors in local development
- [ ] Test data seeded and tested locally

### 3. Security
- [ ] Firestore rules deployed and tested
- [ ] Storage rules deployed and tested
- [ ] Admin API key set in Firebase config
- [ ] Stripe webhook secret configured
- [ ] No sensitive data in git history

---

## Step-by-Step Deployment

### Phase 1: Firebase Backend

#### 1.1 Deploy Firestore Configuration
```bash
# Deploy rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes

# Verify in Firebase Console
# Go to Firestore > Rules and Indexes tabs
```

#### 1.2 Deploy Storage Rules
```bash
firebase deploy --only storage

# Verify in Firebase Console > Storage > Rules
```

#### 1.3 Set Firebase Functions Config
```bash
# Set admin key for protected endpoints
firebase functions:config:set admin.key="GENERATE_SECURE_RANDOM_KEY_HERE"

# Set Stripe secrets (optional, can use .env)
firebase functions:config:set stripe.secret_key="sk_live_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."
```

#### 1.4 Build and Deploy Cloud Functions
```bash
# Build shared package first
cd packages/shared
pnpm build
cd ../..

# Build and deploy functions
cd apps/functions
pnpm build
firebase deploy --only functions

# Verify deployment
firebase functions:log --limit 10
```

#### 1.5 Verify Scheduled Jobs
- Go to [Google Cloud Console](https://console.cloud.google.com)
- Navigate to Cloud Scheduler
- Verify jobs are created:
  - `ingestPlayerStatsDaily` (3 AM CST)
  - `ingestInjuriesScheduled` (9 AM, 1 PM, 5 PM, 9 PM CST)
  - `ingestScheduleWeekly` (4 AM CST Sundays)
- Manually trigger one to test

#### 1.6 Seed Production Data
```bash
# Option A: Run seed script against production
cd scripts
npm install
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node seed-data.js

# Option B: Call ingestion endpoint
curl -X POST https://us-central1-YOUR_PROJECT.cloudfunctions.net/ingestTeamsAndPlayersOnce \
  -H "x-admin-key: YOUR_ADMIN_KEY"
```

### Phase 2: Web Application (Vercel)

#### 2.1 Connect GitHub Repo to Vercel
```bash
cd apps/web

# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link

# Set environment variables in Vercel dashboard:
# - NEXT_PUBLIC_FIREBASE_API_KEY
# - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
# - NEXT_PUBLIC_FIREBASE_PROJECT_ID
# - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
# - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
# - NEXT_PUBLIC_FIREBASE_APP_ID
# - NEXT_PUBLIC_FUNCTIONS_BASE_URL (your Firebase Functions URL)
# - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

#### 2.2 Deploy to Production
```bash
# Deploy
vercel --prod

# Verify
# Visit your-app.vercel.app
# Test sign up, sign in, dashboard
```

#### 2.3 Configure Custom Domain (Optional)
- Go to Vercel dashboard > Project > Settings > Domains
- Add custom domain (e.g., proppulse.com)
- Update DNS records as instructed
- Wait for SSL certificate

### Phase 3: Mobile Application (EAS)

#### 3.1 Set Up EAS
```bash
cd apps/mobile

# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure project
eas build:configure
```

#### 3.2 Update app.json
```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.yourcompany.proppulse"
    },
    "android": {
      "package": "com.yourcompany.proppulse"
    }
  }
}
```

#### 3.3 Build and Submit

**Android:**
```bash
# Build APK for testing
eas build --platform android --profile preview

# Build for production
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

**iOS:**
```bash
# Build for testing (requires Apple Developer account)
eas build --platform ios --profile preview

# Build for production
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

### Phase 4: Stripe Configuration

#### 4.1 Create Products
- Go to [Stripe Dashboard](https://dashboard.stripe.com)
- Products > Add Product
- Name: "PropPulse Pro"
- Billing period: Monthly
- Price: $12-19/month
- Copy Price ID to environment variables

#### 4.2 Set Up Webhook
- Developers > Webhooks > Add endpoint
- Endpoint URL: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/stripe`
- Events to listen:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Copy webhook signing secret to Firebase config

#### 4.3 Test Checkout Flow
- Sign up for new account in production
- Click "Upgrade to Pro"
- Complete checkout with test card: `4242 4242 4242 4242`
- Verify subscription status updates in Firestore
- Test usage limits are lifted

### Phase 5: Monitoring & Alerts

#### 5.1 Set Up Error Reporting
**Option A: Sentry**
```bash
npm install --save @sentry/nextjs
npm install --save @sentry/react-native
```

Add to apps and configure DSN.

**Option B: Firebase Crashlytics**
Already included if using Firebase.

#### 5.2 Set Up Cloud Monitoring
- Go to [Google Cloud Console](https://console.cloud.google.com)
- Monitoring > Alerting
- Create alerts:
  - Cloud Function error rate > 5%
  - Cloud Function execution time > 10s
  - Firestore read/write errors

#### 5.3 Set Up Uptime Monitoring
Use a service like:
- UptimeRobot (free)
- Pingdom
- Google Cloud Monitoring

Monitor:
- Web app homepage: `https://proppulse.com`
- API health endpoint: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/api/health`

---

## Post-Deployment Verification

### Smoke Tests

#### 1. Authentication
- [ ] Sign up with new email
- [ ] Verify email received (if enabled)
- [ ] Sign in
- [ ] User document created in Firestore `/users/{uid}`

#### 2. Prop Card Generation
- [ ] Search for player (e.g., "LeBron James")
- [ ] Select stat type (PTS), enter line (25.5), select Over
- [ ] Click generate
- [ ] Prop card displays with hit rates
- [ ] Usage counter increments in Firestore

#### 3. Saved Props
- [ ] Bookmark a prop
- [ ] Add notes and tags
- [ ] View in saved props list
- [ ] Regenerate prop
- [ ] Delete prop

#### 4. Daily Feed
- [ ] Visit dashboard
- [ ] Daily changes display
- [ ] Filter by watchlist (if items added)

#### 5. Billing
- [ ] Free user sees usage limits
- [ ] Click "Upgrade to Pro"
- [ ] Redirects to Stripe Checkout
- [ ] Complete payment
- [ ] User plan updates to "pro" in Firestore
- [ ] Limits removed

#### 6. Export
- [ ] Generate prop card
- [ ] Click export
- [ ] PNG downloads (or signed URL returned)
- [ ] Image includes watermark and disclaimer

### Load Testing

Use a tool like [Artillery](https://www.artillery.io/) or [k6](https://k6.io/):

```bash
npm install -g artillery

# Create test.yml
artillery run test.yml
```

Example test.yml:
```yaml
config:
  target: "https://us-central1-YOUR_PROJECT.cloudfunctions.net"
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Generate prop card"
    flow:
      - post:
          url: "/api/prop-card"
          headers:
            Authorization: "Bearer TEST_TOKEN"
          json:
            playerName: "LeBron James"
            statType: "PTS"
            line: 25.5
            overUnder: "O"
```

---

## Rollback Procedures

### If Functions Deployment Fails
```bash
# List recent deployments
firebase functions:list

# Rollback to previous version
# (Not directly supported, redeploy previous code)
git checkout <previous-commit>
cd apps/functions
pnpm build
firebase deploy --only functions
```

### If Web App Has Issues
```bash
# In Vercel dashboard:
# Deployments > Find working version > Promote to Production
```

### If Firestore Rules Lock Users Out
```bash
# Temporarily open up (DANGER: only for emergency)
firebase deploy --only firestore:rules

# Then quickly fix and redeploy correct rules
```

---

## Monitoring Dashboard

### Daily Checks
- [ ] Check Cloud Functions logs for errors
- [ ] Check scraper health collection in Firestore
- [ ] Check Stripe dashboard for failed payments
- [ ] Check user signups (Analytics or Firestore)

### Weekly Checks
- [ ] Review Cloud Functions costs
- [ ] Review Firestore read/write costs
- [ ] Review Storage costs
- [ ] Check user feedback (support email, social media)

### Monthly Checks
- [ ] Review churn rate (subscription cancellations)
- [ ] Analyze most-used features
- [ ] Plan feature updates based on usage

---

## Troubleshooting Production Issues

### "Cannot read from Firestore"
- Check Firestore rules are deployed
- Verify user is authenticated
- Check indexes are created

### "Stripe webhook not firing"
- Check webhook URL is correct
- Verify webhook secret matches
- Check webhook signing in Stripe dashboard
- Test with Stripe CLI: `stripe listen --forward-to YOUR_URL`

### "Cloud Functions timing out"
- Check function timeout setting (default 60s, max 540s)
- Optimize slow queries
- Add indexes for complex queries

### "Scraper failing"
- Check scraper health logs in Firestore
- Verify source website hasn't changed structure
- Use manual CSV upload as fallback

### "High costs"
- Check Firestore usage (reads/writes)
- Add caching where possible
- Optimize queries to reduce document reads
- Consider Firestore quotas and limits

---

## Success Metrics

Track these in your analytics:

- **User Growth**: Signups per day/week
- **Conversion**: Free → Pro upgrade rate
- **Engagement**: Prop cards generated per user
- **Retention**: Day 7, Day 30 retention rates
- **Revenue**: MRR (Monthly Recurring Revenue)
- **Performance**: API response times, error rates

---

## Next Steps After Launch

1. **Announce**: Share on social media, Reddit, Twitter
2. **Collect Feedback**: Talk to early users, iterate
3. **Monitor**: Watch metrics, fix issues quickly
4. **Iterate**: Add requested features, improve UX
5. **Market**: Content marketing, SEO, partnerships

---

**Good luck with your launch! 🚀**
