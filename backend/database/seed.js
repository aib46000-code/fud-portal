'use strict';
/**
 * Standalone seed runner.
 * Usage: node backend/database/seed.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { initialize } = require('./db');

(async () => {
  console.log('[Seed] Initializing and seeding database…');
  await initialize();
  console.log('[Seed] ✅ Done.');
  process.exit(0);
})();
