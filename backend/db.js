// SQLite wrapper with Promise-based run/get/all helpers and auto-init.
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const config = require('./config');

// Ensure directory exists
const dbDir = path.dirname(config.db.file);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(config.db.file);
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

async function init() {
  if (!fs.existsSync(config.db.schemaFile)) {
    throw new Error(`Schema file not found: ${config.db.schemaFile}`);
  }
  const schema = fs.readFileSync(config.db.schemaFile, 'utf8');
  await exec(schema);
  await runLazyMigrations();
}

// Lazy ALTER TABLE for columns added after initial schema — keeps existing DBs usable.
async function runLazyMigrations() {
  const addIfMissing = async (table, column, defn) => {
    const cols = await all(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) {
      await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${defn}`);
    }
  };
  await addIfMissing('contracts', 'client_signature_url', 'TEXT');
  await addIfMissing('contracts', 'firm_signature_url', 'TEXT');
  await addIfMissing('hearings', 'reminder_sent', 'INTEGER DEFAULT 0');
}

module.exports = { db, run, get, all, exec, init };
