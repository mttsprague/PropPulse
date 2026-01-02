/**
 * Basketball-Reference Team and Player Scraper
 * 
 * Scrapes NBA team rosters and player information from Basketball-Reference.com
 */

import * as cheerio from 'cheerio';
import { fetchAndCache } from '../utils/fetch-and-cache';
import { sleep } from '../utils/rate-limiter';

const BASE_URL = 'https://www.basketball-reference.com';
const CURRENT_SEASON = 2025;

// NBA team abbreviations (Basketball-Reference format)
const NBA_TEAMS = [
  { id: 'ATL', name: 'Atlanta Hawks', abbreviation: 'ATL' },
  { id: 'BOS', name: 'Boston Celtics', abbreviation: 'BOS' },
  { id: 'BRK', name: 'Brooklyn Nets', abbreviation: 'BRK' },
  { id: 'CHO', name: 'Charlotte Hornets', abbreviation: 'CHO' },
  { id: 'CHI', name: 'Chicago Bulls', abbreviation: 'CHI' },
  { id: 'CLE', name: 'Cleveland Cavaliers', abbreviation: 'CLE' },
  { id: 'DAL', name: 'Dallas Mavericks', abbreviation: 'DAL' },
  { id: 'DEN', name: 'Denver Nuggets', abbreviation: 'DEN' },
  { id: 'DET', name: 'Detroit Pistons', abbreviation: 'DET' },
  { id: 'GSW', name: 'Golden State Warriors', abbreviation: 'GSW' },
  { id: 'HOU', name: 'Houston Rockets', abbreviation: 'HOU' },
  { id: 'IND', name: 'Indiana Pacers', abbreviation: 'IND' },
  { id: 'LAC', name: 'LA Clippers', abbreviation: 'LAC' },
  { id: 'LAL', name: 'Los Angeles Lakers', abbreviation: 'LAL' },
  { id: 'MEM', name: 'Memphis Grizzlies', abbreviation: 'MEM' },
  { id: 'MIA', name: 'Miami Heat', abbreviation: 'MIA' },
  { id: 'MIL', name: 'Milwaukee Bucks', abbreviation: 'MIL' },
  { id: 'MIN', name: 'Minnesota Timberwolves', abbreviation: 'MIN' },
  { id: 'NOP', name: 'New Orleans Pelicans', abbreviation: 'NOP' },
  { id: 'NYK', name: 'New York Knicks', abbreviation: 'NYK' },
  { id: 'OKC', name: 'Oklahoma City Thunder', abbreviation: 'OKC' },
  { id: 'ORL', name: 'Orlando Magic', abbreviation: 'ORL' },
  { id: 'PHI', name: 'Philadelphia 76ers', abbreviation: 'PHI' },
  { id: 'PHO', name: 'Phoenix Suns', abbreviation: 'PHO' },
  { id: 'POR', name: 'Portland Trail Blazers', abbreviation: 'POR' },
  { id: 'SAC', name: 'Sacramento Kings', abbreviation: 'SAC' },
  { id: 'SAS', name: 'San Antonio Spurs', abbreviation: 'SAS' },
  { id: 'TOR', name: 'Toronto Raptors', abbreviation: 'TOR' },
  { id: 'UTA', name: 'Utah Jazz', abbreviation: 'UTA' },
  { id: 'WAS', name: 'Washington Wizards', abbreviation: 'WAS' },
];

export interface TeamData {
  id: string;
  name: string;
  abbreviation: string;
  updatedAt: number;
}

export interface PlayerData {
  id: string;
  name: string;
  teamId: string;
  position: string;
  jerseyNumber?: string;
  updatedAt: number;
}

/**
 * Parse player ID from Basketball-Reference URL
 * Example: /players/j/jamesle01.html → jamesle01
 */
function parsePlayerId(playerUrl: string): string | null {
  const match = playerUrl.match(/\/players\/[a-z]\/([a-z0-9]+)\.html/i);
  return match ? match[1] : null;
}

/**
 * Scrape roster for a single team
 */
export async function scrapeTeamRoster(
  teamId: string,
  season: number = CURRENT_SEASON
): Promise<PlayerData[]> {
  const url = `${BASE_URL}/teams/${teamId}/${season}.html`;
  
  try {
    const html = await fetchAndCache(url, {
      cacheTTL: 604800, // 7 days
      scraperName: 'basketball-reference-rosters',
    });

    const $ = cheerio.load(html);
    const players: PlayerData[] = [];

    // Find roster table
    const rosterTable = $('#roster, #per_game');
    
    if (!rosterTable.length) {
      console.warn(`No roster table found for ${teamId}`);
      return players;
    }

    rosterTable.find('tbody tr').each((_, row) => {
      try {
        const $row = $(row);
        
        // Skip header rows or empty rows
        if ($row.hasClass('thead') || !$row.find('td').length) {
          return;
        }

        const playerLink = $row.find('th[data-stat="player"] a, td[data-stat="player"] a');
        const playerUrl = playerLink.attr('href');
        const playerName = playerLink.text().trim();

        if (!playerUrl || !playerName) {
          return;
        }

        const playerId = parsePlayerId(playerUrl);
        if (!playerId) {
          console.warn(`Could not parse player ID from ${playerUrl}`);
          return;
        }

        const position = $row.find('td[data-stat="pos"]').text().trim() || 'F-G';
        const jerseyNumber = $row.find('th[data-stat="number"], td[data-stat="number"]').text().trim();

        players.push({
          id: playerId,
          name: playerName,
          teamId,
          position,
          jerseyNumber: jerseyNumber || undefined,
          updatedAt: Date.now(),
        });
      } catch (error: any) {
        console.error(`Error parsing player row for ${teamId}:`, error.message);
      }
    });

    console.log(`Scraped ${players.length} players for ${teamId}`);
    return players;
  } catch (error: any) {
    console.error(`Failed to scrape roster for ${teamId}:`, error.message);
    throw error;
  }
}

/**
 * Scrape all NBA teams and players
 */
export async function scrapeAllTeamsAndPlayers(
  season: number = CURRENT_SEASON
): Promise<{ teams: TeamData[]; players: PlayerData[] }> {
  const teams: TeamData[] = [];
  const allPlayers: PlayerData[] = [];

  console.log(`Scraping rosters for ${NBA_TEAMS.length} teams...`);

  for (const team of NBA_TEAMS) {
    try {
      console.log(`Scraping ${team.name}...`);
      
      teams.push({
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        updatedAt: Date.now(),
      });

      const players = await scrapeTeamRoster(team.id, season);
      allPlayers.push(...players);

      // Respectful delay between team requests
      await sleep(5000); // 5 seconds
    } catch (error: any) {
      console.error(`Failed to scrape ${team.name}:`, error.message);
      // Continue with other teams
    }
  }

  console.log(`Scraped ${teams.length} teams and ${allPlayers.length} players`);

  return { teams, players: allPlayers };
}

/**
 * Validate scraped data
 */
export function validateTeamsAndPlayers(
  teams: TeamData[],
  players: PlayerData[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (teams.length < 25) {
    errors.push(`Only ${teams.length} teams found (expected ~30)`);
  }

  if (players.length < 300) {
    errors.push(`Only ${players.length} players found (expected 400+)`);
  }

  const teamIds = new Set(teams.map((t) => t.id));
  const playersWithoutTeam = players.filter((p) => !teamIds.has(p.teamId));
  if (playersWithoutTeam.length > 0) {
    errors.push(`${playersWithoutTeam.length} players with invalid teamId`);
  }

  const duplicatePlayerIds = players
    .map((p) => p.id)
    .filter((id, index, arr) => arr.indexOf(id) !== index);
  if (duplicatePlayerIds.length > 0) {
    errors.push(`Duplicate player IDs found: ${duplicatePlayerIds.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
