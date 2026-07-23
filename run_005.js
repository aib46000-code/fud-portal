const fs = require('fs');
const path = require('path');
const { exec } = require('./backend/database/db');

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'backend/database/migrations/005_phase5_enterprise.sql'), 'utf8');
    await exec(sql);
    console.log('Migration 005 applied successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error applying migration 005:', err);
    process.exit(1);
  }
}

run();
