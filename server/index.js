require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const db = require("./db");
const { verifyTelegramInitData } = require("./telegramVerify");

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- helpers --------------------
function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

// 3-state visual (based on average of 4 stats)
function computeAvgStat(pet) {
  const avg =
    (Number(pet.hunger) +
      Number(pet.mood) +
      Number(pet.energy) +
      Number(pet.cleanliness)) / 4;

  return Math.max(0, Math.min(100, Math.round(avg)));
}

function computeVisualState(avg) {
  // 0..29 bad, 30..59 mid, 60..100 good
  if (avg < 30) return "bad";
  if (avg < 60) return "mid";
  return "good";
}

function computeMoodState(pet) {
  if (pet.state === "sleeping") return "sleeping";
  if (pet.hunger < 25) return "hungry";
  if (pet.cleanliness < 25) return "dirty";
  if (pet.energy < 25) return "tired";
  if (pet.mood < 25) return "sad";
  if (pet.hunger > 70 && pet.cleanliness > 70 && pet.energy > 70 && pet.mood > 70) return "happy";
  return "ok";
}

function applyTimeDecay(pet) {
  const now = Date.now();
  const prev = new Date(pet.updated_at).getTime();
  const hours = Math.max(0, (now - prev) / 3600000);

  const hunger = Math.max(0, pet.hunger - Math.floor(hours * 6));
  const cleanliness = Math.max(0, pet.cleanliness - Math.floor(hours * 4));

  let energy = pet.energy;
  if (pet.state === "sleeping") energy = Math.min(100, pet.energy + Math.floor(hours * 10));
  else energy = Math.max(0, pet.energy - Math.floor(hours * 5));

  const penalty =
    (hunger < 30 ? 8 : 0) +
    (cleanliness < 30 ? 6 : 0) +
    (energy < 30 ? 8 : 0);

  const mood = Math.max(0, Math.min(100, pet.mood - Math.floor(hours * (2 + penalty / 10))));

  return { ...pet, hunger, cleanliness, energy, mood, updated_at: nowIso() };
}

function applyXp(user, pet, actionType) {
  const XP_PER_ACTION = 5;

  user.level = user.level ?? 1;
  user.xp = user.xp ?? 0;
  user.coins = user.coins ?? 0;

  user.xp += XP_PER_ACTION;

  let threshold = user.level * 50;

  while (user.xp >= threshold) {
    user.xp -= threshold;
    user.level += 1;
    user.coins += 10;

    // small bonus to pet
    pet.hunger = Math.min(100, pet.hunger + 10);
    pet.mood = Math.min(100, pet.mood + 10);
    pet.energy = Math.min(100, pet.energy + 10);
    pet.cleanliness = Math.min(100, pet.cleanliness + 10);

    threshold = user.level * 50;
  }
}

// -------------------- migrations (safe) --------------------
function ensureTablesAndColumns() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      telegram_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );
  `);

  // safe for older dbs (if columns already exist -> ignore)
  try { db.prepare(`ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0`).run(); } catch {}
  try { db.prepare(`ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1`).run(); } catch {}
  try { db.prepare(`ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`).run(); } catch {}

  try { db.prepare(`ALTER TABLE pets ADD COLUMN last_action_at TEXT`).run(); } catch {}
}

ensureTablesAndColumns();

// -------------------- auth middleware --------------------
function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "no token" });

  const token = m[1];
  const s = db.prepare(`SELECT * FROM sessions WHERE token=?`).get(token);
  if (!s) return res.status(401).json({ error: "bad token" });

  if (new Date(s.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ error: "token expired" });
  }

  req.telegramId = s.telegram_id;
  next();
}

// -------------------- routes --------------------
app.get("/", (req, res) => res.json({ status: "API working" }));

app.post("/auth/telegram", (req, res) => {
  const { initData } = req.body;

  if (!initData) return res.status(400).json({ error: "initData required" });
  if (!process.env.BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN not set" });

  const v = verifyTelegramInitData(initData, (process.env.BOT_TOKEN || "").trim());
  if (!v.ok) return res.status(401).json({ error: v.error });

  const u = v.user;
  const ts = nowIso();

  // create/update user without wiping progress
  db.prepare(`
    INSERT INTO users (telegram_id, first_name, username, coins, level, xp, created_at, last_seen_at)
    VALUES (?, ?, ?, 0, 1, 0, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      first_name=excluded.first_name,
      username=excluded.username,
      last_seen_at=excluded.last_seen_at
  `).run(u.id, u.first_name || "", u.username || "", ts, ts);

  // create pet if missing
  const pet = db.prepare(`SELECT * FROM pets WHERE telegram_id=?`).get(u.id);
  if (!pet) {
    db.prepare(`
      INSERT INTO pets (telegram_id, hunger, mood, energy, cleanliness, state, updated_at, last_action_at)
      VALUES (?, 80, 80, 80, 80, 'awake', ?, NULL)
    `).run(u.id, ts);
  }

  // new session token (7 days)
  const token = makeToken();
  db.prepare(`
    INSERT INTO sessions (token, telegram_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, u.id, ts, addDaysIso(7));

  res.json({ ok: true, token });
});

app.get("/me", requireAuth, (req, res) => {
  const telegramId = req.telegramId;

  const user = db.prepare(`SELECT * FROM users WHERE telegram_id=?`).get(telegramId);
  let pet = db.prepare(`SELECT * FROM pets WHERE telegram_id=?`).get(telegramId);
  if (!user || !pet) return res.status(404).json({ error: "not found" });

  // Применяем время убыли и обновляем статы питомца
  pet = applyTimeDecay(pet);

  db.prepare(`
    UPDATE pets
    SET hunger=?, mood=?, energy=?, cleanliness=?, state=?, updated_at=?
    WHERE telegram_id=?
  `).run(pet.hunger, pet.mood, pet.energy, pet.cleanliness, pet.state, pet.updated_at, telegramId);

  // Получаем состояние настроения питомца
  const moodState = computeMoodState(pet);

  // Вычисляем среднее значение статов для питомца
  const avgStat = computeAvgStat(pet);

  // Вычисляем визуальное состояние питомца на основе среднего значения статов
  const visualState = computeVisualState(avgStat);

  // Отправляем данные на фронт, включая visualState
  res.json({ 
    user, 
    pet, 
    moodState, 
    avgStat, 
    visualState // Включаем visualState в ответ
  });
});

app.post("/action", requireAuth, (req, res) => {
  const telegramId = req.telegramId;
  const { type } = req.body;

  let pet = db.prepare(`SELECT * FROM pets WHERE telegram_id=?`).get(telegramId);
  if (!pet) return res.status(404).json({ error: "pet not found" });

  let user = db.prepare(`SELECT * FROM users WHERE telegram_id=?`).get(telegramId);
  if (!user) return res.status(404).json({ error: "user not found" });

  // cooldown: 2 sec
  const now = Date.now();
  if (pet.last_action_at) {
    const last = new Date(pet.last_action_at).getTime();
    if (now - last < 2000) return res.status(429).json({ error: "too fast" });
  }

  pet = applyTimeDecay(pet);

  if (type === "feed") pet.hunger = Math.min(100, pet.hunger + 20);
  else if (type === "pet") pet.mood = Math.min(100, pet.mood + 15);
  else if (type === "clean") pet.cleanliness = Math.min(100, pet.cleanliness + 25);
  else if (type === "sleep") pet.state = "sleeping";
  else if (type === "wake") pet.state = "awake";
  else return res.status(400).json({ error: "unknown action" });

  applyXp(user, pet, type);

  pet.updated_at = nowIso();
  pet.last_action_at = nowIso();

  db.prepare(`
    UPDATE pets
    SET hunger=?, mood=?, energy=?, cleanliness=?, state=?, updated_at=?, last_action_at=?
    WHERE telegram_id=?
  `).run(
    pet.hunger,
    pet.mood,
    pet.energy,
    pet.cleanliness,
    pet.state,
    pet.updated_at,
    pet.last_action_at,
    telegramId
  );

  db.prepare(`
    UPDATE users
    SET coins=?, level=?, xp=?, last_seen_at=?
    WHERE telegram_id=?
  `).run(
    user.coins ?? 0,
    user.level ?? 1,
    user.xp ?? 0,
    nowIso(),
    telegramId
  );

  const moodState = computeMoodState(pet);
  const avgStat = computeAvgStat(pet);
  const visualState = computeVisualState(avgStat);

  res.json({ ok: true, user, pet, moodState, avgStat, visualState });
});

// optional: nicer 500 logs
app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({ error: "internal error" });
});

// -------------------- start --------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("API listening on port", PORT));