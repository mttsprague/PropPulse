/**
 * Server-side Rendering Service (Playwright)
 * 
 * Cloud Run service for generating PNG exports using headless browser
 * Use when client-side rendering fails or for batch processing
 */

import express from 'express';
import { chromium, Browser } from 'playwright';
import { PropCard } from '@proppulse/shared/prop-card';
import { ThemeMode, ViewMode, THEME_CONFIGS } from '@proppulse/shared/export/types';
import { generateExportHash, generateVerificationId } from '@proppulse/shared/export/hash';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Global browser instance (reused across requests)
let browser: Browser | null = null;

/**
 * Initialize browser on startup
 */
async function initBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return browser;
}

/**
 * Generate HTML template for share card
 */
function generateShareCardHTML(
  propCard: PropCard,
  theme: ThemeMode,
  verificationId?: string
): string {
  const config = THEME_CONFIGS[theme];
  const { meta, summary, trend } = propCard;
  const isOver = meta.side === 'OVER';
  const sideColor = isOver ? '#22c55e' : '#ef4444';
  
  const gameDate = new Date(meta.gameDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formatHitRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;
  const isDark = theme === 'DARK';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: transparent;
    }
    .card {
      width: ${config.width}px;
      height: ${config.height}px;
      background-color: ${config.backgroundColor};
      color: ${config.textColor};
      padding: ${config.padding}px;
      border: 1px solid ${isDark ? '#374151' : '#e5e7eb'};
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header { margin-bottom: 16px; }
    .player-name { font-size: 28px; font-weight: 700; line-height: 1.2; }
    .game-info { font-size: 16px; color: ${isDark ? '#9ca3af' : '#6b7280'}; margin: 8px 0 12px; }
    .prop-badge {
      display: inline-block;
      background-color: ${sideColor};
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 20px;
      font-weight: 700;
    }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .hit-rates { display: flex; gap: 12px; }
    .hit-rate-card {
      flex: 1;
      background-color: ${isDark ? '#374151' : '#f3f4f6'};
      padding: 12px;
      border-radius: 8px;
      text-align: center;
    }
    .hit-rate-label { font-size: 12px; color: ${isDark ? '#9ca3af' : '#6b7280'}; margin-bottom: 4px; }
    .hit-rate-value { font-size: 24px; font-weight: 700; color: ${sideColor}; }
    .hit-rate-record { font-size: 12px; margin-top: 4px; }
    .games { display: flex; gap: 8px; }
    .game-card {
      flex: 1;
      background-color: ${isDark ? '#1f2937' : '#f9fafb'};
      padding: 8px;
      border-radius: 6px;
      text-align: center;
    }
    .game-value { font-size: 18px; font-weight: 700; }
    .game-minutes { font-size: 10px; color: ${isDark ? '#6b7280' : '#9ca3af'}; margin-top: 2px; }
    .insights-box {
      background-color: ${isDark ? '#374151' : '#f3f4f6'};
      padding: 12px;
      border-radius: 8px;
    }
    .insight { font-size: 13px; line-height: 1.6; margin-bottom: 8px; display: flex; gap: 8px; }
    .insight:last-child { margin-bottom: 0; }
    .bullet { color: ${config.accentColor}; font-weight: 700; }
    .footer {
      border-top: 1px solid ${isDark ? '#374151' : '#e5e7eb'};
      padding-top: 12px;
    }
    .footer-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .watermark { font-size: 18px; font-weight: 700; color: ${config.accentColor}; }
    .verification-id {
      font-size: 11px;
      color: ${isDark ? '#6b7280' : '#9ca3af'};
      font-family: monospace;
    }
    .disclaimer {
      font-size: 10px;
      color: ${isDark ? '#6b7280' : '#9ca3af'};
      line-height: 1.4;
    }
    .timestamp {
      font-size: 10px;
      color: ${isDark ? '#4b5563' : '#d1d5db'};
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="player-name">${meta.playerName}</h1>
      <div class="game-info">${meta.teamAbbr}${meta.opponentAbbr ? ` @ ${meta.opponentAbbr}` : ''} • ${gameDate}</div>
      <div class="prop-badge">${meta.side} ${meta.line} ${meta.statType}</div>
    </div>

    <div class="section">
      <div class="section-title">Hit Rates</div>
      <div class="hit-rates">
        <div class="hit-rate-card">
          <div class="hit-rate-label">Last 10</div>
          <div class="hit-rate-value">${formatHitRate(summary.last10.hitRate)}</div>
          <div class="hit-rate-record">${summary.last10.wins}-${summary.last10.losses}${summary.last10.pushes > 0 ? ` (${summary.last10.pushes}P)` : ''}</div>
        </div>
        <div class="hit-rate-card">
          <div class="hit-rate-label">Last 20</div>
          <div class="hit-rate-value">${formatHitRate(summary.last20.hitRate)}</div>
          <div class="hit-rate-record">${summary.last20.wins}-${summary.last20.losses}${summary.last20.pushes > 0 ? ` (${summary.last20.pushes}P)` : ''}</div>
        </div>
        <div class="hit-rate-card">
          <div class="hit-rate-label">Season</div>
          <div class="hit-rate-value">${formatHitRate(summary.season.hitRate)}</div>
          <div class="hit-rate-record">${summary.season.wins}-${summary.season.losses}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Recent Games</div>
      <div class="games">
        ${trend.last5GameLogs
          .slice(0, 5)
          .map((log) => {
            const outcomeColor =
              log.outcome === 'WIN' ? '#22c55e' : log.outcome === 'LOSS' ? '#ef4444' : '#9ca3af';
            return `
              <div class="game-card" style="border: 2px solid ${outcomeColor};">
                <div class="game-value" style="color: ${outcomeColor};">${log.statValue}</div>
                <div class="game-minutes">${log.minutes}m</div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Key Insights</div>
      <div class="insights-box">
        ${summary.quickInsights
          .map(
            (insight) => `
          <div class="insight">
            <span class="bullet">•</span>
            <span>${insight}</span>
          </div>
        `
          )
          .join('')}
      </div>
    </div>

    <div class="footer">
      <div class="footer-top">
        <div class="watermark">PropPulse</div>
        ${verificationId ? `<div class="verification-id">ID: ${verificationId}</div>` : ''}
      </div>
      <div class="disclaimer">${meta.disclaimer}</div>
      <div class="timestamp">Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * POST /render
 * 
 * Render a prop card to PNG
 */
app.post('/render', async (req, res) => {
  try {
    const { propCard, theme = 'LIGHT', viewMode = 'CASUAL' } = req.body;

    if (!propCard) {
      res.status(400).json({ error: 'Missing propCard' });
      return;
    }

    // Generate hash and verification ID
    const hash = generateExportHash(propCard, viewMode, theme);
    const verificationId = generateVerificationId(hash);

    // Initialize browser
    const browserInstance = await initBrowser();
    const context = await browserInstance.newContext({
      viewport: {
        width: THEME_CONFIGS[theme].width,
        height: THEME_CONFIGS[theme].height,
      },
      deviceScaleFactor: 2, // 2x for high quality
    });

    const page = await context.newPage();

    // Generate and set HTML content
    const html = generateShareCardHTML(propCard, theme, verificationId);
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    });

    // Clean up
    await context.close();

    // Return PNG as buffer
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', screenshot.length);
    res.setHeader('X-Export-Hash', hash);
    res.setHeader('X-Verification-ID', verificationId);
    res.send(screenshot);
  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({
      error: 'Rendering failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /health
 * 
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', browser: browser ? 'initialized' : 'not-initialized' });
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing browser...');
  if (browser) {
    await browser.close();
    browser = null;
  }
  process.exit(0);
});

/**
 * Start server
 */
const PORT = process.env.PORT || 8080;

app.listen(PORT, async () => {
  console.log(`Server-side render service listening on port ${PORT}`);
  
  // Initialize browser on startup
  try {
    await initBrowser();
    console.log('Browser initialized');
  } catch (error) {
    console.error('Failed to initialize browser:', error);
  }
});

export default app;
