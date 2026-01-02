/**
 * Search Normalization Utilities
 * 
 * Functions for normalizing player names and generating search tokens
 */

/**
 * Normalize a string for search (lowercase, no special chars, trim)
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')         // Collapse multiple spaces
    .trim();
}

/**
 * Remove all spaces from a normalized string
 */
export function normalizeNameNoSpaces(name: string): string {
  return normalizeName(name).replace(/\s/g, '');
}

/**
 * Generate all search tokens for a player
 * 
 * Tokens include:
 * - Full name normalized
 * - Full name no spaces
 * - First name
 * - Last name
 * - Initials (LBJ for LeBron James)
 * - First initial + last name (ljames)
 * - Common nicknames (if provided)
 * - Prefixes of all tokens (for prefix matching)
 */
export function generateSearchTokens(
  fullName: string,
  nicknames: string[] = []
): string[] {
  const normalized = normalizeName(fullName);
  const parts = normalized.split(' ');
  
  const tokens = new Set<string>();

  // Full name variants
  tokens.add(normalized);
  tokens.add(normalizeNameNoSpaces(fullName));

  // Individual name parts
  parts.forEach((part) => {
    if (part.length >= 2) {
      tokens.add(part);
    }
  });

  // First and last name specifically
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    
    tokens.add(firstName);
    tokens.add(lastName);

    // Initials (e.g., "lbj" for LeBron James)
    const initials = parts.map((p) => p[0]).join('');
    if (initials.length >= 2 && initials.length <= 4) {
      tokens.add(initials);
    }

    // First initial + last name (e.g., "ljames")
    if (firstName.length > 0 && lastName.length > 0) {
      tokens.add(firstName[0] + lastName);
    }

    // Last name + first initial (e.g., "jamesl")
    tokens.add(lastName + firstName[0]);
  }

  // Add nicknames
  nicknames.forEach((nickname) => {
    const normalizedNickname = normalizeName(nickname);
    tokens.add(normalizedNickname);
    tokens.add(normalizeNameNoSpaces(nickname));
  });

  // Generate prefixes for all tokens (minimum 2 chars)
  const prefixes = new Set<string>();
  tokens.forEach((token) => {
    for (let i = 2; i <= token.length; i++) {
      prefixes.add(token.substring(0, i));
    }
  });

  // Merge prefixes with tokens
  prefixes.forEach((prefix) => tokens.add(prefix));

  return Array.from(tokens);
}

/**
 * Generate common nickname mappings
 */
export const COMMON_NICKNAMES: Record<string, string[]> = {
  'Stephen Curry': ['steph', 'chef'],
  'LeBron James': ['bron', 'king'],
  'Anthony Edwards': ['ant', 'antman'],
  'Giannis Antetokounmpo': ['giannis', 'greek freak'],
  'Kevin Durant': ['kd', 'slim reaper'],
  'James Harden': ['beard'],
  'Luka Doncic': ['luka'],
  'Joel Embiid': ['jojo'],
  'Kawhi Leonard': ['klaw'],
  'Damian Lillard': ['dame'],
  'Jayson Tatum': ['jt'],
  'Nikola Jokic': ['joker'],
  'Jimmy Butler': ['buckets'],
  'Devin Booker': ['book'],
  'Ja Morant': ['ja'],
  'Trae Young': ['ice trae'],
  'Russell Westbrook': ['russ', 'brodie'],
  'Chris Paul': ['cp3'],
  'Paul George': ['pg13'],
  'Kyrie Irving': ['uncle drew'],
  'Bradley Beal': ['bb'],
  'Donovan Mitchell': ['spida'],
  'Karl-Anthony Towns': ['kat'],
};

/**
 * Get nicknames for a player
 */
export function getPlayerNicknames(fullName: string): string[] {
  return COMMON_NICKNAMES[fullName] || [];
}

/**
 * Generate search tokens with automatic nickname detection
 */
export function generateSearchTokensWithNicknames(fullName: string): string[] {
  const nicknames = getPlayerNicknames(fullName);
  return generateSearchTokens(fullName, nicknames);
}

/**
 * Compute similarity score between query and player name
 * 
 * Used for manual ranking when Fuse.js is not available
 */
export function computeSimilarityScore(
  query: string,
  playerName: string,
  tokens: string[]
): number {
  const normalizedQuery = normalizeName(query);
  const normalizedName = normalizeName(playerName);
  
  let score = 0;

  // Exact match bonus
  if (normalizedQuery === normalizedName) {
    return 1000;
  }

  // Starts with query bonus
  if (normalizedName.startsWith(normalizedQuery)) {
    score += 500;
  }

  // Token prefix match
  const queryParts = normalizedQuery.split(' ');
  queryParts.forEach((queryPart) => {
    if (tokens.some((token) => token.startsWith(queryPart))) {
      score += 100;
    }
  });

  // Contains query bonus
  if (normalizedName.includes(normalizedQuery)) {
    score += 50;
  }

  // Token contains bonus
  queryParts.forEach((queryPart) => {
    if (tokens.some((token) => token.includes(queryPart))) {
      score += 25;
    }
  });

  return score;
}

/**
 * Validate search query
 */
export function isValidSearchQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= 1 && trimmed.length <= 100;
}

/**
 * Truncate search query to prevent abuse
 */
export function sanitizeSearchQuery(query: string): string {
  return query.trim().substring(0, 100);
}
