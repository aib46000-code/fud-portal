const path = require('path');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');
const dbPath = path.resolve(__dirname, 'backend/database/fud_portal.db');
const db = new sqlite3.Database(dbPath);
db.get("SELECT password_hash FROM users WHERE email='admin@fudportal.edu.ng'", async (err, row) => {
    if(err) console.error(err);
    else if(row) {
        const match = await bcrypt.compare('Admin@FUD2024', row.password_hash);
        console.log('Matches Admin@FUD2024?', match);
    }
});
