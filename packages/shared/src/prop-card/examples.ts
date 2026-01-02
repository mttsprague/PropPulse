/**
 * Prop Card Engine - Example Usage
 * 
 * Demonstrates all major features of the prop card computation engine.
 * These examples can be used as templates for integration.
 */

import {
  generatePropCardFromQuery,
  generatePropCardFromText,
  batchGeneratePropCards,
  parsePropQueryFromText,
  resolvePlayerId,
  getCachedPropCard,
  setCachedPropCard,
  cleanExpiredCache,
  getCacheStats,
  PropQuery,
  PropCard,
  FirestoreCollections,
} from './index';

// Mock Firestore setup (replace with actual Firebase Admin SDK)
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

const collections: FirestoreCollections = {
  players: db.collection('players'),
  teams: db.collection('teams'),
  games: db.collection('games'),
  playerGameStats: db.collection('playerGameStats'),
  injurySnapshots: db.collection('injurySnapshots'),
  computedPropCards: db.collection('computedPropCards'),
};

// =============================================================================
// Example 1: Generate card from structured query
// =============================================================================

async function example1_StructuredQuery() {
  console.log('\n=== Example 1: Structured Query ===\n');

  const query: PropQuery = {
    playerId: 'anthony-edwards',
    statType: 'PTS',
    line: 26.5,
    side: 'OVER',
    gameDate: '2025-01-15', // Optional, defaults to today
  };

  const card = await generatePropCardFromQuery(query, collections);

  // Access various parts of the card
  console.log('Player:', card.meta.playerName);
  console.log('Line:', card.meta.side, card.meta.line, card.meta.statType);
  console.log('\nLast 10 games:');
  console.log(`  Record: ${card.summary.last10.wins}-${card.summary.last10.losses}`);
  console.log(`  Hit rate: ${(card.summary.last10.hitRate * 100).toFixed(1)}%`);
  console.log(`  Average: ${card.summary.last10.avg.toFixed(1)}`);

  console.log('\nQuick Insights:');
  card.summary.quickInsights.forEach((insight, i) => {
    console.log(`  ${i + 1}. ${insight}`);
  });

  console.log('\nTrend:', card.trend.trendDirection);
  console.log('Volatility Score:', card.pro.distribution.volatilityScore);

  return card;
}

// =============================================================================
// Example 2: Generate card from natural language
// =============================================================================

async function example2_NaturalLanguage() {
  console.log('\n=== Example 2: Natural Language Parsing ===\n');

  const queries = [
    'Anthony Edwards over 26.5 points',
    'LeBron James under 8.5 assists',
    'Stephen Curry O 4.5 rebounds',
    'Durant U 27.5 PTS',
  ];

  for (const text of queries) {
    try {
      console.log(`Query: "${text}"`);

      const card = await generatePropCardFromText(text, collections);

      console.log(`  Player: ${card.meta.playerName}`);
      console.log(`  Line: ${card.meta.side} ${card.meta.line} ${card.meta.statType}`);
      console.log(`  Hit rate (L10): ${(card.summary.last10.hitRate * 100).toFixed(1)}%`);
      console.log('');
    } catch (error: any) {
      console.error(`  Error: ${error.message}\n`);
    }
  }
}

// =============================================================================
// Example 3: Parse query without generating card
// =============================================================================

async function example3_ParseOnly() {
  console.log('\n=== Example 3: Parse Query Only ===\n');

  const text = 'LeBron over 27.5 points';
  const parsed = parsePropQueryFromText(text);

  console.log('Input:', text);
  console.log('Parsed:');
  console.log('  Player name:', parsed.playerName);
  console.log('  Stat type:', parsed.statType);
  console.log('  Line:', parsed.line);
  console.log('  Side:', parsed.side);
  console.log('  Confidence:', (parsed.confidence * 100).toFixed(1) + '%');

  // Resolve player ID
  const playerId = await resolvePlayerId(parsed.playerName, collections.players);
  console.log('  Resolved player ID:', playerId);
}

// =============================================================================
// Example 4: Batch generate multiple cards
// =============================================================================

async function example4_BatchGenerate() {
  console.log('\n=== Example 4: Batch Generate ===\n');

  const queries: PropQuery[] = [
    { playerId: 'lebron-james', statType: 'PTS', line: 27.5, side: 'OVER' },
    { playerId: 'stephen-curry', statType: 'PTS', line: 25.5, side: 'OVER' },
    { playerId: 'nikola-jokic', statType: 'AST', line: 9.5, side: 'OVER' },
    { playerId: 'giannis-antetokounmpo', statType: 'REB', line: 11.5, side: 'OVER' },
  ];

  const startTime = Date.now();
  const cards = await batchGeneratePropCards(queries, collections);
  const elapsed = Date.now() - startTime;

  console.log(`Generated ${cards.length} cards in ${elapsed}ms`);
  console.log(`Average: ${(elapsed / cards.length).toFixed(0)}ms per card\n`);

  cards.forEach((card, i) => {
    console.log(`${i + 1}. ${card.meta.playerName} ${card.meta.side} ${card.meta.line} ${card.meta.statType}`);
    console.log(`   Hit rate: ${(card.summary.last10.hitRate * 100).toFixed(1)}%`);
  });
}

// =============================================================================
// Example 5: Cache management
// =============================================================================

async function example5_CacheManagement() {
  console.log('\n=== Example 5: Cache Management ===\n');

  const query: PropQuery = {
    playerId: 'anthony-edwards',
    statType: 'PTS',
    line: 26.5,
    side: 'OVER',
  };

  // Check cache first
  console.log('Checking cache...');
  let cached = await getCachedPropCard(query, collections.computedPropCards);

  if (cached) {
    console.log('✓ Cache HIT');
    console.log(`  Cached at: ${new Date(cached.meta.generatedAt).toLocaleString()}`);
    return cached;
  }

  console.log('✗ Cache MISS - generating new card...');

  // Generate and cache
  const card = await generatePropCardFromQuery(query, collections);
  await setCachedPropCard(query, card, collections.computedPropCards);

  console.log('✓ Card generated and cached');
  console.log(`  Generated at: ${new Date(card.meta.generatedAt).toLocaleString()}`);

  // Get cache stats
  const stats = await getCacheStats(collections.computedPropCards);
  console.log('\nCache statistics:');
  console.log(`  Total entries: ${stats.totalEntries}`);
  console.log(`  Valid entries: ${stats.validEntries}`);
  console.log(`  Expired entries: ${stats.expiredEntries}`);

  // Clean expired entries
  if (stats.expiredEntries > 0) {
    console.log('\nCleaning expired cache...');
    const deleted = await cleanExpiredCache(collections.computedPropCards);
    console.log(`✓ Deleted ${deleted} expired entries`);
  }

  return card;
}

// =============================================================================
// Example 6: Access detailed analytics
// =============================================================================

async function example6_DetailedAnalytics() {
  console.log('\n=== Example 6: Detailed Analytics ===\n');

  const query: PropQuery = {
    playerId: 'anthony-edwards',
    statType: 'PTS',
    line: 26.5,
    side: 'OVER',
  };

  const card = await generatePropCardFromQuery(query, collections);

  // Hit rates across windows
  console.log('Hit Rates:');
  console.log(`  Last 10: ${card.summary.last10.wins}-${card.summary.last10.losses} (${(card.summary.last10.hitRate * 100).toFixed(1)}%)`);
  console.log(`  Last 20: ${card.summary.last20.wins}-${card.summary.last20.losses} (${(card.summary.last20.hitRate * 100).toFixed(1)}%)`);
  console.log(`  Season:  ${card.summary.season.wins}-${card.summary.season.losses} (${(card.summary.season.hitRate * 100).toFixed(1)}%)`);

  // Splits
  console.log('\nHome/Away Split:');
  console.log(`  Home: ${card.pro.splits.home.wins}-${card.pro.splits.home.losses} (${(card.pro.splits.home.hitRate * 100).toFixed(1)}%)`);
  console.log(`  Away: ${card.pro.splits.away.wins}-${card.pro.splits.away.losses} (${(card.pro.splits.away.hitRate * 100).toFixed(1)}%)`);

  console.log('\nRest Day Split:');
  console.log(`  Back-to-back: ${card.pro.splits.rest0.wins}-${card.pro.splits.rest0.losses} (${(card.pro.splits.rest0.hitRate * 100).toFixed(1)}%)`);
  console.log(`  1 day rest:   ${card.pro.splits.rest1.wins}-${card.pro.splits.rest1.losses} (${(card.pro.splits.rest1.hitRate * 100).toFixed(1)}%)`);
  console.log(`  2+ days rest: ${card.pro.splits.rest2plus.wins}-${card.pro.splits.rest2plus.losses} (${(card.pro.splits.rest2plus.hitRate * 100).toFixed(1)}%)`);

  // Volatility
  console.log('\nVolatility Analysis:');
  console.log(`  Mean: ${card.pro.distribution.mean.toFixed(1)}`);
  console.log(`  Std Dev: ${card.pro.distribution.stdDev.toFixed(1)}`);
  console.log(`  Volatility Score: ${card.pro.distribution.volatilityScore}/100`);

  // Line sensitivity
  console.log('\nLine Sensitivity:');
  console.log(`  Near line rate: ${(card.pro.sensitivity.nearLineRate * 100).toFixed(1)}%`);
  console.log(`  Push rate: ${(card.pro.sensitivity.pushRate * 100).toFixed(1)}%`);
  console.log(`  Sensitivity score: ${card.pro.sensitivity.lineSensitivityScore}/100`);

  // Minutes stability
  console.log('\nMinutes Stability:');
  console.log(`  Std Dev: ${card.pro.stability.minutesStdDevLast10.toFixed(1)} min`);
  console.log(`  Stability Score: ${card.pro.stability.minutesStabilityScore}/100`);
  if (card.pro.stability.reliabilityNotes.length > 0) {
    console.log('  Notes:');
    card.pro.stability.reliabilityNotes.forEach((note) => {
      console.log(`    - ${note}`);
    });
  }

  // Context
  if (card.context.injuryStatus) {
    console.log('\nInjury Context:');
    console.log(`  Player status: ${card.context.injuryStatus.player.status}`);
    if (card.context.injuryStatus.teammatesOut) {
      console.log(`  Teammates out: ${card.context.injuryStatus.teammatesOut.length}`);
    }
  }

  if (card.context.scheduleContext) {
    console.log('\nSchedule Context:');
    console.log(`  Back-to-back: ${card.context.scheduleContext.backToBack ? 'Yes' : 'No'}`);
    console.log(`  Rest days: ${card.context.scheduleContext.restDays}`);
  }

  // Recent games
  console.log('\nLast 5 Games:');
  card.trend.last5GameLogs.forEach((log) => {
    const outcome = log.outcome === 'WIN' ? '✓' : log.outcome === 'LOSS' ? '✗' : '—';
    console.log(`  ${log.date} vs ${log.opponent}: ${log.statValue} pts (${log.minutes} min) ${outcome}`);
  });
}

// =============================================================================
// Example 7: Error handling
// =============================================================================

async function example7_ErrorHandling() {
  console.log('\n=== Example 7: Error Handling ===\n');

  // Invalid player ID
  try {
    const query: PropQuery = {
      playerId: 'nonexistent-player',
      statType: 'PTS',
      line: 27.5,
      side: 'OVER',
    };

    await generatePropCardFromQuery(query, collections);
  } catch (error: any) {
    console.log('✓ Caught error for invalid player ID:');
    console.log(`  ${error.message}`);
  }

  // Invalid player name
  try {
    await generatePropCardFromText(
      'Unknown Player over 27.5 points',
      collections
    );
  } catch (error: any) {
    console.log('\n✓ Caught error for unknown player name:');
    console.log(`  ${error.message}`);
  }

  // Low confidence parse
  const parsed = parsePropQueryFromText('27.5 points');
  console.log('\n✓ Low confidence parse:');
  console.log(`  Confidence: ${(parsed.confidence * 100).toFixed(1)}%`);
  console.log(`  This would fail validation`);
}

// =============================================================================
// Example 8: Real-world integration (Express API endpoint)
// =============================================================================

async function example8_ExpressIntegration() {
  console.log('\n=== Example 8: Express API Integration ===\n');

  // Simulated Express request handler
  const handlePropCardRequest = async (req: any, res: any) => {
    try {
      const { playerId, statType, line, side, gameDate } = req.body;

      // Validate input
      if (!playerId || !statType || !line || !side) {
        return res.status(400).json({
          error: 'Missing required fields: playerId, statType, line, side',
        });
      }

      // Generate card
      const query: PropQuery = { playerId, statType, line, side, gameDate };
      const card = await generatePropCardFromQuery(query, collections);

      // Return card
      res.status(200).json({
        success: true,
        data: card,
      });
    } catch (error: any) {
      console.error('Error generating prop card:', error);

      res.status(500).json({
        error: 'Failed to generate prop card',
        message: error.message,
      });
    }
  };

  console.log('Express endpoint example:');
  console.log('  POST /api/prop-card');
  console.log('  Body: { playerId, statType, line, side, gameDate? }');
  console.log('  Response: { success: true, data: PropCard }');
}

// =============================================================================
// Run all examples
// =============================================================================

async function runAllExamples() {
  try {
    await example1_StructuredQuery();
    await example2_NaturalLanguage();
    await example3_ParseOnly();
    await example4_BatchGenerate();
    await example5_CacheManagement();
    await example6_DetailedAnalytics();
    await example7_ErrorHandling();
    await example8_ExpressIntegration();

    console.log('\n=== All examples completed ===\n');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export examples for documentation
export {
  example1_StructuredQuery,
  example2_NaturalLanguage,
  example3_ParseOnly,
  example4_BatchGenerate,
  example5_CacheManagement,
  example6_DetailedAnalytics,
  example7_ErrorHandling,
  example8_ExpressIntegration,
  runAllExamples,
};

// Uncomment to run examples
// runAllExamples();
