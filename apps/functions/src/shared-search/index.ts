/**
 * Search Module Index
 * 
 * Exports all search-related functionality
 */

export * from './types';
export * from './normalization';
export * from './aggregates';
export * from './prop-tables';
export * from './index-builder';

// Re-export commonly used functions
export {
  normalizeName,
  generateSearchTokens,
  generateSearchTokensWithNicknames,
  computeSimilarityScore,
} from './normalization';

export {
  computePlayerAggregates,
  computePlayerAggregatesForAll,
  getPlayerAggregates,
} from './aggregates';

export {
  generateCommonLines,
  computePlayerPropTable,
  computePlayerPropTables,
  computePropTablesForAll,
  getPlayerPropTable,
} from './prop-tables';

export {
  buildPlayerSearchIndex,
  buildAndStoreSearchIndex,
  updatePlayerSearchFields,
  fetchSearchIndex,
} from './index-builder';
