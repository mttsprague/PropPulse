/**
 * Admin API Endpoints
 * 
 * Protected endpoints for triggering ingestion jobs and viewing system status
 */

import { Router, Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import {
  ingestTeamsAndPlayers,
  ingestSchedule,
  ingestPlayerGameLogs,
  ingestInjurySnapshot,
  createIngestionRun,
  completeIngestionRun,
} from '../jobs/ingestion';
import {
  computeDailyChanges,
  computePlayerAggregates,
} from '../jobs/computation';
import {
  importPlayerGameLogsCSV,
  importInjuryCSV,
  importTeamRosterCSV,
  CSV_TEMPLATES,
} from '../utils/csv-import';

const router = Router();
const db = getFirestore();

/**
 * Middleware: Check admin authorization
 */
async function requireAdmin(req: Request, res: Response, next: Function) {
  try {
    const adminKey = req.headers['x-admin-key'];
    const expectedKey = process.env.ADMIN_KEY || 'dev-admin-key';

    if (adminKey !== expectedKey) {
      // Also check Firebase custom claims if auth token provided
      if (req.user) {
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        const userData = userDoc.data();
        
        if (userData?.admin === true) {
          return next();
        }
      }

      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

router.use(requireAdmin);

/**
 * GET /admin/health
 * Get system health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthSnapshot = await db.collection('scraperHealth').get();
    const health = healthSnapshot.docs.map((doc) => ({
      name: doc.id,
      ...doc.data(),
    }));

    res.json({ health });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/ingestion-runs
 * Get recent ingestion runs
 */
router.get('/ingestion-runs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const runsSnapshot = await db
      .collection('ingestionRuns')
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();

    const runs = runsSnapshot.docs.map((doc) => doc.data());

    res.json({ runs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/ingest/teams-players
 * Trigger teams and players ingestion
 */
router.post('/ingest/teams-players', async (req: Request, res: Response) => {
  try {
    const season = req.body.season || 2025;
    const runId = `teams-players-${Date.now()}`;

    await createIngestionRun(runId);

    // Run ingestion in background
    ingestTeamsAndPlayers(runId, season)
      .then((result) => {
        completeIngestionRun(
          runId,
          result.success ? 'completed' : 'failed',
          `Teams: ${result.stats.teamsInserted || 0} inserted, ${result.stats.teamsUpdated || 0} updated. Players: ${result.stats.playersInserted || 0} inserted, ${result.stats.playersUpdated || 0} updated.`
        );
      })
      .catch((error) => {
        completeIngestionRun(runId, 'failed', error.message);
      });

    res.json({
      message: 'Teams and players ingestion started',
      runId,
      checkStatus: `/admin/ingestion-runs`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/ingest/schedule
 * Trigger schedule ingestion
 */
router.post('/ingest/schedule', async (req: Request, res: Response) => {
  try {
    const season = req.body.season || 2025;
    const runId = `schedule-${Date.now()}`;

    await createIngestionRun(runId);

    // Run ingestion in background
    ingestSchedule(runId, season)
      .then((result) => {
        completeIngestionRun(
          runId,
          result.success ? 'completed' : 'failed',
          `Games: ${result.stats.gamesInserted || 0} inserted, ${result.stats.gamesUpdated || 0} updated.`
        );
      })
      .catch((error) => {
        completeIngestionRun(runId, 'failed', error.message);
      });

    res.json({
      message: 'Schedule ingestion started',
      runId,
      checkStatus: `/admin/ingestion-runs`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/ingest/game-logs
 * Trigger game logs ingestion
 */
router.post('/ingest/game-logs', async (req: Request, res: Response) => {
  try {
    const { playerIds, season } = req.body;
    const runId = `game-logs-${Date.now()}`;

    await createIngestionRun(runId);

    // Run ingestion in background
    ingestPlayerGameLogs(runId, playerIds, season || 2025)
      .then((result) => {
        completeIngestionRun(
          runId,
          result.success ? 'completed' : 'failed',
          `Game logs: ${result.stats.logsInserted || 0} inserted, ${result.stats.logsUpdated || 0} updated for ${result.stats.playersProcessed || 0} players.`
        );
      })
      .catch((error) => {
        completeIngestionRun(runId, 'failed', error.message);
      });

    res.json({
      message: 'Game logs ingestion started',
      runId,
      checkStatus: `/admin/ingestion-runs`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/ingest/injuries
 * Trigger injury snapshot ingestion
 */
router.post('/ingest/injuries', async (req: Request, res: Response) => {
  try {
    const runId = `injuries-${Date.now()}`;

    await createIngestionRun(runId);

    // Run ingestion in background
    ingestInjurySnapshot(runId)
      .then((result) => {
        completeIngestionRun(
          runId,
          result.success ? 'completed' : 'failed',
          `Injuries: ${result.stats.injuriesRecorded || 0} recorded, ${result.stats.playersResolved || 0} players resolved.`
        );
      })
      .catch((error) => {
        completeIngestionRun(runId, 'failed', error.message);
      });

    res.json({
      message: 'Injury snapshot ingestion started',
      runId,
      checkStatus: `/admin/ingestion-runs`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/compute/daily-changes
 * Trigger daily changes computation
 */
router.post('/compute/daily-changes', async (req: Request, res: Response) => {
  try {
    const date = req.body.date || new Date().toISOString().split('T')[0];

    await computeDailyChanges(date);

    res.json({
      message: 'Daily changes computed',
      date,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/compute/aggregates
 * Trigger player aggregates computation
 */
router.post('/compute/aggregates', async (req: Request, res: Response) => {
  try {
    const { playerId } = req.body;

    // Run in background
    computePlayerAggregates(playerId)
      .then(() => console.log('Player aggregates computed'))
      .catch((error) => console.error('Aggregates error:', error));

    res.json({
      message: 'Player aggregates computation started',
      playerId: playerId || 'all players',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/import/game-logs-csv
 * Import game logs from CSV
 */
router.post('/import/game-logs-csv', async (req: Request, res: Response) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent) {
      return res.status(400).json({ error: 'csvContent required' });
    }

    const runId = `csv-import-${Date.now()}`;
    const result = await importPlayerGameLogsCSV(csvContent, runId);

    res.json({
      message: 'Game logs imported from CSV',
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/import/injuries-csv
 * Import injuries from CSV
 */
router.post('/import/injuries-csv', async (req: Request, res: Response) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent) {
      return res.status(400).json({ error: 'csvContent required' });
    }

    const result = await importInjuryCSV(csvContent);

    res.json({
      message: 'Injuries imported from CSV',
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/import/roster-csv
 * Import team rosters from CSV
 */
router.post('/import/roster-csv', async (req: Request, res: Response) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent) {
      return res.status(400).json({ error: 'csvContent required' });
    }

    const result = await importTeamRosterCSV(csvContent);

    res.json({
      message: 'Team rosters imported from CSV',
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/csv-templates
 * Get CSV template examples
 */
router.get('/csv-templates', (req: Request, res: Response) => {
  res.json({ templates: CSV_TEMPLATES });
});

/**
 * GET /admin/stats
 * Get database statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const collections = [
      'teams',
      'players',
      'games',
      'playerGameStats',
      'injurySnapshots',
      'dailyChanges',
      'playerAggregates',
    ];

    const stats: Record<string, number> = {};

    for (const collection of collections) {
      const snapshot = await db.collection(collection).count().get();
      stats[collection] = snapshot.data().count;
    }

    res.json({ stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
