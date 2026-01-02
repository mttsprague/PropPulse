/**
 * Basketball-Reference Player Game Logs Scraper
 * 
 * Scrapes detailed game-by-game stats for NBA players
 */

import * as cheerio from 'cheerio';
import { fetchAndCache } from '../utils/fetch-and-cache';
import { sleep } from '../utils/rate-limiter';

const BASE_URL = 'https://www.basketball-reference.com';

export interface PlayerGameLogData {
  id: string; // {playerId}_{gameId}
  playerId: string;
  gameId: string;
  date: string;
  teamId: string;
  opponentTeamId: string;
  homeAway: 'home' | 'away';
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fg: number;
  fga: number;
  fg3: number;
  fg3a: number;
  ft: number;
  fta: number;
  pf: number;
  plusMinus?: number;
  updatedAt: number;
  createdAt: number;
}

/**
 * Parse minutes string (e.g., "35:24" → 35.4)
 */
function parseMinutes(minutesStr: string): number {
  if (!minutesStr || minutesStr === 'Did Not Play' || minutesStr === 'Inactive') {
    return 0;
  }

  const parts = minutesStr.split(':');
  if (parts.length !== 2) {
    return 0;
  }

  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  
  return minutes + seconds / 60;
}

/**
 * Parse stat value
 */
function parseStat(value: string): number {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse date from Basketball-Reference format
 */
function parseDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateStr}`);
    }
    return date.toISOString().split('T')[0];
  } catch (error) {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Scrape game log for a single player for a season
 */
export async function scrapePlayerGameLog(
  playerId: string,
  season: number = 2025
): Promise<PlayerGameLogData[]> {
  const url = `${BASE_URL}/players/${playerId.charAt(0)}/${playerId}/gamelog/${season}`;

  try {
    const html = await fetchAndCache(url, {
      cacheTTL: 3600, // 1 hour (game logs change frequently)
      scraperName: 'basketball-reference-game-logs',
    });

    const $ = cheerio.load(html);
    const gameLogs: PlayerGameLogData[] = [];

    // Find game log table
    const gameLogTable = $('#pgl_basic');

    if (!gameLogTable.length) {
      console.warn(`No game log table found for player ${playerId}`);
      return gameLogs;
    }

    gameLogTable.find('tbody tr').each((_, row) => {
      try {
        const $row = $(row);

        // Skip header rows and non-game rows
        if ($row.hasClass('thead') || $row.attr('id') === 'separator') {
          return;
        }

        const dateStr = $row.find('td[data-stat="date_game"]').text().trim();
        if (!dateStr) {
          return;
        }

        const date = parseDate(dateStr);

        const teamId = $row.find('td[data-stat="team_id"]').text().trim();
        const homeAway = $row.find('td[data-stat="game_location"]').text().trim() === '@' ? 'away' : 'home';
        const opponentTeamId = $row.find('td[data-stat="opp_id"]').text().trim();

        if (!teamId || !opponentTeamId) {
          console.warn(`Missing team data for ${playerId} on ${date}`);
          return;
        }

        const gameId = `${date}_${homeAway === 'away' ? teamId : opponentTeamId}_${homeAway === 'away' ? opponentTeamId : teamId}`;

        const minutesStr = $row.find('td[data-stat="mp"]').text().trim();
        const minutes = parseMinutes(minutesStr);

        // Skip games where player didn't play
        if (minutes === 0) {
          return;
        }

        const pts = parseStat($row.find('td[data-stat="pts"]').text());
        const reb = parseStat($row.find('td[data-stat="trb"]').text());
        const ast = parseStat($row.find('td[data-stat="ast"]').text());
        const stl = parseStat($row.find('td[data-stat="stl"]').text());
        const blk = parseStat($row.find('td[data-stat="blk"]').text());
        const tov = parseStat($row.find('td[data-stat="tov"]').text());
        const pf = parseStat($row.find('td[data-stat="pf"]').text());

        const fg = parseStat($row.find('td[data-stat="fg"]').text());
        const fga = parseStat($row.find('td[data-stat="fga"]').text());
        const fg3 = parseStat($row.find('td[data-stat="fg3"]').text());
        const fg3a = parseStat($row.find('td[data-stat="fg3a"]').text());
        const ft = parseStat($row.find('td[data-stat="ft"]').text());
        const fta = parseStat($row.find('td[data-stat="fta"]').text());

        const plusMinusStr = $row.find('td[data-stat="plus_minus"]').text().trim();
        const plusMinus = plusMinusStr ? parseInt(plusMinusStr, 10) : undefined;

        const now = Date.now();

        gameLogs.push({
          id: `${playerId}_${gameId}`,
          playerId,
          gameId,
          date,
          teamId,
          opponentTeamId,
          homeAway,
          minutes,
          pts,
          reb,
          ast,
          stl,
          blk,
          tov,
          fg,
          fga,
          fg3,
          fg3a,
          ft,
          fta,
          pf,
          plusMinus: !isNaN(plusMinus!) ? plusMinus : undefined,
          updatedAt: now,
          createdAt: now,
        });
      } catch (error: any) {
        console.error(`Error parsing game log row for ${playerId}:`, error.message);
      }
    });

    console.log(`Scraped ${gameLogs.length} game logs for player ${playerId}`);
    return gameLogs;
  } catch (error: any) {
    console.error(`Failed to scrape game log for ${playerId}:`, error.message);
    throw error;
  }
}

/**
 * Scrape game logs for multiple players
 */
export async function scrapePlayerGameLogs(
  playerIds: string[],
  season: number = 2025
): Promise<PlayerGameLogData[]> {
  const allGameLogs: PlayerGameLogData[] = [];

  console.log(`Scraping game logs for ${playerIds.length} players...`);

  for (let i = 0; i < playerIds.length; i++) {
    const playerId = playerIds[i];
    
    try {
      console.log(`[${i + 1}/${playerIds.length}] Scraping ${playerId}...`);
      
      const gameLogs = await scrapePlayerGameLog(playerId, season);
      allGameLogs.push(...gameLogs);

      // Respectful delay between player requests
      await sleep(3000); // 3 seconds
    } catch (error: any) {
      console.error(`Failed to scrape game logs for ${playerId}:`, error.message);
      // Continue with other players
    }
  }

  console.log(`Scraped ${allGameLogs.length} total game logs`);
  return allGameLogs;
}

/**
 * Scrape game logs for a specific date range
 * This requires getting player IDs first, then scraping their logs
 */
export async function scrapeGameLogsForDateRange(
  playerIds: string[],
  startDate: string,
  endDate: string,
  season: number = 2025
): Promise<PlayerGameLogData[]> {
  const allGameLogs = await scrapePlayerGameLogs(playerIds, season);

  // Filter by date range
  const filtered = allGameLogs.filter((log) => {
    return log.date >= startDate && log.date <= endDate;
  });

  console.log(`Filtered to ${filtered.length} game logs between ${startDate} and ${endDate}`);
  return filtered;
}

/**
 * Validate scraped game logs
 */
export function validateGameLogs(logs: PlayerGameLogData[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (logs.length === 0) {
    errors.push('No game logs found');
    return { valid: false, errors };
  }

  const duplicateIds = logs
    .map((log) => log.id)
    .filter((id, index, arr) => arr.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate game log IDs found: ${duplicateIds.slice(0, 5).join(', ')}`);
  }

  const invalidMinutes = logs.filter((log) => log.minutes < 0 || log.minutes > 60);
  if (invalidMinutes.length > 0) {
    errors.push(`${invalidMinutes.length} logs with invalid minutes`);
  }

  const invalidDates = logs.filter((log) => {
    const date = new Date(log.date);
    return isNaN(date.getTime());
  });
  if (invalidDates.length > 0) {
    errors.push(`${invalidDates.length} logs with invalid dates`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
