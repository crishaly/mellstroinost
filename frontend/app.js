const tg = window.Telegram?.WebApp;

const API = "https://mellstroinost.onrender.com";

const statusEl = document.getElementById("status");
const petNameEl = document.getElementById("petName");
const stateTextEl = document.getElementById("stateText");

const hungerBar = document.getElementById("hungerBar");
const moodBar = document.getElementById("moodBar");
const energyBar = document.getElementById("energyBar");
const cleanBar = document.getElementById("cleanBar");

const levelInfoEl = document.getElementById("levelInfo");
const actionsEl = document.getElementById("actions");
const roomTabsEl = document.getElementById("roomTabs");

const debugEl = document.getElementById("debug");

let token = null;
let currentRoom = "kitchen";
let isBusy = false;

const ROOMS = [
  { id: "kitchen", label: "🍽️ Кухня" },
  { id: "bedroom", label: "🛏️ Спальня" },
  { id: "bathroom", label: "🧼 Ванная" },
  { id: "playroom", label: "🎮 Игровая" },
];

const ACTIONS_BY_ROOM = {
  kitchen: [
    ["feed", "🍔 Покормить"],
  ],
  bedroom: [
    ["sleep", "😴 Спать"],
    ["wake", "☀️ Разбудить"],
  ],
  bathroom: [
    ["clean", "🧼 Убрать"],
  ],
  playroom: [
    ["pet", "🖐️ Погладить"],
  ],
};

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setBusy(v) {
  isBusy = v;
  document.querySelectorAll("button").forEach((b) => {
    b.disabled = v;
  });
}

function clamp100(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function setBar(el, value) {
  if (!el) return;
  const v = clamp100(value);
  el.style.width = v + "%";

  // простая индикация цвета
  if (v < 30) el.style.background = "#ef4444";
  else if (v < 60) el.style.background = "#f59e0b";
  else el.style.background = "#22c55e";
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function postJson(url, body, token) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function getJson(url, token) {
  const r = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function loadMe() {
  return await getJson(`${API}/me`, token);
}

function renderRooms() {
  if (!roomTabsEl) return;

  roomTabsEl.innerHTML = "";

  ROOMS.forEach((room) => {
    const btn = document.createElement("div");
    btn.className = "tab" + (room.id === currentRoom ? " active" : "");
    btn.textContent = room.label;

    btn.onclick = () => {
      if (isBusy) return;
      currentRoom = room.id;
      renderRooms();
      renderActions();
    };

    roomTabsEl.appendChild(btn);
  });
}

function renderActions() {
  if (!actionsEl) return;

  actionsEl.innerHTML = "";

  const list = ACTIONS_BY_ROOM[currentRoom] || [];

  list.forEach(([type, label]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = async () => {
      try {
        await doAction(type);
      } catch (e) {
        setStatus("Ошибка: " + e.message);
      }
    };
    actionsEl.appendChild(b);
  });
}

function moodText(moodState) {
  switch (moodState) {
    case "sleeping": return "😴 Спит";
    case "hungry": return "🍔 Голодный";
    case "dirty": return "🧼 Грязный";
    case "tired": return "⚡ Устал";
    case "sad": return "😢 Грустит";
    case "happy": return "😄 Счастлив";
    case "ok": return "🙂 Норм";
    default: return "—";
  }
}

function renderMe(me) {
  const { user, pet, moodState } = me;

  if (petNameEl) {
    const uname = user?.username ? `@${user.username}` : "@-";
    petNameEl.textContent = `Игрок: ${user?.first_name || "-"} (${uname})`;
  }

  // уровни / xp / coins
  if (levelInfoEl) {
    const lvl = user?.level ?? 1;
    const xp = user?.xp ?? 0;
    const coins = user?.coins ?? 0;
    const threshold = (lvl || 1) * 50;
    levelInfoEl.textContent = `Уровень: ${lvl} | XP: ${xp}/${threshold} | Монеты: ${coins}`;
  }

  // бары
  setBar(hungerBar, pet?.hunger);
  setBar(moodBar, pet?.mood);
  setBar(energyBar, pet?.energy);
  setBar(cleanBar, pet?.cleanliness);

  // состояние
  if (stateTextEl) {
    const sleepTxt = pet?.state === "sleeping" ? "😴 Питомец спит" : "☀️ Питомец бодрствует";
    stateTextEl.textContent = `${sleepTxt} • Эмоция: ${moodText(moodState)}`;
  }

  // debug
  if (debugEl) {
    debugEl.textContent = safeJson(me);
  }
}

async function doAction(type) {
  setBusy(true);
  setStatus("Действие...");

  try {
    await postJson(`${API}/action`, { type }, token);
    const me = await loadMe();
    renderMe(me);
    setStatus(`Ок: ${type} • ${moodText(me.moodState)}`);
  } catch (e) {
    // если сервер вернул cooldown
    if (String(e.message).includes("too fast")) {
      setStatus("Слишком быстро 😅 Подожди пару секунд.");
    } else {
      setStatus("Ошибка: " + e.message);
    }
    throw e;
  } finally {
    setBusy(false);
  }
}

async function main() {
  if (!tg) {
    setStatus("Открой это внутри Telegram (Mini App).");
    return;
  }

  tg.ready();
  tg.expand();

  setStatus("Авторизация...");

  const initData = tg.initData;
  const user = tg.initDataUnsafe?.user;

  if (!user?.id) {
    setStatus("Нет данных пользователя (открой через кнопку бота).");
    if (debugEl) debugEl.textContent = safeJson({ initData, initUnsafe: tg.initDataUnsafe });
    return;
  }

  // auth -> token
  const auth = await postJson(`${API}/auth/telegram`, { initData }, null);
  token = auth.token;

  // initial render
  renderRooms();
  renderActions();

  const me = await loadMe();
  renderMe(me);

  setStatus(`Игра загружена • ${moodText(me.moodState)}`);

  // автообновление
  setInterval(async () => {
    try {
      const updated = await loadMe();
      renderMe(updated);
    } catch {
      // молча: не спамим статус
    }
  }, 15000);
}

main().catch((e) => setStatus("Ошибка: " + e.message));