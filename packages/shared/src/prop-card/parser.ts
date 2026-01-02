/**
 * Prop Query Parser
 * 
 * Parses natural language prop queries into structured PropQuery objects.
 * Supports various formats like:
 * - "Anthony Edwards over 26.5 points"
 * - "Edwards U 5.5 assists"
 * - "LeBron O27.5 PTS"
 */

import { StatType, Side, ParsedPropQuery } from './types';

/**
 * Stat type mappings (various formats)
 */
const STAT_PATTERNS: Record<string, StatType> = {
  'pts': 'PTS',
  'pt': 'PTS',
  'point': 'PTS',
  'points': 'PTS',
  'reb': 'REB',
  'rebound': 'REB',
  'rebounds': 'REB',
  'board': 'REB',
  'boards': 'REB',
  'ast': 'AST',
  'assist': 'AST',
  'assists': 'AST',
  'dime': 'AST',
  'dimes': 'AST',
};

/**
 * Side patterns
 */
const OVER_PATTERNS = ['over', 'o', 'above', '>'];
const UNDER_PATTERNS = ['under', 'u', 'below', '<'];

/**
 * Common player name variations (helps with parsing)
 */
const PLAYER_NAME_ALIASES: Record<string, string> = {
  'lebron': 'LeBron James',
  'curry': 'Stephen Curry',
  'steph': 'Stephen Curry',
  'durant': 'Kevin Durant',
  'kd': 'Kevin Durant',
  'giannis': 'Giannis Antetokounmpo',
  'jokic': 'Nikola Jokic',
  'luka': 'Luka Doncic',
  'embiid': 'Joel Embiid',
  'tatum': 'Jayson Tatum',
  'booker': 'Devin Booker',
  'ad': 'Anthony Davis',
  'dame': 'Damian Lillard',
  'ant': 'Anthony Edwards',
  'ja': 'Ja Morant',
};

/**
 * Parse prop query from natural language text
 * 
 * @param input Natural language query
 * @returns Parsed prop query with confidence score
 * 
 * @example
 * parsePropQueryFromText("Anthony Edwards over 26.5 points")
 * // Returns: { playerName: "Anthony Edwards", statType: "PTS", line: 26.5, side: "OVER", confidence: 0.95 }
 */
export function parsePropQueryFromText(input: string): ParsedPropQuery {
  const normalized = input.toLowerCase().trim();
  
  // Extract components
  const statType = extractStatType(normalized);
  const side = extractSide(normalized);
  const line = extractLine(normalized);
  const playerName = extractPlayerName(normalized, statType, side, line);

  // Calculate confidence based on what was extracted
  let confidence = 0.5;
  if (playerName) confidence += 0.2;
  if (statType) confidence += 0.2;
  if (side) confidence += 0.2;
  if (line > 0) confidence += 0.2;

  // Resolve player name alias if applicable
  const resolvedName = resolvePlayerNameAlias(playerName);

  return {
    playerName: resolvedName || playerName,
    statType: statType || 'PTS', // Default to PTS
    line: line || 0,
    side: side || 'OVER', // Default to OVER
    confidence: Math.min(confidence, 1.0),
  };
}

/**
 * Extract stat type from text
 */
function extractStatType(text: string): StatType | null {
  for (const [pattern, statType] of Object.entries(STAT_PATTERNS)) {
    // Match whole word or at end of string
    const regex = new RegExp(`\\b${pattern}\\b|${pattern}$`, 'i');
    if (regex.test(text)) {
      return statType;
    }
  }
  return null;
}

/**
 * Extract side (OVER/UNDER) from text
 */
function extractSide(text: string): Side | null {
  // Check for over patterns
  for (const pattern of OVER_PATTERNS) {
    if (text.includes(pattern)) {
      return 'OVER';
    }
  }

  // Check for under patterns
  for (const pattern of UNDER_PATTERNS) {
    if (text.includes(pattern)) {
      return 'UNDER';
    }
  }

  return null;
}

/**
 * Extract line (number) from text
 */
function extractLine(text: string): number {
  // Match decimal numbers (e.g., 26.5, 27.5, 5.5)
  const decimalMatch = text.match(/\b(\d+\.\d+)\b/);
  if (decimalMatch) {
    return parseFloat(decimalMatch[1]);
  }

  // Match whole numbers
  const wholeMatch = text.match(/\b(\d+)\b/);
  if (wholeMatch) {
    return parseInt(wholeMatch[1], 10);
  }

  return 0;
}

/**
 * Extract player name from text
 * 
 * Strategy: Remove stat type, side, and line, what's left is likely the player name
 */
function extractPlayerName(
  text: string,
  statType: StatType | null,
  side: Side | null,
  line: number
): string {
  let cleaned = text;

  // Remove stat type patterns
  for (const pattern of Object.keys(STAT_PATTERNS)) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }

  // Remove side patterns
  for (const pattern of [...OVER_PATTERNS, ...UNDER_PATTERNS]) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }

  // Remove line number
  if (line > 0) {
    const lineStr = line.toString();
    cleaned = cleaned.replace(lineStr, '');
  }

  // Clean up whitespace and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Capitalize first letter of each word
  return cleaned
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Resolve player name alias to full name
 */
function resolvePlayerNameAlias(playerName: string): string | null {
  const normalized = playerName.toLowerCase().trim();
  return PLAYER_NAME_ALIASES[normalized] || null;
}

/**
 * Resolve player ID from player name by querying Firestore
 * 
 * @param playerName Player name to search for
 * @param playersCollection Firestore players collection reference
 * @returns Player ID if found, null otherwise
 */
export async function resolvePlayerId(
  playerName: string,
  playersCollection: any // FirebaseFirestore.CollectionReference
): Promise<string | null> {
  try {
    const normalized = playerName.toLowerCase().trim();

    // Query Firestore for player
    const snapshot = await playersCollection
      .where('name', '>=', playerName)
      .where('name', '<=', playerName + '\uf8ff')
      .limit(5)
      .get();

    if (snapshot.empty) {
      return null;
    }

    // Find best match using fuzzy matching
    let bestMatch: { id: string; score: number } | null = null;

    snapshot.forEach((doc: any) => {
      const player = doc.data();
      const score = fuzzyMatchScore(normalized, player.name.toLowerCase());
      
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: doc.id, score };
      }
    });

    // Return if confidence is high enough (> 0.7)
    return bestMatch && bestMatch.score > 0.7 ? bestMatch.id : null;
  } catch (error) {
    console.error('Error resolving player ID:', error);
    return null;
  }
}

/**
 * Fuzzy match score between two strings (0-1)
 * Uses Levenshtein-inspired approach
 */
function fuzzyMatchScore(str1: string, str2: string): number {
  // Exact match
  if (str1 === str2) return 1.0;

  // Check if one contains the other
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.9;
  }

  // Calculate similarity based on shared characters
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  let matches = 0;
  for (const char of shorter) {
    if (longer.includes(char)) {
      matches++;
    }
  }

  return matches / longer.length;
}

/**
 * Validate parsed prop query
 * 
 * @param query Parsed prop query
 * @returns Validation result with errors
 */
export function validatePropQuery(query: ParsedPropQuery): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!query.playerName || query.playerName.length < 2) {
    errors.push('Player name is required and must be at least 2 characters');
  }

  if (!query.statType || !['PTS', 'REB', 'AST'].includes(query.statType)) {
    errors.push('Stat type must be PTS, REB, or AST');
  }

  if (!query.line || query.line <= 0) {
    errors.push('Line must be a positive number');
  }

  if (!query.side || !['OVER', 'UNDER'].includes(query.side)) {
    errors.push('Side must be OVER or UNDER');
  }

  if (query.confidence < 0.6) {
    errors.push('Low parsing confidence - please clarify the query');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
