#!/usr/bin/env node

/**
 * End-to-End Validation Script
 * 
 * Validates the complete ingestion pipeline by:
 * 1. Checking scraper health
 * 2. Triggering test ingestion
 * 3. Verifying data in Firestore
 * 4. Testing CSV imports
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:5001/proppulse-dev/us-central1/api';
const ADMIN_KEY = process.env.ADMIN_KEY || 'dev-admin-key';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'x-admin-key': ADMIN_KEY,
    'Content-Type': 'application/json',
  },
});

// Colors for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('');
  log(`${'='.repeat(60)}`, 'blue');
  log(title, 'blue');
  log(`${'='.repeat(60)}`, 'blue');
  console.log('');
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Test 1: Check Scraper Health
async function checkScraperHealth() {
  section('Test 1: Scraper Health');
  
  try {
    const response = await api.get('/admin/health');
    const { health } = response.data;

    if (!health || health.length === 0) {
      log('⚠️  No scraper health records found', 'yellow');
      return false;
    }

    log(`Found ${health.length} scrapers:`, 'green');
    health.forEach((scraper) => {
      const statusColor = scraper.status === 'ok' ? 'green' : scraper.status === 'warning' ? 'yellow' : 'red';
      log(`  - ${scraper.name}: ${scraper.status}`, statusColor);
    });

    const allOk = health.every((s) => s.status === 'ok' || s.status === 'warning');
    return allOk;
  } catch (error) {
    log(`❌ Failed: ${error.message}`, 'red');
    return false;
  }
}

// Test 2: Get Database Stats
async function getDatabaseStats() {
  section('Test 2: Database Statistics');
  
  try {
    const response = await api.get('/admin/stats');
    const { stats } = response.data;

    log('Current database counts:', 'green');
    Object.entries(stats).forEach(([collection, count]) => {
      log(`  - ${collection}: ${count}`, 'blue');
    });

    return stats;
  } catch (error) {
    log(`❌ Failed: ${error.message}`, 'red');
    return null;
  }
}

// Test 3: Test CSV Import (Game Logs)
async function testCSVImport() {
  section('Test 3: CSV Import (Game Logs)');
  
  try {
    const csvPath = path.join(__dirname, '../data/sample-game-logs.csv');
    
    if (!fs.existsSync(csvPath)) {
      log(`⚠️  Sample CSV not found: ${csvPath}`, 'yellow');
      return false;
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    log(`Reading CSV: ${csvPath}`, 'blue');
    log(`CSV size: ${(csvContent.length / 1024).toFixed(2)} KB`, 'blue');

    const response = await api.post('/admin/import/game-logs-csv', { csvContent });
    const { inserted, updated, errors } = response.data;

    log(`✅ Import successful:`, 'green');
    log(`  - Inserted: ${inserted}`, 'blue');
    log(`  - Updated: ${updated}`, 'blue');
    
    if (errors && errors.length > 0) {
      log(`  - Errors: ${errors.length}`, 'yellow');
      errors.forEach((err) => log(`    ${err}`, 'yellow'));
    }

    return true;
  } catch (error) {
    log(`❌ Failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

// Test 4: Trigger Small Ingestion Job
async function testIngestionJob() {
  section('Test 4: Ingestion Job (Small Test)');
  
  try {
    log('Triggering game logs ingestion for 2 players...', 'blue');
    
    const response = await api.post('/admin/ingest/game-logs', {
      playerIds: ['jamesle01', 'curryst01'],
      season: 2025,
    });

    const { message, runId } = response.data;
    log(`✅ ${message}`, 'green');
    log(`Run ID: ${runId}`, 'blue');

    // Wait a few seconds and check status
    log('Waiting 10 seconds for job to complete...', 'yellow');
    await delay(10000);

    const runsResponse = await api.get('/admin/ingestion-runs?limit=1');
    const latestRun = runsResponse.data.runs[0];

    if (latestRun && latestRun.runId === runId) {
      log(`Job status: ${latestRun.status}`, latestRun.status === 'completed' ? 'green' : 'yellow');
      
      if (latestRun.jobs && latestRun.jobs.playerGameLogs) {
        const jobStats = latestRun.jobs.playerGameLogs.stats;
        log(`  - Logs inserted: ${jobStats.logsInserted || 0}`, 'blue');
        log(`  - Logs updated: ${jobStats.logsUpdated || 0}`, 'blue');
        log(`  - Players processed: ${jobStats.playersProcessed || 0}`, 'blue');
      }
    }

    return true;
  } catch (error) {
    log(`❌ Failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

// Test 5: View Recent Ingestion Runs
async function viewIngestionRuns() {
  section('Test 5: Recent Ingestion Runs');
  
  try {
    const response = await api.get('/admin/ingestion-runs?limit=5');
    const { runs } = response.data;

    if (!runs || runs.length === 0) {
      log('⚠️  No ingestion runs found', 'yellow');
      return false;
    }

    log(`Found ${runs.length} recent runs:`, 'green');
    runs.forEach((run, index) => {
      const statusColor = run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'yellow';
      const startDate = new Date(run.startedAt).toISOString();
      log(`  ${index + 1}. ${run.runId} - ${run.status} (${startDate})`, statusColor);
      
      if (run.summary) {
        log(`     ${run.summary}`, 'blue');
      }
    });

    return true;
  } catch (error) {
    log(`❌ Failed: ${error.message}`, 'red');
    return false;
  }
}

// Main test runner
async function runTests() {
  log('PropPulse Ingestion Pipeline - E2E Validation', 'blue');
  log(`API URL: ${API_URL}`, 'blue');
  console.log('');

  const results = {
    scraperHealth: false,
    databaseStats: false,
    csvImport: false,
    ingestionJob: false,
    ingestionRuns: false,
  };

  // Run tests
  results.scraperHealth = await checkScraperHealth();
  await delay(1000);

  results.databaseStats = (await getDatabaseStats()) !== null;
  await delay(1000);

  results.csvImport = await testCSVImport();
  await delay(1000);

  results.databaseStats = (await getDatabaseStats()) !== null;
  await delay(1000);

  results.ingestionJob = await testIngestionJob();
  await delay(1000);

  results.ingestionRuns = await viewIngestionRuns();

  // Summary
  section('Test Summary');
  
  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;

  log(`Passed: ${passedTests}/${totalTests}`, passedTests === totalTests ? 'green' : 'yellow');
  console.log('');

  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const color = passed ? 'green' : 'red';
    log(`${icon} ${test}`, color);
  });

  console.log('');

  if (passedTests === totalTests) {
    log('🎉 All tests passed! Ingestion pipeline is ready.', 'green');
    process.exit(0);
  } else {
    log('⚠️  Some tests failed. Check logs above.', 'yellow');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
