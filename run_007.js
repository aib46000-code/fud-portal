const fs = require('fs');
const path = require('path');
const { exec } = require('./backend/database/db');

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'backend/database/migrations/007_performance_indexes.sql'), 'utf8');
    await exec(sql);
    console.log('Migration 007 (Performance Indexes) applied successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error applying migration 007:', err);
    process.exit(1);
  }
}

run();
