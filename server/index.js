require("dotenv").config();
const express = require("express");
const cors = require("cors");

const db = require("./db");
const { verifyTelegramInitData } = require("./telegramVerify");

const app = express();
app.use(cors());
app.use(express.json());

function nowIso() {
  return new Date().toISOString();
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

app.get("/", (req, res) => res.json({ status: "API working" }));

app.post("/auth/telegram", (req, res) => {
  const { initData } = req.body;

  if (!initData) return res.status(400).json({ error: "initData required" });
  if (!process.env.BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN not set in .env" });

  const v = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!v.ok) return res.status(401).json({ error: v.error });

  const u = v.user;
  const ts = nowIso();

  db.prepare(`
    INSERT INTO users (telegram_id, first_name, username, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      first_name=excluded.first_name,
      username=excluded.username,
      last_seen_at=excluded.last_seen_at
  `).run(u.id, u.first_name || "", u.username || "", ts, ts);

  const pet = db.prepare(`SELECT * FROM pets WHERE telegram_id=?`).get(u.id);
  if (!pet) {
    db.prepare(`
      INSERT INTO pets (telegram_id, hunger, mood, energy, cleanliness, state, updated_at)
      VALUES (?, 80, 80, 80, 80, 'awake', ?)
    `).run(u.id, ts);
  }

  res.json({ ok: true, telegram_id: u.id });
});

app.get("/me/:telegramId", (req, res) => {
  const telegramId = Number(req.params.telegramId);

  const user = db.prepare(`SELECT * FROM users WHERE telegram_id=?`).get(telegramId);
  let pet = db.prepare(`SELECT * FROM pets WHERE telegram_id=?`).get(telegramId);

  if (!user || !pet) return res.status(404).json({ error: "not found" });

  pet = applyTimeDecay(pet);

  db.prepare(`
    UPDATE pets SET hunger=?, mood=?, energy=?, cleanliness=?, state=?, updated_at=?
    WHERE telegram_id=?
  `).run(pet.hunger, pet.mood, pet.energy, pet.cleanliness, pet.state, pet.updated_at, telegramId);

  res.json({ user, pet });
});

app.post("/action/:telegramId", (req, res) => {
  const telegramId = Number(req.params.telegramId);
  const { type } = req.body;

  let pet = db.prepare(`SELECT * FROM pets WHERE telegram_id=?`).get(telegramId);
  if (!pet) return res.status(404).json({ error: "pet not found" });

  pet = applyTimeDecay(pet);

  if (type === "feed") pet.hunger = Math.min(100, pet.hunger + 20);
  else if (type === "pet") pet.mood = Math.min(100, pet.mood + 15);
  else if (type === "clean") pet.cleanliness = Math.min(100, pet.cleanliness + 25);
  else if (type === "sleep") pet.state = "sleeping";
  else if (type === "wake") pet.state = "awake";
  else return res.status(400).json({ error: "unknown action" });

  pet.updated_at = nowIso();

  db.prepare(`
    UPDATE pets SET hunger=?, mood=?, energy=?, cleanliness=?, state=?, updated_at=?
    WHERE telegram_id=?
  `).run(pet.hunger, pet.mood, pet.energy, pet.cleanliness, pet.state, pet.updated_at, telegramId);

  res.json({ ok: true, pet });
});

app.listen(process.env.PORT || 3001, () => {
  console.log("API listening on port", process.env.PORT || 3001);
});