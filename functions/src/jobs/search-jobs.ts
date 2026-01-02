/**
 * Scheduled Jobs for Search System
 * 
 * Daily and weekly jobs to compute aggregates, prop tables, and search index
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  computePlayerAggregatesForAll,
  computePropTablesForAll,
  buildAndStoreSearchIndex,
} from '@proppulse/shared/search';

const db = admin.firestore();
const storage = admin.storage();

/**
 * Daily job: Compute player aggregates
 * 
 * Runs at 3 AM CT every day
 * Computes season/last5/last10/last20 averages for all active players
 */
export const computeAggregatesDaily = functions.pubsub
  .schedule('0 3 * * *') // 3 AM daily
  .timeZone('America/Chicago')
  .onRun(async (context) => {
    console.log('Starting daily aggregates computation...');
    
    try {
      const result = await computePlayerAggregatesForAll(db);
      
      console.log(`Aggregates computation complete: ${result.success} success, ${result.failed} failed`);
      
      // Log to Firestore for monitoring
      await db.collection('jobs').add({
        jobName: 'computeAggregatesDaily',
        status: 'completed',
        success: result.success,
        failed: result.failed,
        completedAt: Date.now(),
      });
    } catch (error) {
      console.error('Aggregates computation failed:', error);
      
      await db.collection('jobs').add({
        jobName: 'computeAggregatesDaily',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: Date.now(),
      });
    }
  });

/**
 * Daily job: Compute prop tables
 * 
 * Runs at 4 AM CT every day (after aggregates)
 * Computes common lines hit rate tables for all active players
 */
export const computePropTablesDaily = functions.pubsub
  .schedule('0 4 * * *') // 4 AM daily
  .timeZone('America/Chicago')
  .onRun(async (context) => {
    console.log('Starting daily prop tables computation...');
    
    try {
      const result = await computePropTablesForAll(db);
      
      console.log(`Prop tables computation complete: ${result.success} success, ${result.failed} failed`);
      
      await db.collection('jobs').add({
        jobName: 'computePropTablesDaily',
        status: 'completed',
        success: result.success,
        failed: result.failed,
        completedAt: Date.now(),
      });
    } catch (error) {
      console.error('Prop tables computation failed:', error);
      
      await db.collection('jobs').add({
        jobName: 'computePropTablesDaily',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: Date.now(),
      });
    }
  });

/**
 * Weekly job: Build search index
 * 
 * Runs at 5 AM CT every Sunday
 * Builds player search index and stores in Cloud Storage
 */
export const buildSearchIndexWeekly = functions.pubsub
  .schedule('0 5 * * 0') // 5 AM every Sunday
  .timeZone('America/Chicago')
  .onRun(async (context) => {
    console.log('Starting weekly search index build...');
    
    try {
      const result = await buildAndStoreSearchIndex(db, storage);
      
      if (result.success) {
        console.log(`Search index built: ${result.playerCount} players, URL: ${result.url}`);
        
        await db.collection('jobs').add({
          jobName: 'buildSearchIndexWeekly',
          status: 'completed',
          playerCount: result.playerCount,
          url: result.url,
          checksum: result.checksum,
          completedAt: Date.now(),
        });
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Search index build failed:', error);
      
      await db.collection('jobs').add({
        jobName: 'buildSearchIndexWeekly',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: Date.now(),
      });
    }
  });

/**
 * Manual trigger: Rebuild search index
 * 
 * HTTP endpoint for manually triggering search index rebuild
 */
export const rebuildSearchIndex = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    console.log('Manual search index rebuild triggered');
    
    const result = await buildAndStoreSearchIndex(db, storage);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Search index rebuilt successfully',
        playerCount: result.playerCount,
        url: result.url,
        checksum: result.checksum,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Manual rebuild failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Manual trigger: Compute aggregates
 */
export const computeAggregatesManual = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    console.log('Manual aggregates computation triggered');
    
    const result = await computePlayerAggregatesForAll(db);
    
    res.status(200).json({
      success: true,
      message: 'Aggregates computed successfully',
      successCount: result.success,
      failedCount: result.failed,
    });
  } catch (error) {
    console.error('Manual aggregates computation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Manual trigger: Compute prop tables
 */
export const computePropTablesManual = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    console.log('Manual prop tables computation triggered');
    
    const result = await computePropTablesForAll(db);
    
    res.status(200).json({
      success: true,
      message: 'Prop tables computed successfully',
      successCount: result.success,
      failedCount: result.failed,
    });
  } catch (error) {
    console.error('Manual prop tables computation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
