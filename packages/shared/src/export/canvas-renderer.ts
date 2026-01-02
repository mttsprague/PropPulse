/**
 * Canvas Fallback Renderer
 * 
 * Lightweight PNG generation using node-canvas (no headless browser required)
 * Use as fallback when Playwright is not available or for batch processing
 */

import { createCanvas, registerFont, CanvasRenderingContext2D } from 'canvas';
import { PropCard } from '@proppulse/shared/prop-card';
import { ThemeMode, ViewMode, THEME_CONFIGS, ShareCardConfig } from '@proppulse/shared/export/types';
import { generateExportHash, generateVerificationId } from '@proppulse/shared/export/hash';

/**
 * Render prop card to PNG using node-canvas
 */
export async function renderWithCanvas(
  propCard: PropCard,
  theme: ThemeMode = 'LIGHT',
  viewMode: ViewMode = 'CASUAL'
): Promise<{ buffer: Buffer; hash: string; verificationId: string }> {
  const config = THEME_CONFIGS[theme];
  const { meta, summary, trend } = propCard;

  // Create canvas
  const canvas = createCanvas(config.width * 2, config.height * 2); // 2x scale
  const ctx = canvas.getContext('2d');

  // Apply 2x scale
  ctx.scale(2, 2);

  // Fill background
  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(0, 0, config.width, config.height);

  // Draw border
  ctx.strokeStyle = theme === 'DARK' ? '#374151' : '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, config.width, config.height);

  const isDark = theme === 'DARK';
  const isOver = meta.side === 'OVER';
  const sideColor = isOver ? '#22c55e' : '#ef4444';

  let y = config.padding;

  // Header - Player Name
  ctx.fillStyle = config.textColor;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(meta.playerName, config.padding, y + 28);
  y += 44;

  // Game Info
  ctx.fillStyle = isDark ? '#9ca3af' : '#6b7280';
  ctx.font = '16px sans-serif';
  const gameDate = new Date(meta.gameDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  ctx.fillText(
    `${meta.teamAbbr}${meta.opponentAbbr ? ` @ ${meta.opponentAbbr}` : ''} • ${gameDate}`,
    config.padding,
    y
  );
  y += 24;

  // Prop Badge
  const propText = `${meta.side} ${meta.line} ${meta.statType}`;
  ctx.font = 'bold 20px sans-serif';
  const propTextWidth = ctx.measureText(propText).width;
  
  ctx.fillStyle = sideColor;
  roundRect(ctx, config.padding, y - 20, propTextWidth + 32, 36, 8);
  
  ctx.fillStyle = '#ffffff';
  ctx.fillText(propText, config.padding + 16, y);
  y += 32;

  // Hit Rates Section
  y += 16;
  ctx.fillStyle = config.textColor;
  ctx.font = '600 16px sans-serif';
  ctx.fillText('Hit Rates', config.padding, y);
  y += 24;

  const cardWidth = (config.width - config.padding * 2 - 24) / 3;
  const formatHitRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  // Hit Rate Cards
  const hitRates = [
    { label: 'Last 10', ...summary.last10 },
    { label: 'Last 20', ...summary.last20 },
    { label: 'Season', ...summary.season },
  ];

  hitRates.forEach((hr, i) => {
    const x = config.padding + i * (cardWidth + 12);
    
    // Card background
    ctx.fillStyle = isDark ? '#374151' : '#f3f4f6';
    roundRect(ctx, x, y, cardWidth, 80, 8);

    // Label
    ctx.fillStyle = isDark ? '#9ca3af' : '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(hr.label, x + cardWidth / 2, y + 16);

    // Hit rate value
    ctx.fillStyle = sideColor;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(formatHitRate(hr.hitRate), x + cardWidth / 2, y + 44);

    // Record
    ctx.fillStyle = config.textColor;
    ctx.font = '12px sans-serif';
    const record = `${hr.wins}-${hr.losses}${hr.pushes > 0 ? ` (${hr.pushes}P)` : ''}`;
    ctx.fillText(record, x + cardWidth / 2, y + 64);
  });

  ctx.textAlign = 'left';
  y += 100;

  // Recent Games Section
  ctx.fillStyle = config.textColor;
  ctx.font = '600 16px sans-serif';
  ctx.fillText('Recent Games', config.padding, y);
  y += 24;

  const gameCardWidth = (config.width - config.padding * 2 - 32) / 5;
  
  trend.last5GameLogs.slice(0, 5).forEach((log, i) => {
    const x = config.padding + i * (gameCardWidth + 8);
    const outcomeColor =
      log.outcome === 'WIN' ? '#22c55e' : log.outcome === 'LOSS' ? '#ef4444' : '#9ca3af';

    // Card background
    ctx.fillStyle = isDark ? '#1f2937' : '#f9fafb';
    roundRect(ctx, x, y, gameCardWidth, 48, 6);

    // Border
    ctx.strokeStyle = outcomeColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, gameCardWidth, 48);
    ctx.lineWidth = 1;

    // Stat value
    ctx.fillStyle = outcomeColor;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(log.statValue.toString(), x + gameCardWidth / 2, y + 24);

    // Minutes
    ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${log.minutes}m`, x + gameCardWidth / 2, y + 38);
  });

  ctx.textAlign = 'left';
  y += 68;

  // Key Insights Section
  ctx.fillStyle = config.textColor;
  ctx.font = '600 16px sans-serif';
  ctx.fillText('Key Insights', config.padding, y);
  y += 24;

  // Insights box
  ctx.fillStyle = isDark ? '#374151' : '#f3f4f6';
  const insightsHeight = summary.quickInsights.length * 28 + 8;
  roundRect(ctx, config.padding, y, config.width - config.padding * 2, insightsHeight, 8);

  y += 20;
  ctx.fillStyle = config.textColor;
  ctx.font = '13px sans-serif';

  summary.quickInsights.forEach((insight, i) => {
    // Bullet
    ctx.fillStyle = config.accentColor;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('•', config.padding + 12, y);

    // Insight text
    ctx.fillStyle = config.textColor;
    ctx.font = '13px sans-serif';
    
    // Word wrap
    const words = insight.split(' ');
    let line = '';
    let lineY = y;
    const maxWidth = config.width - config.padding * 2 - 32;
    
    words.forEach((word) => {
      const testLine = line + word + ' ';
      const testWidth = ctx.measureText(testLine).width;
      
      if (testWidth > maxWidth && line.length > 0) {
        ctx.fillText(line, config.padding + 28, lineY);
        line = word + ' ';
        lineY += 20;
      } else {
        line = testLine;
      }
    });
    
    ctx.fillText(line, config.padding + 28, lineY);
    y += 28;
  });

  // Footer
  y = config.height - config.padding - 50;
  
  // Border line
  ctx.strokeStyle = isDark ? '#374151' : '#e5e7eb';
  ctx.beginPath();
  ctx.moveTo(config.padding, y);
  ctx.lineTo(config.width - config.padding, y);
  ctx.stroke();
  
  y += 16;

  // Watermark and Verification ID
  ctx.fillStyle = config.accentColor;
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('PropPulse', config.padding, y);

  const hash = generateExportHash(propCard, viewMode, theme);
  const verificationId = generateVerificationId(hash);

  ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`ID: ${verificationId}`, config.width - config.padding, y);
  ctx.textAlign = 'left';
  
  y += 14;

  // Disclaimer
  ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af';
  ctx.font = '10px sans-serif';
  wrapText(ctx, meta.disclaimer, config.padding, y, config.width - config.padding * 2, 14);
  
  y += 18;

  // Timestamp
  ctx.fillStyle = isDark ? '#4b5563' : '#d1d5db';
  ctx.font = '10px sans-serif';
  const timestamp = `Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`;
  ctx.fillText(timestamp, config.padding, y);

  // Convert to buffer
  const buffer = canvas.toBuffer('image/png');

  return {
    buffer,
    hash,
    verificationId,
  };
}

/**
 * Draw rounded rectangle
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Wrap text to multiple lines
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(' ');
  let line = '';
  let lineY = y;

  words.forEach((word) => {
    const testLine = line + word + ' ';
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && line.length > 0) {
      ctx.fillText(line, x, lineY);
      line = word + ' ';
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  });

  ctx.fillText(line, x, lineY);
}

/**
 * Express endpoint for canvas rendering
 */
export async function handleCanvasRenderRequest(req: any, res: any) {
  try {
    const { propCard, theme = 'LIGHT', viewMode = 'CASUAL' } = req.body;

    if (!propCard) {
      res.status(400).json({ error: 'Missing propCard' });
      return;
    }

    const { buffer, hash, verificationId } = await renderWithCanvas(propCard, theme, viewMode);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Export-Hash', hash);
    res.setHeader('X-Verification-ID', verificationId);
    res.send(buffer);
  } catch (error) {
    console.error('Canvas render error:', error);
    res.status(500).json({
      error: 'Rendering failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
