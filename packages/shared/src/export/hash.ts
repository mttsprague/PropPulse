/**
 * Export Hash Generator
 * 
 * Generates deterministic hashes for export caching and deduplication
 */

import crypto from 'crypto';
import { PropCard } from '../prop-card/types';
import { ViewMode, ThemeMode } from './types';

/**
 * Generate export hash from prop card and settings
 * 
 * Hash includes:
 * - Player ID
 * - Stat type
 * - Line
 * - Side
 * - Game date
 * - View mode
 * - Theme
 * - Insights content (to detect changes)
 * 
 * @param propCard Prop card data
 * @param viewMode View mode
 * @param theme Theme mode
 * @returns SHA-256 hash (32 chars)
 */
export function generateExportHash(
  propCard: PropCard,
  viewMode: ViewMode = 'CASUAL',
  theme: ThemeMode = 'LIGHT'
): string {
  const components = [
    propCard.meta.playerId,
    propCard.meta.statType,
    propCard.meta.line.toFixed(1),
    propCard.meta.side,
    propCard.meta.gameDate,
    viewMode,
    theme,
    // Include insights to detect content changes
    propCard.summary.quickInsights.join('|'),
    // Include key metrics that affect display
    propCard.summary.last10.hitRate.toFixed(3),
    propCard.summary.last20.hitRate.toFixed(3),
  ];

  const canonical = components.join('::');
  
  return crypto
    .createHash('sha256')
    .update(canonical)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Generate short verification ID from hash
 * 
 * Format: XXXX-XXXX (8 chars, base36)
 * 
 * @param hash Full export hash
 * @returns Short verification ID
 */
export function generateVerificationId(hash: string): string {
  // Take first 16 chars of hash and convert to base36
  const segment1 = parseInt(hash.slice(0, 8), 16).toString(36).toUpperCase();
  const segment2 = parseInt(hash.slice(8, 16), 16).toString(36).toUpperCase();

  // Pad to 4 chars each
  const part1 = segment1.padStart(4, '0').slice(0, 4);
  const part2 = segment2.padStart(4, '0').slice(0, 4);

  return `${part1}-${part2}`;
}

/**
 * Generate storage path for export
 * 
 * Format: exports/{uid}/{YYYY-MM-DD}/{hash}.png
 * 
 * @param uid User ID
 * @param hash Export hash
 * @param date Date string (YYYY-MM-DD)
 * @returns Storage path
 */
export function generateStoragePath(
  uid: string,
  hash: string,
  date?: string
): string {
  const dateStr = date || new Date().toISOString().split('T')[0];
  return `exports/${uid}/${dateStr}/${hash}.png`;
}

/**
 * Generate cache storage path
 * 
 * Format: exports/cache/{hash}.png
 * 
 * @param hash Export hash
 * @returns Cache storage path
 */
export function generateCacheStoragePath(hash: string): string {
  return `exports/cache/${hash}.png`;
}

/**
 * Generate export ID (Firestore document ID)
 * 
 * Format: {uid}_{timestamp}_{random}
 * 
 * @param uid User ID
 * @returns Export ID
 */
export function generateExportId(uid: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${uid}_${timestamp}_${random}`;
}

/**
 * Validate export hash format
 * 
 * @param hash Hash string to validate
 * @returns True if valid
 */
export function isValidHash(hash: string): boolean {
  return /^[a-f0-9]{32}$/.test(hash);
}

/**
 * Validate verification ID format
 * 
 * @param verificationId Verification ID to validate
 * @returns True if valid
 */
export function isValidVerificationId(verificationId: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(verificationId);
}
