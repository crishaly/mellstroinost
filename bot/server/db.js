const Database = require("better-sqlite3");

const db = new Database("data.db");

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
  hunger INTEGER NOT NULL,
  mood INTEGER NOT NULL,
  energy INTEGER NOT NULL,
  cleanliness INTEGER NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);
`);

module.exports = db;