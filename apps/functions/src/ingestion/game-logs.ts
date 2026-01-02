import * as admin from 'firebase-admin';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PlayerGameStat } from '@proppulse/shared';

const db = admin.firestore();
const storage = admin.storage();

/**
 * Ingest daily game logs
 * 
 * This function scrapes player game stats from Basketball-Reference or ESPN.
 * It's designed to run daily after games are completed.
 * 
 * Production implementation:
 * 1. Scrape Basketball-Reference game logs
 * 2. Parse player stats (minutes, PTS, REB, AST, etc.)
 * 3. Store in Firestore with deduplication
 * 4. Cache raw HTML in Cloud Storage
 * 5. Update player aggregates
 */
export async function ingestDailyGameLogs(dateRange?: { start: string; end: string }): Promise<void> {
  console.log('Starting daily game logs ingestion...');

  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const targetDate = dateRange?.start || yesterday;

    // In production, this would:
    // 1. Fetch games from previous day
    // 2. For each game, scrape box scores
    // 3. Parse player stats
    
    /*
    Example Basketball-Reference scraping approach:
    
    const gamesResponse = await axios.get(
      `https://www.basketball-reference.com/leagues/NBA_2026_games-${formatMonth(targetDate)}.html`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PropPulse/1.0)' },
        timeout: 10000,
      }
    );

    const $ = cheerio.load(gamesResponse.data);
    const gameLinks: string[] = [];

    $('table#schedule tbody tr').each((i, row) => {
      const date = $(row).find('[data-stat="date_game"]').text();
      if (date === targetDate) {
        const boxScoreLink = $(row).find('[data-stat="box_score_text"] a').attr('href');
        if (boxScoreLink) {
          gameLinks.push(`https://www.basketball-reference.com${boxScoreLink}`);
        }
      }
    });

    // For each game, scrape box score
    for (const gameLink of gameLinks) {
      await scrapeGameBoxScore(gameLink, targetDate);
      await sleep(2000); // Rate limiting
    }
    */

    await logScraperHealth('game-logs', 'success', `Game logs ingestion completed for ${targetDate} (manual mode for MVP)`);
    console.log('Daily game logs ingestion completed');
  } catch (error: any) {
    console.error('Error in game logs ingestion:', error);
    await logScraperHealth('game-logs', 'error', error.message);
    throw error;
  }
}

async function scrapeGameBoxScore(gameUrl: string, date: string): Promise<void> {
  try {
    const response = await axios.get(gameUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PropPulse/1.0)' },
      timeout: 10000,
    });

    // Cache raw HTML in Cloud Storage
    const bucket = storage.bucket();
    const cacheFile = bucket.file(`scraper-cache/games/${date}/${Date.now()}.html`);
    await cacheFile.save(response.data, { metadata: { contentType: 'text/html' } });

    const $ = cheerio.load(response.data);

    // Parse both team box scores
    $('table.stats_table').each((i, table) => {
      const tableName = $(table).attr('id');
      
      // Only process basic and advanced box scores
      if (!tableName?.includes('box-')) return;

      $(table).find('tbody tr').each((j, row) => {
        const playerName = $(row).find('[data-stat="player"]').text().trim();
        if (!playerName || playerName === 'Reserves' || playerName === 'Team Totals') return;

        const minutes = parseMinutes($(row).find('[data-stat="mp"]').text());
        const pts = parseInt($(row).find('[data-stat="pts"]').text()) || 0;
        const reb = parseInt($(row).find('[data-stat="trb"]').text()) || 0;
        const ast = parseInt($(row).find('[data-stat="ast"]').text()) || 0;
        const started = $(row).find('[data-stat="reason"]').text().trim() === '';

        // Store in Firestore (simplified - would need playerId lookup)
        // This is a placeholder structure
        const stat: Partial<PlayerGameStat> = {
          // playerId: lookupPlayerId(playerName),
          // gameId: extractGameId(gameUrl),
          date,
          minutes,
          pts,
          reb,
          ast,
          started,
          // homeAway: determineHomeAway(),
          // opponentTeamId: getOpponentTeamId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Would store with: db.collection('playerGameStats').doc(statId).set(stat)
      });
    });
  } catch (error) {
    console.error(`Error scraping game ${gameUrl}:`, error);
    throw error;
  }
}

function parseMinutes(minutesStr: string): number {
  if (!minutesStr) return 0;
  const parts = minutesStr.split(':');
  return parseInt(parts[0]) + (parts[1] ? parseInt(parts[1]) / 60 : 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function logScraperHealth(
  scraperName: string,
  status: 'success' | 'warning' | 'error',
  message: string
) {
  await db.collection('scraperHealth').add({
    scraperName,
    status,
    message,
    lastRunAt: new Date().toISOString(),
  });
}

/**
 * Manual CSV upload handler
 * Provides fallback when scraping fails
 */
export async function ingestManualCSV(csvData: string): Promise<void> {
  // Parse CSV and import data
  // Implementation would use Papa Parse to parse CSV
  // Then batch write to Firestore
  console.log('Manual CSV import initiated');
}
