const tg = window.Telegram?.WebApp;

const API = "https://mellstroinost.onrender.com";

const statusEl = document.getElementById("status");
const petImgEl = document.getElementById("petImg");
const visualLabelEl = document.getElementById("visualLabel");
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

// Функция для обновления картинки питомца в зависимости от его состояния
function renderPetImage(me) {
  if (!petImgEl) return;

  // Получаем состояние питомца (по умолчанию "mid")
  const vs = me.pet?.visualState || "mid";  // Если visualState не найден, ставим "mid" по умолчанию

  console.log(`Питомец находится в состоянии: ${vs}`);  // Логируем состояние питомца для отладки

  // Карты для состояний (bad, mid, good)
  const srcMap = {
    bad: "./assets/bad.jpg",   // Картинка для плохого состояния
    mid: "./assets/mid.jpg",   // Картинка для среднего состояния
    good: "./assets/happy.jpg", // Картинка для хорошего состояния
  };

  // Устанавливаем картинку в зависимости от состояния питомца
  petImgEl.src = srcMap[vs] || srcMap.mid;  // Если состояние не найдено, по умолчанию будет mid.jpg

  // Обновляем текстовое описание состояния питомца
  if (visualLabelEl) {
    const labelMap = {
      bad: "😵 Плохое",
      mid: "😐 Среднее",
      good: "😄 Хорошее",
    };
    visualLabelEl.textContent = `Состояние: ${labelMap[vs] || "—"}`;  // Отображаем описание состояния питомца
  }
}

function clamp100(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// Функция для обновления состояния "баров"
function setBar(el, value) {
  if (!el) return;
  const v = clamp100(value);
  el.style.width = v + "%";

  // Цветовая индикация в зависимости от значения
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

// Функция для отправки JSON на сервер
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

// Функция для получения JSON с сервера
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


// Функция для загрузки информации о пользователе и питомце
// Логируем состояние питомца для отладки
async function loadMe() {
  const me = await getJson(`${API}/me`, token);  // Получаем актуальные данные с сервера
  console.log(me); // Логируем весь объект, чтобы убедиться в получении данных
  setStatus(`Привет, ${me.user.first_name}!`);
  
  // Убедимся, что состояние питомца передается в renderPetImage
  renderPetImage(me);  // Вызываем рендер питомца с актуальным состоянием
  render(me);  // Рендерим другие данные
  return me;  // Возвращаем данные
}

// Рендерим доступные комнаты
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

// Рендерим доступные действия в зависимости от выбранной комнаты
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

// Текст для состояния эмоции питомца
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

// Функция для рендеринга информации о пользователе и питомце
function renderMe(me) {
  const { user, pet, moodState } = me;

  if (petNameEl) {
    const uname = user?.username ? `@${user.username}` : "@-";
    petNameEl.textContent = `Игрок: ${user?.first_name || "-"} (${uname})`;
  }

  // Уровень / XP / Монеты
  if (levelInfoEl) {
    const lvl = user?.level ?? 1;
    const xp = user?.xp ?? 0;
    const coins = user?.coins ?? 0;
    const threshold = (lvl || 1) * 50;
    levelInfoEl.textContent = `Уровень: ${lvl} | XP: ${xp}/${threshold} | Монеты: ${coins}`;
  }

  // Обновляем бары для голода, настроения, энергии и чистоты
  setBar(hungerBar, pet?.hunger);
  setBar(moodBar, pet?.mood);
  setBar(energyBar, pet?.energy);
  setBar(cleanBar, pet?.cleanliness);

  // Статус питомца
  if (stateTextEl) {
    const sleepTxt = pet?.state === "sleeping" ? "😴 Питомец спит" : "☀️ Питомец бодрствует";
    stateTextEl.textContent = `${sleepTxt} • Эмоция: ${moodText(moodState)}`;
  }

  // Отладочная информация
  if (debugEl) {
    debugEl.textContent = safeJson(me);
  }
}

// Функция для выполнения действия с питомцем
// Функция для выполнения действия с питомцем (например, кормление)
async function doAction(type) {
  setBusy(true);
  setStatus("Действие...");

  try {
    await postJson(`${API}/action`, { type }, token);  // Отправляем запрос на сервер
    const me = await loadMe();  // Загружаем обновленные данные питомца
    renderPetImage(me);  // Обновляем картинку питомца
    renderMe(me);  // Обновляем информацию о питомце
    setStatus(`Ок: ${type} • ${moodText(me.moodState)}`);
  } catch (e) {
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
function render(me) {
  const { user, pet, moodState } = me;

  // 1) Обновляем имя игрока
  if (petNameEl) {
    const uname = user?.username ? `@${user.username}` : "@-";
    petNameEl.textContent = `Игрок: ${user?.first_name || "-"} (${uname})`;
  }

  // 2) Обновляем информацию об уровне и XP
  if (levelInfoEl) {
    const lvl = user?.level ?? 1;
    const xp = user?.xp ?? 0;
    const coins = user?.coins ?? 0;
    const threshold = (lvl || 1) * 50;
    levelInfoEl.textContent = `Уровень: ${lvl} | XP: ${xp}/${threshold} | Монеты: ${coins}`;
  }

  // 3) Обновляем бары (голод, настроение, энергия и чистота)
  setBar(hungerBar, pet?.hunger);
  setBar(moodBar, pet?.mood);
  setBar(energyBar, pet?.energy);
  setBar(cleanBar, pet?.cleanliness);

  // 4) Обновляем статус питомца (спит или бодрствует)
  if (stateTextEl) {
    const sleepTxt = pet?.state === "sleeping" ? "😴 Питомец спит" : "☀️ Питомец бодрствует";
    stateTextEl.textContent = `${sleepTxt} • Эмоция: ${moodText(moodState)}`;
  }

  // 5) Обновляем картинку питомца в зависимости от состояния
  renderPetImage(me);

  // 6) Отладочная информация (если нужно)
  if (debugEl) {
    debugEl.textContent = safeJson(me);
  }
}

// Основная функция, которая запускает бота и отображение
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