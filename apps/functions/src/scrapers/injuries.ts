/**
 * ESPN Injury Report Scraper
 * 
 * Scrapes current NBA injury status from ESPN
 */

import * as cheerio from 'cheerio';
import { fetchAndCache } from '../utils/fetch-and-cache';

const INJURY_URL = 'https://www.espn.com/nba/injuries';

export interface InjuryData {
  playerId?: string; // Will be resolved later from player name
  playerName: string;
  teamId?: string;
  teamName: string;
  status: string; // OUT, QUESTIONABLE, DOUBTFUL, DAY-TO-DAY, PROBABLE
  injuryType: string;
  date?: string;
  notes?: string;
}

export interface InjurySnapshot {
  id: string; // Timestamp-based ID
  snapshotDateTime: number;
  players: InjuryData[];
  updatedAt: number;
}

/**
 * Normalize injury status
 */
function normalizeStatus(status: string): string {
  const normalized = status.toUpperCase().trim();
  
  const statusMap: Record<string, string> = {
    'OUT': 'OUT',
    'O': 'OUT',
    'QUESTIONABLE': 'QUESTIONABLE',
    'Q': 'QUESTIONABLE',
    'DOUBTFUL': 'DOUBTFUL',
    'D': 'DOUBTFUL',
    'DAY TO DAY': 'DAY-TO-DAY',
    'DTD': 'DAY-TO-DAY',
    'PROBABLE': 'PROBABLE',
    'P': 'PROBABLE',
  };

  return statusMap[normalized] || normalized;
}

/**
 * Scrape current NBA injury report
 */
export async function scrapeInjuryReport(): Promise<InjuryData[]> {
  try {
    const html = await fetchAndCache(INJURY_URL, {
      cacheTTL: 3600, // 1 hour
      scraperName: 'espn-injuries',
    });

    const $ = cheerio.load(html);
    const injuries: InjuryData[] = [];

    // ESPN injury page is organized by team
    $('.ResponsiveTable, .Table').each((_, table) => {
      const $table = $(table);
      
      // Try to find team name
      let teamName = $table.closest('.ContentList__Item, .Table__Title')
        .find('.Table__Title, .ContentList__Header')
        .text()
        .trim();

      // Alternative: look for team header before table
      if (!teamName) {
        teamName = $table.prevAll('.Card__Header, h2, h3').first().text().trim();
      }

      if (!teamName) {
        return; // Skip if can't identify team
      }

      // Parse injury rows
      $table.find('tbody tr, .Table__TR--sm').each((_, row) => {
        try {
          const $row = $(row);

          const playerName = $row.find('.AthleteName, td:first-child a, .Table__TD:first-child a')
            .text()
            .trim();

          if (!playerName) {
            return;
          }

          const status = $row.find('.injury-status, td:nth-child(2), .Table__TD:nth-child(2)')
            .text()
            .trim();

          const injuryType = $row.find('.injury-desc, td:nth-child(3), .Table__TD:nth-child(3)')
            .text()
            .trim();

          const dateStr = $row.find('.injury-date, td:nth-child(4), .Table__TD:nth-child(4)')
            .text()
            .trim();

          if (!status && !injuryType) {
            return; // Not a valid injury row
          }

          injuries.push({
            playerName,
            teamName,
            status: normalizeStatus(status),
            injuryType: injuryType || 'Unknown',
            date: dateStr || undefined,
            notes: undefined,
          });
        } catch (error: any) {
          console.error('Error parsing injury row:', error.message);
        }
      });
    });

    console.log(`Scraped ${injuries.length} injury records`);
    return injuries;
  } catch (error: any) {
    console.error('Failed to scrape injury report:', error.message);
    throw error;
  }
}

/**
 * Create injury snapshot
 */
export function createInjurySnapshot(injuries: InjuryData[]): InjurySnapshot {
  const now = Date.now();
  return {
    id: now.toString(),
    snapshotDateTime: now,
    players: injuries,
    updatedAt: now,
  };
}

/**
 * Compare two injury snapshots and detect changes
 */
export function compareInjurySnapshots(
  previous: InjurySnapshot | null,
  current: InjurySnapshot
): Array<{
  playerName: string;
  playerId?: string;
  changeType: 'new_injury' | 'status_change' | 'recovered';
  oldStatus?: string;
  newStatus: string;
  severity: 'high' | 'medium' | 'low';
}> {
  const changes: Array<{
    playerName: string;
    playerId?: string;
    changeType: 'new_injury' | 'status_change' | 'recovered';
    oldStatus?: string;
    newStatus: string;
    severity: 'high' | 'medium' | 'low';
  }> = [];

  if (!previous) {
    return changes; // No comparison possible
  }

  const previousMap = new Map(
    previous.players.map((p) => [p.playerName, p])
  );
  const currentMap = new Map(
    current.players.map((p) => [p.playerName, p])
  );

  // Check for new injuries and status changes
  current.players.forEach((currentPlayer) => {
    const previousPlayer = previousMap.get(currentPlayer.playerName);

    if (!previousPlayer) {
      // New injury
      changes.push({
        playerName: currentPlayer.playerName,
        playerId: currentPlayer.playerId,
        changeType: 'new_injury',
        newStatus: currentPlayer.status,
        severity: currentPlayer.status === 'OUT' ? 'high' : 'medium',
      });
    } else if (previousPlayer.status !== currentPlayer.status) {
      // Status changed
      const severity = 
        currentPlayer.status === 'OUT' ? 'high' :
        previousPlayer.status === 'OUT' ? 'high' :
        'medium';

      changes.push({
        playerName: currentPlayer.playerName,
        playerId: currentPlayer.playerId,
        changeType: 'status_change',
        oldStatus: previousPlayer.status,
        newStatus: currentPlayer.status,
        severity,
      });
    }
  });

  // Check for recovered players (in previous but not in current)
  previous.players.forEach((previousPlayer) => {
    if (!currentMap.has(previousPlayer.playerName)) {
      changes.push({
        playerName: previousPlayer.playerName,
        playerId: previousPlayer.playerId,
        changeType: 'recovered',
        oldStatus: previousPlayer.status,
        newStatus: 'ACTIVE',
        severity: 'medium',
      });
    }
  });

  return changes;
}

/**
 * Validate scraped injuries
 */
export function validateInjuries(injuries: InjuryData[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (injuries.length === 0) {
    errors.push('No injuries found (possible scraper failure)');
  }

  const missingStatus = injuries.filter((inj) => !inj.status);
  if (missingStatus.length > 0) {
    errors.push(`${missingStatus.length} injuries missing status`);
  }

  const missingPlayer = injuries.filter((inj) => !inj.playerName);
  if (missingPlayer.length > 0) {
    errors.push(`${missingPlayer.length} injuries missing player name`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
