const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./backend/database/fud_portal.db');
db.all("SELECT email, role FROM users WHERE role IN ('admin', 'superadmin')", (err, rows) => {
    if (err) console.error(err);
    else console.log("ADMIN USERS:", rows);
});
