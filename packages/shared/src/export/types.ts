/**
 * Export System - Type Definitions
 * 
 * Types for prop card export/sharing functionality
 */

import { PropCard } from '../prop-card/types';

export type ViewMode = 'CASUAL' | 'PRO';
export type ThemeMode = 'LIGHT' | 'DARK';
export type ExportMode = 'CLIENT' | 'SERVER' | 'CANVAS';

/**
 * Export request payload
 */
export interface ExportRequest {
  propCardId?: string; // Optional: if card is already cached
  propCard: PropCard; // Full prop card data
  viewMode?: ViewMode; // Default: CASUAL
  theme?: ThemeMode; // Default: LIGHT
  exportMode?: ExportMode; // Default: CLIENT
}

/**
 * Export response
 */
export interface ExportResponse {
  exportId: string;
  storagePath: string;
  signedUrl: string;
  expiresAt: string; // ISO timestamp
  cached: boolean;
  verificationId?: string; // Short ID for verification
}

/**
 * Export metadata stored in Firestore
 */
export interface ExportMetadata {
  id: string;
  uid: string;
  propCardHash: string;
  viewMode: ViewMode;
  theme: ThemeMode;
  exportMode: ExportMode;
  storagePath: string;
  signedUrl?: string;
  signedUrlExpiresAt?: number;
  sizeBytes: number;
  cached: boolean;
  verificationId: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Export cache entry (global shared cache)
 */
export interface ExportCacheEntry {
  hash: string;
  storagePath: string;
  sizeBytes: number;
  propCardMeta: {
    playerId: string;
    playerName: string;
    statType: string;
    line: number;
    side: string;
  };
  lastAccessedAt: number;
  usageCount: number;
  createdAt: number;
  expiresAt: number;
}

/**
 * Daily usage counter for quota enforcement
 */
export interface DailyUsage {
  uid: string;
  date: string; // YYYY-MM-DD
  exports: number;
  lastExportAt: number;
  resetAt: number;
}

/**
 * User plan configuration
 */
export interface UserPlan {
  uid: string;
  plan: 'FREE' | 'PRO';
  exportQuota: number; // -1 for unlimited
  updatedAt: number;
}

/**
 * Export quota check result
 */
export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  plan: 'FREE' | 'PRO';
  message?: string;
}

/**
 * Share card dimensions and styling
 */
export interface ShareCardConfig {
  width: number;
  height: number;
  padding: number;
  scale: number; // 2x for high DPI
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}

/**
 * Theme configurations
 */
export const THEME_CONFIGS: Record<ThemeMode, ShareCardConfig> = {
  LIGHT: {
    width: 600,
    height: 800,
    padding: 24,
    scale: 2,
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    accentColor: '#3b82f6',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  DARK: {
    width: 600,
    height: 800,
    padding: 24,
    scale: 2,
    backgroundColor: '#1f2937',
    textColor: '#f3f4f6',
    accentColor: '#60a5fa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};

/**
 * Export error codes
 */
export enum ExportErrorCode {
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INVALID_PROP_CARD = 'INVALID_PROP_CARD',
  RENDER_FAILED = 'RENDER_FAILED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMITED = 'RATE_LIMITED',
}

/**
 * Export error
 */
export class ExportError extends Error {
  constructor(
    public code: ExportErrorCode,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ExportError';
  }
}
