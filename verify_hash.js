const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./backend/database/fud_portal.db');
db.get("SELECT password_hash FROM users WHERE email='admin@fudportal.edu.ng'", async (err, row) => {
    if(err) console.error(err);
    else if(row) {
        const match = await bcrypt.compare('Admin@FUD2024', row.password_hash);
        console.log('Matches Admin@FUD2024?', match);
    }
});
