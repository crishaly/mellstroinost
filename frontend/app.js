const tg = window.Telegram?.WebApp;

const API = "https://mellstroinost.onrender.com";

const statusEl = document.getElementById("status");
const petNameEl = document.getElementById("petName");
const stateTextEl = document.getElementById("stateText");

const hungerBar = document.getElementById("hungerBar");
const moodBar = document.getElementById("moodBar");
const energyBar = document.getElementById("energyBar");
const cleanBar = document.getElementById("cleanBar");

const actionsBox = document.getElementById("actions");

let telegramId = null;
let loading = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function setBar(el, value) {
  el.style.width = Math.max(0, Math.min(100, value)) + "%";

  if (value < 30) el.style.background = "#ef4444";
  else if (value < 60) el.style.background = "#f59e0b";
  else el.style.background = "#22c55e";
}

function setLoading(state) {
  loading = state;
  document.querySelectorAll("button").forEach(b => b.disabled = state);
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function getJson(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function render(pet, user) {
  petNameEl.textContent = `Игрок: ${user.first_name} (@${user.username || "-"})`;

  setBar(hungerBar, pet.hunger);
  setBar(moodBar, pet.mood);
  setBar(energyBar, pet.energy);
  setBar(cleanBar, pet.cleanliness);

  stateTextEl.textContent = pet.state === "sleeping"
    ? "😴 Питомец спит"
    : "☀️ Питомец бодрствует";
}

async function loadState() {
  const me = await getJson(`${API}/me/${telegramId}`);
  render(me.pet, me.user);
}

async function doAction(type) {
  try {
    setLoading(true);
    setStatus("Выполняем действие...");
    await postJson(`${API}/action/${telegramId}`, { type });
    await loadState();
    setStatus("Готово");
  } catch (e) {
    setStatus("Ошибка: " + e.message);
  } finally {
    setLoading(false);
  }
}

function createButtons() {
  const actions = [
    ["feed", "🍔 Покормить"],
    ["pet", "🖐️ Погладить"],
    ["clean", "🧼 Убрать"],
    ["sleep", "😴 Спать"],
    ["wake", "☀️ Разбудить"],
  ];

  actions.forEach(([type, label]) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.onclick = () => doAction(type);
    actionsBox.appendChild(btn);
  });
}

async function main() {
  if (!tg) {
    setStatus("Открой внутри Telegram");
    return;
  }

  tg.ready();
  tg.expand();

  setStatus("Авторизация...");

  const initData = tg.initData;
  const user = tg.initDataUnsafe?.user;

  if (!user?.id) {
    setStatus("Нет данных пользователя");
    return;
  }

  const auth = await postJson(`${API}/auth/telegram`, { initData });
  telegramId = auth.telegram_id;

  createButtons();
  await loadState();

  setStatus("Игра загружена");

  setInterval(loadState, 15000); // автообновление каждые 15 секунд
}

main().catch(e => {
  setStatus("Ошибка: " + e.message);
});