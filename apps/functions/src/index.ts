/**
 * Firebase Cloud Functions - Search System Only
 * Simplified deployment with just search functionality
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

// ==================== Search API Endpoints ====================

import {
  searchPlayers,
  topPlayers,
} from './search-api/search';

export { searchPlayers, topPlayers };

// ==================== Search Scheduled Jobs ====================

import {
  computeAggregatesDaily,
  computePropTablesDaily,
  buildSearchIndexWeekly,
  rebuildSearchIndex,
  computeAggregatesManual,
  computePropTablesManual,
} from './search-jobs/search-jobs';

export {
  computeAggregatesDaily,
  computePropTablesDaily,
  buildSearchIndexWeekly,
  rebuildSearchIndex,
  computeAggregatesManual,
  computePropTablesManual,
};
