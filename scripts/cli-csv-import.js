#!/usr/bin/env node

/**
 * CSV Import CLI Tool
 * 
 * Usage:
 *   node cli-csv-import.js --file path/to/file.csv --type game-logs|injuries|roster
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL || 'http://localhost:5001/proppulse-dev/us-central1/api';
const ADMIN_KEY = process.env.ADMIN_KEY || 'dev-admin-key';

// Parse command line arguments
const args = process.argv.slice(2);
const argMap = {};

for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, '');
  const value = args[i + 1];
  argMap[key] = value;
}

const { file, type } = argMap;

if (!file || !type) {
  console.error('Usage: node cli-csv-import.js --file <path> --type <game-logs|injuries|roster>');
  process.exit(1);
}

if (!['game-logs', 'injuries', 'roster'].includes(type)) {
  console.error('Type must be one of: game-logs, injuries, roster');
  process.exit(1);
}

// Read CSV file
const filePath = path.resolve(file);

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const csvContent = fs.readFileSync(filePath, 'utf-8');

console.log(`Reading CSV file: ${filePath}`);
console.log(`CSV size: ${(csvContent.length / 1024).toFixed(2)} KB`);

// Map type to endpoint
const endpointMap = {
  'game-logs': '/admin/import/game-logs-csv',
  'injuries': '/admin/import/injuries-csv',
  'roster': '/admin/import/roster-csv',
};

const endpoint = endpointMap[type];
const url = `${FUNCTIONS_BASE_URL}${endpoint}`;

console.log(`Uploading to: ${url}`);
console.log('');

// Upload CSV
axios
  .post(
    url,
    { csvContent },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_KEY,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  )
  .then((response) => {
    console.log('✅ CSV import successful!');
    console.log('');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
  })
  .catch((error) => {
    console.error('❌ CSV import failed');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    
    process.exit(1);
  });
