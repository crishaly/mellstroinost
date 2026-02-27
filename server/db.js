const Database = require("better-sqlite3");

const db = new Database("data.db");

// 1) Base tables (create if fresh DB)
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  coins INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pets (
  telegram_id INTEGER PRIMARY KEY,
  hunger INTEGER NOT NULL DEFAULT 80,
  mood INTEGER NOT NULL DEFAULT 80,
  energy INTEGER NOT NULL DEFAULT 80,
  cleanliness INTEGER NOT NULL DEFAULT 80,
  state TEXT NOT NULL DEFAULT 'awake',
  updated_at TEXT NOT NULL,
  last_action_at TEXT,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  telegram_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);
`);

// 2) Migrations for old DBs (safe: ignore errors)
function migrate() {
  // users
  try { db.prepare(`ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0`).run(); } catch {}
  try { db.prepare(`ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1`).run(); } catch {}
  try { db.prepare(`ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`).run(); } catch {}

  // pets
  try { db.prepare(`ALTER TABLE pets ADD COLUMN last_action_at TEXT`).run(); } catch {}

  // sessions table already handled by CREATE TABLE IF NOT EXISTS
}

migrate();

// 3) Recommended pragmas (optional but useful)
try { db.pragma("journal_mode = WAL"); } catch {}
try { db.pragma("foreign_keys = ON"); } catch {}

module.exports = db;