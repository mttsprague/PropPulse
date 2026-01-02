/**
 * Prop Card Export System
 * 
 * Complete export/share functionality for prop research cards
 * 
 * @module @proppulse/shared/export
 */

// Types
export * from './types';

// Utilities
export * from './hash';
export * from './quota';
export * from './cache';

// Client-side export
export * from './client-web';
export * from './client-mobile';

// Server-side rendering
export * from './canvas-renderer';

// Re-export commonly used types for convenience
export type {
  ExportRequest,
  ExportResponse,
  ExportMetadata,
  ExportCacheEntry,
  DailyUsage,
  UserPlan,
  QuotaCheckResult,
  ShareCardConfig,
  ThemeMode,
  ViewMode,
  ExportMode,
  ExportErrorCode,
} from './types';

export { ExportError, THEME_CONFIGS } from './types';

export {
  generateExportHash,
  generateVerificationId,
  generateStoragePath,
  generateCacheStoragePath,
  generateExportId,
  isValidHash,
  isValidVerificationId,
} from './hash';

export {
  QUOTA_LIMITS,
  checkExportQuota,
  incrementExportCount,
  getUserPlan,
  updateUserPlan,
} from './quota';

export {
  CACHE_TTL_MS,
  getCachedExport,
  setCachedExport,
  storeExportMetadata,
  getExportMetadata,
  generateSignedUrl,
  updateExportSignedUrl,
  cleanupExpiredExports,
  getUserExportHistory,
} from './cache';
