/**
 * Seed Test Data Script
 * 
 * Run this to populate Firestore with test data for development.
 * 
 * Usage:
 * 1. Start Firebase emulators: firebase emulators:start
 * 2. Run: node seed-data.js
 * 
 * Or deploy and run against production (be careful!):
 * firebase functions:shell
 * > seedTestData()
 */

const admin = require('firebase-admin');

// Initialize (use emulator or production)
if (process.env.FIRESTORE_EMULATOR_HOST) {
  admin.initializeApp({ projectId: 'demo-proppulse' });
} else {
  admin.initializeApp();
}

const db = admin.firestore();

async function seedTestData() {
  console.log('Starting data seed...');

  // 1. Seed Teams
  console.log('Seeding teams...');
  const teams = [
    { id: 'LAL', name: 'Los Angeles Lakers', abbreviation: 'LAL', city: 'Los Angeles' },
    { id: 'GSW', name: 'Golden State Warriors', abbreviation: 'GSW', city: 'Golden State' },
    { id: 'BOS', name: 'Boston Celtics', abbreviation: 'BOS', city: 'Boston' },
    { id: 'MIA', name: 'Miami Heat', abbreviation: 'MIA', city: 'Miami' },
    { id: 'PHX', name: 'Phoenix Suns', abbreviation: 'PHX', city: 'Phoenix' },
  ];

  const teamBatch = db.batch();
  teams.forEach(team => {
    teamBatch.set(db.collection('teams').doc(team.id), team);
  });
  await teamBatch.commit();
  console.log(`Seeded ${teams.length} teams`);

  // 2. Seed Players
  console.log('Seeding players...');
  const players = [
    { id: 'lebron', name: 'LeBron James', teamId: 'LAL', position: 'F', jerseyNumber: '23' },
    { id: 'curry', name: 'Stephen Curry', teamId: 'GSW', position: 'G', jerseyNumber: '30' },
    { id: 'tatum', name: 'Jayson Tatum', teamId: 'BOS', position: 'F', jerseyNumber: '0' },
    { id: 'butler', name: 'Jimmy Butler', teamId: 'MIA', position: 'F', jerseyNumber: '22' },
    { id: 'booker', name: 'Devin Booker', teamId: 'PHX', position: 'G', jerseyNumber: '1' },
  ];

  const playerBatch = db.batch();
  players.forEach(player => {
    playerBatch.set(db.collection('players').doc(player.id), {
      ...player,
      updatedAt: new Date().toISOString(),
    });
  });
  await playerBatch.commit();
  console.log(`Seeded ${players.length} players`);

  // 3. Seed Games
  console.log('Seeding games...');
  const games = [];
  const today = new Date();
  
  for (let i = 0; i < 20; i++) {
    const gameDate = new Date(today);
    gameDate.setDate(gameDate.getDate() - i);
    const dateStr = gameDate.toISOString().split('T')[0];
    
    games.push({
      id: `game_${i}`,
      date: dateStr,
      homeTeamId: teams[i % teams.length].id,
      awayTeamId: teams[(i + 1) % teams.length].id,
      status: 'final',
      homeScore: 110 + Math.floor(Math.random() * 20),
      awayScore: 105 + Math.floor(Math.random() * 20),
    });
  }

  const gameBatch = db.batch();
  games.forEach(game => {
    gameBatch.set(db.collection('games').doc(game.id), game);
  });
  await gameBatch.commit();
  console.log(`Seeded ${games.length} games`);

  // 4. Seed Player Game Stats
  console.log('Seeding player game stats...');
  const stats = [];

  players.forEach(player => {
    for (let i = 0; i < 20; i++) {
      const gameDate = new Date(today);
      gameDate.setDate(gameDate.getDate() - i);
      const dateStr = gameDate.toISOString().split('T')[0];
      
      // Generate realistic stats with some variance
      const basePts = player.id === 'lebron' ? 25 : player.id === 'curry' ? 28 : 23;
      const baseReb = player.position === 'F' ? 7 : 4;
      const baseAst = player.position === 'G' ? 6 : 5;
      
      stats.push({
        id: `${player.id}_game${i}`,
        playerId: player.id,
        gameId: `game_${i}`,
        date: dateStr,
        minutes: 32 + Math.floor(Math.random() * 8),
        pts: basePts + Math.floor(Math.random() * 15) - 5,
        reb: baseReb + Math.floor(Math.random() * 6) - 2,
        ast: baseAst + Math.floor(Math.random() * 8) - 3,
        opponentTeamId: teams[i % teams.length].id,
        homeAway: i % 2 === 0 ? 'home' : 'away',
        started: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  const statsBatch = db.batch();
  stats.forEach(stat => {
    statsBatch.set(db.collection('playerGameStats').doc(stat.id), stat);
  });
  await statsBatch.commit();
  console.log(`Seeded ${stats.length} player game stats`);

  // 5. Seed Injury Snapshot
  console.log('Seeding injury snapshot...');
  const injurySnapshot = {
    snapshotDateTime: new Date().toISOString(),
    players: [
      {
        playerId: 'ad',
        playerName: 'Anthony Davis',
        teamId: 'LAL',
        status: 'QUESTIONABLE',
        notes: 'Left ankle sprain',
      },
    ],
    createdAt: new Date().toISOString(),
  };

  await db.collection('injurySnapshots').add(injurySnapshot);
  console.log('Seeded injury snapshot');

  // 6. Seed Daily Changes
  console.log('Seeding daily changes...');
  const todayStr = new Date().toISOString().split('T')[0];
  const dailyChanges = {
    date: todayStr,
    changes: [
      {
        category: 'injury',
        playerId: 'ad',
        playerName: 'Anthony Davis',
        teamId: 'LAL',
        summary: 'Anthony Davis newly listed as QUESTIONABLE',
        severity: 'medium',
        details: { status: 'QUESTIONABLE', notes: 'Left ankle sprain' },
      },
      {
        category: 'minutes',
        playerId: 'lebron',
        summary: 'Large minutes change: +8.5 MPG (L10)',
        severity: 'high',
        details: { previousAvg: 33.2, currentAvg: 41.7, change: 8.5 },
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  await db.collection('dailyChanges').doc(todayStr).set(dailyChanges);
  console.log('Seeded daily changes');

  console.log('✅ Data seed complete!');
  console.log('\nYou can now:');
  console.log('1. Generate a prop card for "LeBron James O25.5 PTS"');
  console.log('2. View the daily feed on the dashboard');
  console.log('3. Test saving props and exporting');
}

// Run if called directly
if (require.main === module) {
  seedTestData()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error seeding data:', err);
      process.exit(1);
    });
}

module.exports = { seedTestData };
