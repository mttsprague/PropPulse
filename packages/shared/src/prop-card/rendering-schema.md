# Prop Card Rendering Schema

Frontend implementation guide for displaying prop research cards across web, mobile, and bot platforms.

## Overview

This document provides **recommended layout, formatting, and UI patterns** for rendering PropCard data. The schema is platform-agnostic but includes specific suggestions for Web (Next.js/React) and Mobile (Expo/React Native).

## Design Principles

1. **Progressive Disclosure**: Show casual summary first, expand to pro analytics on demand
2. **Data Density**: Balance information richness with readability
3. **Trust Signals**: Emphasize sample sizes, disclaimers, and data quality warnings
4. **Neutral Tone**: No betting advice, no recommendation language
5. **Mobile-First**: Design for small screens, scale up to desktop

## View Modes

### Casual View (Default)

**Target audience**: Quick research, mobile users

**Content**:
- Meta (player, stat, line, side, date)
- Summary hit rates (last 10, last 20, season)
- Quick insights (3 bullets)
- Last 5 game logs (compact)
- Disclaimer

**Layout**: Single column, ~600-800px max width

### Pro View (Expanded)

**Target audience**: Deep research, power users

**Content**: All casual content plus:
- Splits (home/away, rest days)
- Distribution histogram
- Volatility & line sensitivity scores
- Minutes stability analysis
- Injury context
- Schedule context
- Debug info (if available)

**Layout**: Multi-column on desktop, stacked on mobile

---

## Component Breakdown

### 1. Header Section

#### Meta Information

```
┌─────────────────────────────────────────────────┐
│ [Player Headshot]  Anthony Edwards              │
│                    MIN @ LAL                     │
│                    Jan 15, 2025                  │
│                                                  │
│  OVER 26.5 Points                                │
│  [Green Up Arrow if trending UP]                │
└─────────────────────────────────────────────────┘
```

**Fields**:
- `meta.playerName`
- `meta.teamAbbr` @ `meta.opponentAbbr` (or just team if no opponent)
- `meta.gameDate` (formatted: "Jan 15, 2025")
- `meta.side` + `meta.line` + `meta.statType`
- `trend.trendDirection` (icon indicator)

**Colors**:
- OVER: Green accent (#22c55e)
- UNDER: Red accent (#ef4444)
- Side badge: background color based on side

**Icons**:
- Trend UP: ↗️ or trending-up icon (green)
- Trend DOWN: ↘️ or trending-down icon (red)
- Trend FLAT: → or minus icon (gray)

---

### 2. Summary Cards (Casual View)

#### Hit Rate Summary

```
┌───────────────┬───────────────┬───────────────┐
│   Last 10     │   Last 20     │    Season     │
│                                                │
│   7-2 (1P)    │   14-5 (1P)   │   28-10 (2P)  │
│   77.8%       │   73.7%       │   73.7%       │
│   Avg: 28.5   │   Avg: 28.2   │   Avg: 28.0   │
└───────────────┴───────────────┴───────────────┘
```

**Fields per window**:
- `summary.{last10|last20|season}.wins` - `summary.{...}.losses` (`summary.{...}.pushes`P)
- `summary.{...}.hitRate` (formatted as %)
- `summary.{...}.avg` (formatted to 1 decimal)

**Formatting**:
- Win-loss record: `7-2` (bold)
- Pushes: `(1P)` (gray, smaller font)
- Hit rate: Large percentage (32-36px font)
- Avg: Smaller text (14px)

**Color coding**:
- Hit rate >= 70%: Green
- Hit rate 50-70%: Yellow/Orange
- Hit rate < 50%: Red
- Neutral gray background for cards

---

### 3. Quick Insights (Casual View)

```
💡 Key Insights
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The OVER hit 7/9 in the last 10 games (1 push).

• Trending up recently with an average gain of 0.5 per 
  game. Results correlate strongly with playing time 
  (avg 34.6 min).

• Results show moderate volatility with a standard 
  deviation of 3.5.
```

**Fields**:
- `summary.quickInsights[0]`
- `summary.quickInsights[1]`
- `summary.quickInsights[2]`

**Formatting**:
- Bullet list (•) or numbered list (1, 2, 3)
- 16px font, line-height 1.6
- Light gray background (#f3f4f6)
- Padding: 16px

**Icons** (optional):
- 💡 Lightbulb for section header
- 📊 Chart icon for trend insight
- ⚠️ Warning icon if low sample size mentioned

---

### 4. Recent Game Logs (Casual View)

```
Recent Games
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date       Opp    Min   Stat   Result
Jan 10     GSW    35    30     ✓ WIN
Jan 08     BOS    34    28     ✓ WIN
Jan 06     PHX    36    25     ✗ LOSS
Jan 04     DEN    33    29     ✓ WIN
Jan 02     LAC    35    27     ✗ LOSS
```

**Fields** (from `trend.last5GameLogs`):
- `date` (formatted: "Jan 10")
- `opponent` (team abbreviation)
- `minutes` (integer)
- `statValue` (1 decimal)
- `outcome` (WIN/LOSS/PUSH)

**Formatting**:
- Table or card layout
- Mobile: Stack as cards instead of table
- WIN: Green checkmark (✓) + green text
- LOSS: Red X (✗) + red text
- PUSH: Gray dash (—) + gray text
- Home games: Add (H) next to opponent
- Away games: Add (@) before opponent

**Visual enhancements**:
- Bold row if outcome is WIN
- Lighter text if outcome is LOSS
- Highlight row if minutes significantly different from average

---

### 5. Trend Chart (Casual View, Optional)

**Line chart**:
- X-axis: Last 10 games (dates from `trend.rollingAvgLast10`)
- Y-axis: Stat value
- Line: Rolling average
- Horizontal line: The line value (`meta.line`)

**Chart library suggestions**:
- Web: recharts, chart.js, or visx
- Mobile: react-native-svg-charts or victory-native

**Styling**:
- Line color: Blue (#3b82f6)
- Line value: Dashed red line
- Fill area under curve: Light blue gradient
- Data points: Circles on line

---

## Pro View Extensions

### 6. Splits Table

```
Splits
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Split          Record     Hit Rate   Avg
Home           8-2        80.0%      29.0
Away           6-3-1      66.7%      27.4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Back-to-back   1-2        33.3%      25.0
1 day rest     7-3        70.0%      28.0
2+ days rest   6-0-1      100.0%     30.0
```

**Fields** (from `pro.splits`):
- `home`, `away`, `rest0`, `rest1`, `rest2plus`
- Each has `wins`, `losses`, `pushes`, `hitRate`, `avg`

**Formatting**:
- Table with 4 columns
- Highlight best-performing split (highest hit rate)
- Color code hit rates (green/yellow/red)

---

### 7. Distribution Histogram

```
Distribution (Last 20 Games)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
20-23  ██
23-26  ████
26-29  ████████ [LINE: 26.5]
29-32  █████
32-35  ██

Mean: 28.2  |  Std Dev: 3.5  |  Volatility: 45/100
```

**Fields** (from `pro.distribution`):
- `buckets` (array of `{label, count}`)
- `mean`
- `stdDev`
- `volatilityScore`

**Formatting**:
- Horizontal bar chart
- Bars: Gray (#9ca3af)
- Highlight bucket containing line: Blue (#3b82f6)
- Line marker: Vertical line or arrow at line value
- Stats below: Mean, Std Dev, Volatility score

**Volatility indicator**:
- 0-60: 🟢 Low volatility
- 60-90: 🟡 Medium volatility
- 90-100: 🔴 High volatility

---

### 8. Sensitivity Meters

```
Line Sensitivity
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Near Line Rate: 25.0%  [█████░░░░░░░░░░] 25/100
Push Rate:       5.0%  [█░░░░░░░░░░░░░░] 5/100
Sensitivity:    20/100 [████░░░░░░░░░░░] LOW
```

**Fields** (from `pro.sensitivity`):
- `nearLineRate` (convert to %)
- `pushRate` (convert to %)
- `lineSensitivityScore`

**Formatting**:
- Progress bars (0-100 scale)
- Low sensitivity (0-30): Green
- Medium sensitivity (30-60): Yellow
- High sensitivity (60-100): Red

---

### 9. Minutes Stability

```
Minutes Stability
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Std Dev: 2.5 min  |  Stability: 75/100 [HIGH]

[Line chart: Last 5 games minutes]

⚠ Reliability Notes:
• None (minutes stable)
```

**Fields** (from `pro.stability`):
- `minutesStdDevLast10`
- `minutesStabilityScore`
- `reliabilityNotes` (array of strings)

**Formatting**:
- Stability score bar (0-100)
  - 80-100: Green (HIGH)
  - 50-80: Yellow (MEDIUM)
  - 0-50: Red (LOW)
- Line chart: `trend.minutesLast5`
- Reliability notes: Bullet list with warning icon if present

---

### 10. Context Section

```
Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏀 Schedule: Back-to-back game (0 days rest)
    Last game: Jan 13, 2025

🏥 Injury Report:
    Anthony Edwards: QUESTIONABLE (ankle)
    Rudy Gobert: OUT (illness)
    
    Last updated: Jan 14, 2025 12:00 PM CT
```

**Fields** (from `context`):
- `scheduleContext.backToBack`
- `scheduleContext.restDays`
- `scheduleContext.lastGameDate`
- `injuryStatus.player.status`
- `injuryStatus.player.notes`
- `injuryStatus.teammatesOut` (array)

**Formatting**:
- Icon-based sections (🏀 schedule, 🏥 injury)
- Injury status badge:
  - OUT: Red badge
  - QUESTIONABLE: Yellow badge
  - PROBABLE: Green badge
  - DOUBTFUL: Orange badge
- Teammates out: Bullet list

---

### 11. Debug Info (Optional, Dev Mode)

```
⚙️ Debug Info
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sample Size Notes:
• Limited sample: only 8 games available

Data Quality Warnings:
• 2 games with < 10 minutes played
```

**Fields** (from `debug`):
- `sampleSizeNotes` (array)
- `dataQualityWarnings` (array)

**Formatting**:
- Collapsible section (hidden by default)
- Yellow/orange background
- Warning icon (⚠️)
- Only show if `debug` field exists

---

### 12. Disclaimer Footer

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ⓘ This is a research tool for informational purposes 
  only. Not betting advice. PropPulse does not 
  recommend, endorse, or guarantee outcomes. Past 
  performance does not predict future results.

Generated: Jan 14, 2025 3:45 PM CT
```

**Fields**:
- `meta.disclaimer`
- `meta.generatedAt` (formatted timestamp)

**Formatting**:
- Small text (12px)
- Gray color (#6b7280)
- Border top: 1px solid gray
- Padding: 16px

---

## Color Palette

### Primary Colors

```css
--green:       #22c55e  /* OVER, positive outcomes */
--red:         #ef4444  /* UNDER, negative outcomes */
--blue:        #3b82f6  /* Neutral, charts */
--gray:        #6b7280  /* Text secondary */
--gray-light:  #f3f4f6  /* Backgrounds */
--gray-dark:   #1f2937  /* Text primary */
```

### Outcome Colors

```css
--win:         #22c55e
--loss:        #ef4444
--push:        #9ca3af
```

### Score Indicators

```css
--score-high:  #22c55e  /* >= 70 */
--score-mid:   #f59e0b  /* 40-70 */
--score-low:   #ef4444  /* < 40 */
```

---

## Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             Roboto, 'Helvetica Neue', Arial, sans-serif;
```

### Font Sizes

- **Hero (hit rate)**: 32-36px, bold
- **Section header**: 20-24px, semibold
- **Body text**: 16px, regular
- **Secondary text**: 14px, regular
- **Small text (disclaimer)**: 12px, regular

### Line Heights

- Hero: 1.2
- Headers: 1.3
- Body: 1.6
- Small: 1.4

---

## Icons Reference

Recommended icon library: [Lucide Icons](https://lucide.dev/) or [Heroicons](https://heroicons.com/)

- **Trend up**: `trending-up`, `arrow-up-right`
- **Trend down**: `trending-down`, `arrow-down-right`
- **Trend flat**: `minus`, `arrow-right`
- **Win**: `check`, `check-circle`
- **Loss**: `x`, `x-circle`
- **Push**: `minus-circle`
- **Info**: `info`, `alert-circle`
- **Warning**: `alert-triangle`
- **Schedule**: `calendar`, `clock`
- **Injury**: `activity`, `heart-pulse`
- **Home**: `home`
- **Away**: `plane`, `map-pin`
- **Debug**: `bug`, `settings`

---

## Responsive Breakpoints

### Mobile (<640px)

- Single column layout
- Stacked cards for hit rates
- Game logs as cards instead of table
- Hide pro view by default (show "Expand" button)
- Font sizes: -2px from desktop

### Tablet (640px - 1024px)

- 2-column layout for splits
- Side-by-side hit rate cards
- Game logs as compact table
- Pro view in expandable section

### Desktop (>1024px)

- Multi-column layout (2-3 columns)
- Side-by-side pro analytics
- Full charts and visualizations
- Sticky header on scroll

---

## Platform-Specific Notes

### Web (Next.js/React)

**Component structure**:

```tsx
<PropCard card={card}>
  <PropCardHeader meta={card.meta} trend={card.trend} />
  <PropCardSummary summary={card.summary} />
  <PropCardInsights insights={card.summary.quickInsights} />
  <PropCardGameLogs logs={card.trend.last5GameLogs} />
  
  {/* Pro view (collapsible) */}
  <PropCardProView pro={card.pro} context={card.context} />
  
  <PropCardDisclaimer meta={card.meta} />
</PropCard>
```

**Libraries**:
- Styling: Tailwind CSS
- Charts: Recharts
- Icons: Lucide React
- Animations: Framer Motion (optional)

### Mobile (Expo/React Native)

**Component structure**:

```tsx
<ScrollView>
  <PropCardHeader meta={card.meta} trend={card.trend} />
  <PropCardSummary summary={card.summary} />
  <PropCardInsights insights={card.summary.quickInsights} />
  <PropCardGameLogs logs={card.trend.last5GameLogs} />
  
  <Collapsible collapsed={!showPro}>
    <PropCardProView pro={card.pro} context={card.context} />
  </Collapsible>
  
  <PropCardDisclaimer meta={card.meta} />
</ScrollView>
```

**Libraries**:
- Styling: NativeWind or styled-components
- Charts: Victory Native or react-native-svg-charts
- Icons: @expo/vector-icons
- Collapsible: react-native-collapsible

### Discord Bot

**Text-based format** (use Discord embeds):

```
┌─ Anthony Edwards: OVER 26.5 Points ──┐
│                                        │
│ 🎯 Hit Rates                           │
│ Last 10:  7-2 (77.8%)                  │
│ Last 20: 14-5 (73.7%)                  │
│ Season:  28-10 (73.7%)                 │
│                                        │
│ 💡 Insights                            │
│ • The OVER hit 7/9 in last 10 games    │
│ • Trending up with +0.5/game           │
│ • Moderate volatility (std dev 3.5)    │
│                                        │
│ 📊 Recent Games                        │
│ Jan 10 vs GSW: 30 pts ✓                │
│ Jan 08 @ BOS: 28 pts ✓                 │
│ Jan 06 vs PHX: 25 pts ✗                │
│                                        │
│ 🔗 View Pro Analytics                  │
└────────────────────────────────────────┘
```

Use Discord embed colors:
- OVER: Green (#22c55e)
- UNDER: Red (#ef4444)

---

## Accessibility

- **Color contrast**: WCAG AA compliant (4.5:1 for normal text)
- **Alternative text**: Provide alt text for all icons
- **Keyboard navigation**: All interactive elements focusable
- **Screen readers**: Semantic HTML, ARIA labels where needed
- **Focus indicators**: Visible focus states (2px outline)

---

## Animation Suggestions

- **Card entrance**: Fade in + slide up (200ms)
- **Hit rate numbers**: Count up animation on mount
- **Chart rendering**: Animate line drawing (300ms)
- **Expand/collapse**: Smooth height transition (200ms)
- **Hover states**: Scale 1.02, box-shadow increase

Keep animations subtle and respect `prefers-reduced-motion`.

---

## Sample Implementation

See example implementations:
- Web: `/packages/web/components/PropCard/`
- Mobile: `/apps/mobile/components/PropCard/`
- Discord: `/apps/discord-bot/commands/prop.ts`

(Note: These are example paths, adjust to your project structure)

---

## Testing Checklist

- [ ] Renders all casual view fields correctly
- [ ] Expands to pro view on interaction
- [ ] Colors match outcome types (WIN/LOSS/PUSH)
- [ ] Hit rates calculate correctly (exclude pushes)
- [ ] Charts render with correct data
- [ ] Disclaimer always visible
- [ ] Mobile responsive (all breakpoints)
- [ ] Handles missing data gracefully (e.g., no opponent)
- [ ] Accessible (keyboard nav, screen reader)
- [ ] Respects reduced motion preference

---

## Questions?

For rendering questions or design feedback, contact the PropPulse frontend team.
