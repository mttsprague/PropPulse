import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';

// Initialize Firebase Admin
admin.initializeApp();

// Import route handlers
import { apiRouter } from './api';
import {
  ingestTeamsAndPlayers,
  ingestSchedule,
  ingestPlayerGameLogs,
  ingestInjurySnapshot,
  createIngestionRun,
  completeIngestionRun,
} from './jobs/ingestion';
import {
  computeDailyChanges,
  computePlayerAggregates,
} from './jobs/computation';
import { stripeWebhook } from './stripe/webhook';
import adminRouter from './api/admin/ingestion';

// Import search functions
import {
  searchPlayers,
  topPlayers,
} from './api/search';
import {
  computeAggregatesDaily,
  computePropTablesDaily,
  buildSearchIndexWeekly,
  rebuildSearchIndex,
  computeAggregatesManual,
  computePropTablesManual,
} from './jobs/search-jobs';

// ============================================================================
// EXPRESS API
// ============================================================================

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' })); // Increased for CSV uploads
app.use('/api', apiRouter);
app.use('/admin', adminRouter);

export const api = functions.https.onRequest(app);

// ============================================================================
// STRIPE WEBHOOK
// ============================================================================

export const stripe = functions.https.onRequest(stripeWebhook);

// ============================================================================
// SEARCH API ENDPOINTS
// ============================================================================

export { searchPlayers, topPlayers } from './api/search';

// ============================================================================
// SEARCH SCHEDULED JOBS
// ============================================================================

export {
  computeAggregatesDaily,
  computePropTablesDaily,
  buildSearchIndexWeekly,
  rebuildSearchIndex,
  computeAggregatesManual,
  computePropTablesManual,
} from './jobs/search-jobs';

// ============================================================================
// SCHEDULED INGESTION JOBS
// ============================================================================

/**
 * Daily full ingestion at 3 AM CST
 * - Ingests previous day's completed games
 * - Computes player aggregates
 */
export const ingestPlayerStatsDaily = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('0 3 * * *')
  .timeZone('America/Chicago')
  .onRun(async (context) => {
    const runId = `daily-${Date.now()}`;
    console.log(`Starting daily ingestion (runId: ${runId})...`);
    
    try {
      await createIngestionRun(runId);

      // Get all player IDs
      const db = admin.firestore();
      const playersSnapshot = await db.collection('players').get();
      const playerIds = playersSnapshot.docs.map((doc) => doc.id);

      // Ingest game logs for all players
      await ingestPlayerGameLogs(runId, playerIds);

      // Compute aggregates
      await computePlayerAggregates();

      // Compute daily changes
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      await computeDailyChanges(dateStr);

      await completeIngestionRun(
        runId,
        'completed',
        'Daily ingestion completed: game logs, aggregates, and daily changes'
      );

      console.log('Daily player stats ingestion completed successfully');
    } catch (error: any) {
      console.error('Error in daily player stats ingestion:', error);
      await completeIngestionRun(runId, 'failed', error.message);
      throw error;
    }
  });

/**
 * Injury snapshot ingestion 4x daily at 9 AM, 1 PM, 5 PM, 9 PM CST
 */
export const ingestInjuriesScheduled = functions
  .runWith({ timeoutSeconds: 120 })
  .pubsub.schedule('0 9,13,17,21 * * *')
  .timeZone('America/Chicago')
  .onRun(async (context) => {
    const runId = `injuries-${Date.now()}`;
    console.log(`Starting injury snapshot ingestion (runId: ${runId})...`);
    
    try {
      await createIngestionRun(runId);
      await ingestInjurySnapshot(runId);

      // Compute daily changes after injury update
      const today = new Date().toISOString().split('T')[0];
      await computeDailyChanges(today);

      await completeIngestionRun(
        runId,
        'completed',
        'Injury snapshot and daily changes computed'
      );

      console.log('Injury snapshot ingestion completed successfully');
    } catch (error: any) {
      console.error('Error in injury snapshot ingestion:', error);
      await completeIngestionRun(runId, 'failed', error.message);
      throw error;
    }
  });

/**
 * Weekly schedule refresh on Mondays at 4 AM CST
 */
export const ingestScheduleWeekly = functions
  .runWith({ timeoutSeconds: 300 })
  .pubsub.schedule('0 4 * * 1')
  .timeZone('America/Chicago')
  .onRun(async (context) => {
    const runId = `schedule-${Date.now()}`;
    console.log(`Starting weekly schedule ingestion (runId: ${runId})...`);
    
    try {
      await createIngestionRun(runId);
      await ingestSchedule(runId);

      // Also refresh teams and players weekly
      await ingestTeamsAndPlayers(runId);

      await completeIngestionRun(
        runId,
        'completed',
        'Weekly schedule and rosters refreshed'
      );

      console.log('Weekly schedule ingestion completed successfully');
    } catch (error: any) {
      console.error('Error in weekly schedule ingestion:', error);
      await completeIngestionRun(runId, 'failed', error.message);
      throw error;
    }
  });

// Manual trigger for any ingestion job
export const runIngestion = functions.https.onRequest(async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== functions.config().admin?.key) {
    res.status(403).send('Forbidden');
    return;
  }

  const { job } = req.body;

  try {
    switch (job) {
      case 'teams-players':
        await ingestTeamsAndPlayers();
        break;
      case 'schedule':
        await ingestSchedule();
        break;
      case 'game-logs':
        await ingestDailyGameLogs();
        break;
      case 'injuries':
        await ingestInjurySnapshot();
        break;
      case 'daily-changes':
        const date = req.body.date || new Date().toISOString().split('T')[0];
        await computeDailyChanges(date);
        break;
      default:
        res.status(400).send({ success: false, error: 'Invalid job name' });
        return;
    }

    res.status(200).send({ success: true, message: `Job ${job} completed` });
  } catch (error: any) {
    console.error(`Error running job ${job}:`, error);
    res.status(500).send({ success: false, error: error.message });
  }
});
