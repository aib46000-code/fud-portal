const fs = require('fs');
const path = require('path');
const { exec } = require('./backend/database/db');

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'backend/database/migrations/006_analytics_columns.sql'), 'utf8');
    await exec(sql);
    console.log('Migration 006 applied successfully');
    process.exit(0);
  } catch (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('Columns already exist, skipping.');
      process.exit(0);
    }
    console.error('Error applying migration 006:', err);
    process.exit(1);
  }
}

run();
