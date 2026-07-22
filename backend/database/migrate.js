'use strict';
/**
 * Standalone migration runner.
 * Usage: node backend/database/migrate.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { runMigration } = require('./db');

(async () => {
  console.log('[Migrate] Running FUD Portal database migrations…');
  await runMigration();
  console.log('[Migrate] ✅ Done.');
  process.exit(0);
})();
