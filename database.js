const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'dj_bot.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            file_id TEXT NOT NULL,
            file_name TEXT,
            title TEXT,
            performer TEXT,
            duration INTEGER,
            mime_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

module.exports = db;
