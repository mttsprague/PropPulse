import { PropCardData, EXPORT_CONFIG } from '@proppulse/shared';

/**
 * Generate a PNG image from prop card data
 * 
 * This is a simplified implementation that generates a basic HTML representation.
 * For production, you would use Puppeteer or a similar tool to render HTML to PNG.
 * 
 * To use Puppeteer in Cloud Functions:
 * 1. Install: npm install puppeteer
 * 2. Use bundled Chromium or specify executablePath
 * 3. Launch in no-sandbox mode for Cloud Functions environment
 */
export async function generatePropCardImage(propCardData: PropCardData): Promise<Buffer> {
  // For MVP, we'll generate a simple HTML string and convert it
  // In production, implement actual HTML-to-PNG conversion with Puppeteer
  
  const html = generatePropCardHTML(propCardData);
  
  // TODO: Use Puppeteer to render HTML to PNG
  // For now, return a placeholder buffer
  // This would be replaced with actual Puppeteer implementation:
  /*
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: EXPORT_CONFIG.maxExportWidth,
    height: EXPORT_CONFIG.maxExportHeight,
  });
  await page.setContent(html);
  const screenshot = await page.screenshot({ type: 'png' });
  await browser.close();
  return screenshot as Buffer;
  */
  
  // Placeholder: Return empty buffer (implement with Puppeteer in production)
  return Buffer.from(html);
}

function generatePropCardHTML(data: PropCardData): string {
  const { player, statType, line, overUnder, hitRates, recentTrend, insights, context } = data;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px;
      width: ${EXPORT_CONFIG.maxExportWidth}px;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #667eea;
      padding-bottom: 20px;
    }
    .player-name {
      font-size: 42px;
      font-weight: 800;
      color: #1a202c;
      margin-bottom: 8px;
    }
    .prop-line {
      font-size: 32px;
      font-weight: 600;
      color: #667eea;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 30px 0;
    }
    .stat-box {
      background: #f7fafc;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .stat-label {
      font-size: 14px;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: #2d3748;
    }
    .stat-detail {
      font-size: 12px;
      color: #a0aec0;
      margin-top: 4px;
    }
    .insights {
      margin: 30px 0;
    }
    .insights-title {
      font-size: 20px;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 15px;
    }
    .insight {
      background: #edf2f7;
      border-left: 4px solid #667eea;
      padding: 12px 16px;
      margin-bottom: 10px;
      border-radius: 4px;
      font-size: 14px;
      color: #2d3748;
    }
    .context-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 20px 0;
    }
    .badge {
      background: #fed7d7;
      color: #c53030;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
    }
    .watermark {
      font-size: 24px;
      font-weight: 800;
      color: #667eea;
      margin-bottom: 8px;
    }
    .disclaimer {
      font-size: 10px;
      color: #a0aec0;
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="player-name">${player.name}</div>
      <div class="prop-line">${overUnder}${line} ${statType}</div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-label">Last 10</div>
        <div class="stat-value">${hitRates.last10.hitRate.toFixed(0)}%</div>
        <div class="stat-detail">${hitRates.last10.wins}-${hitRates.last10.losses}-${hitRates.last10.pushes}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Last 20</div>
        <div class="stat-value">${hitRates.last20.hitRate.toFixed(0)}%</div>
        <div class="stat-detail">${hitRates.last20.wins}-${hitRates.last20.losses}-${hitRates.last20.pushes}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Season</div>
        <div class="stat-value">${hitRates.season.hitRate.toFixed(0)}%</div>
        <div class="stat-detail">${hitRates.season.wins}-${hitRates.season.losses}-${hitRates.season.pushes}</div>
      </div>
    </div>
    
    ${context.isBackToBack || context.injuredTeammates.length > 0 ? `
    <div class="context-badges">
      ${context.isBackToBack ? '<div class="badge">⚠️ BACK-TO-BACK</div>' : ''}
      ${context.injuredTeammates.length > 0 ? `<div class="badge">🏥 ${context.injuredTeammates.length} TEAMMATE(S) OUT</div>` : ''}
    </div>
    ` : ''}
    
    <div class="insights">
      <div class="insights-title">Key Insights</div>
      ${insights.map(insight => `<div class="insight">• ${insight}</div>`).join('')}
    </div>
    
    <div class="footer">
      <div class="watermark">${EXPORT_CONFIG.watermarkText}</div>
      <div class="disclaimer">${EXPORT_CONFIG.disclaimerText}</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
