// src/db/connection.js
// Uses sql.js - pure JavaScript SQLite, no Python or compilation needed.

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/v2.db');
const DATA_DIR = path.join(__dirname, '../../data');

let db = null;

// Save DB to disk after every write operation
function save() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Load or create the database synchronously-ish via async init
async function getDb() {
  if (db) return { db, save };

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON;');

  return { db, save };
}

module.exports = getDb;
