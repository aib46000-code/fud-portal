const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('Z:/nonexistent/folder/db.sqlite', (err) => {
  if (err) {
    console.error('SQLITE ERROR:', err.message);
    process.exit(1);
  }
  console.log('Opened successfully');
});
