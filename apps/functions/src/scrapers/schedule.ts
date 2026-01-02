/**
 * Basketball-Reference Schedule Scraper
 * 
 * Scrapes NBA game schedule from Basketball-Reference.com
 */

import * as cheerio from 'cheerio';
import { fetchAndCache } from '../utils/fetch-and-cache';

const BASE_URL = 'https://www.basketball-reference.com';

export interface GameData {
  id: string;
  date: string; // ISO date string
  homeTeamId: string;
  awayTeamId: string;
  status: 'scheduled' | 'in_progress' | 'final';
  homeScore?: number;
  awayScore?: number;
  startTime?: string;
  updatedAt: number;
}

/**
 * Parse date from Basketball-Reference format
 * Example: "Fri, Oct 22, 2024" → "2024-10-22"
 */
function parseDate(dateStr: string): string {
  try {
    const cleaned = dateStr.replace(/[^a-zA-Z0-9,\s]/g, '').trim();
    const date = new Date(cleaned);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateStr}`);
    }
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.error(`Error parsing date "${dateStr}":`, error);
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Generate deterministic game ID
 */
function generateGameId(date: string, awayTeamId: string, homeTeamId: string): string {
  return `${date}_${awayTeamId}_${homeTeamId}`;
}

/**
 * Scrape NBA schedule for a specific month
 */
export async function scrapeScheduleMonth(
  year: number,
  month: number
): Promise<GameData[]> {
  // Basketball-Reference uses month names: october, november, etc.
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  const monthName = monthNames[month - 1];
  
  const url = `${BASE_URL}/leagues/NBA_${year}_games-${monthName}.html`;

  try {
    const html = await fetchAndCache(url, {
      cacheTTL: 86400, // 24 hours
      scraperName: 'basketball-reference-schedule',
    });

    const $ = cheerio.load(html);
    const games: GameData[] = [];

    const scheduleTable = $('#schedule');
    
    if (!scheduleTable.length) {
      console.warn(`No schedule table found for ${year}-${month}`);
      return games;
    }

    scheduleTable.find('tbody tr').each((_, row) => {
      try {
        const $row = $(row);

        // Skip header rows
        if ($row.hasClass('thead')) {
          return;
        }

        const dateCell = $row.find('th[data-stat="date_game"]');
        const dateStr = dateCell.text().trim();
        
        if (!dateStr) {
          return;
        }

        const date = parseDate(dateStr);

        const awayTeam = $row.find('td[data-stat="visitor_team_name"]').text().trim();
        const homeTeam = $row.find('td[data-stat="home_team_name"]').text().trim();

        if (!awayTeam || !homeTeam) {
          return;
        }

        // Map team names to abbreviations (Basketball-Reference uses full names)
        const awayTeamId = mapTeamNameToId(awayTeam);
        const homeTeamId = mapTeamNameToId(homeTeam);

        if (!awayTeamId || !homeTeamId) {
          console.warn(`Could not map team names: ${awayTeam} vs ${homeTeam}`);
          return;
        }

        const gameId = generateGameId(date, awayTeamId, homeTeamId);

        const awayScoreStr = $row.find('td[data-stat="visitor_pts"]').text().trim();
        const homeScoreStr = $row.find('td[data-stat="home_pts"]').text().trim();

        const awayScore = awayScoreStr ? parseInt(awayScoreStr, 10) : undefined;
        const homeScore = homeScoreStr ? parseInt(homeScoreStr, 10) : undefined;

        const status: 'scheduled' | 'final' = awayScore && homeScore ? 'final' : 'scheduled';

        const startTime = $row.find('td[data-stat="game_start_time"]').text().trim() || undefined;

        games.push({
          id: gameId,
          date,
          homeTeamId,
          awayTeamId,
          status,
          homeScore,
          awayScore,
          startTime,
          updatedAt: Date.now(),
        });
      } catch (error: any) {
        console.error(`Error parsing game row:`, error.message);
      }
    });

    console.log(`Scraped ${games.length} games for ${year}-${month}`);
    return games;
  } catch (error: any) {
    console.error(`Failed to scrape schedule for ${year}-${month}:`, error.message);
    throw error;
  }
}

/**
 * Scrape full season schedule
 */
export async function scrapeSeasonSchedule(season: number): Promise<GameData[]> {
  const allGames: GameData[] = [];

  // NBA season runs October (year-1) through June (year)
  const months = [
    { year: season - 1, month: 10 }, // October
    { year: season - 1, month: 11 }, // November
    { year: season - 1, month: 12 }, // December
    { year: season, month: 1 },      // January
    { year: season, month: 2 },      // February
    { year: season, month: 3 },      // March
    { year: season, month: 4 },      // April
    { year: season, month: 5 },      // May
    { year: season, month: 6 },      // June (playoffs)
  ];

  for (const { year, month } of months) {
    try {
      const games = await scrapeScheduleMonth(year, month);
      allGames.push(...games);
    } catch (error: any) {
      console.error(`Failed to scrape ${year}-${month}:`, error.message);
      // Continue with other months
    }
  }

  console.log(`Scraped ${allGames.length} total games for ${season} season`);
  return allGames;
}

/**
 * Map team full name to abbreviation
 */
function mapTeamNameToId(teamName: string): string | null {
  const mapping: Record<string, string> = {
    'Atlanta Hawks': 'ATL',
    'Boston Celtics': 'BOS',
    'Brooklyn Nets': 'BRK',
    'Charlotte Hornets': 'CHO',
    'Chicago Bulls': 'CHI',
    'Cleveland Cavaliers': 'CLE',
    'Dallas Mavericks': 'DAL',
    'Denver Nuggets': 'DEN',
    'Detroit Pistons': 'DET',
    'Golden State Warriors': 'GSW',
    'Houston Rockets': 'HOU',
    'Indiana Pacers': 'IND',
    'LA Clippers': 'LAC',
    'Los Angeles Lakers': 'LAL',
    'Memphis Grizzlies': 'MEM',
    'Miami Heat': 'MIA',
    'Milwaukee Bucks': 'MIL',
    'Minnesota Timberwolves': 'MIN',
    'New Orleans Pelicans': 'NOP',
    'New York Knicks': 'NYK',
    'Oklahoma City Thunder': 'OKC',
    'Orlando Magic': 'ORL',
    'Philadelphia 76ers': 'PHI',
    'Phoenix Suns': 'PHO',
    'Portland Trail Blazers': 'POR',
    'Sacramento Kings': 'SAC',
    'San Antonio Spurs': 'SAS',
    'Toronto Raptors': 'TOR',
    'Utah Jazz': 'UTA',
    'Washington Wizards': 'WAS',
  };

  return mapping[teamName] || null;
}

/**
 * Validate scraped schedule
 */
export function validateSchedule(games: GameData[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (games.length < 1200) {
    errors.push(`Only ${games.length} games found (expected ~1230 for full season)`);
  }

  const duplicateIds = games
    .map((g) => g.id)
    .filter((id, index, arr) => arr.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate game IDs found: ${duplicateIds.slice(0, 5).join(', ')}`);
  }

  const invalidDates = games.filter((g) => {
    const date = new Date(g.date);
    return isNaN(date.getTime());
  });
  if (invalidDates.length > 0) {
    errors.push(`${invalidDates.length} games with invalid dates`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
