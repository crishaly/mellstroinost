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
const sceneEl = document.getElementById("scene");
const debugEl = document.getElementById("debug");
const foodScreenEl = document.getElementById("foodScreen");
const foodPrevBtn = document.getElementById("foodPrevBtn");
const foodNextBtn = document.getElementById("foodNextBtn");
const foodExitBtn = document.getElementById("foodExitBtn");
const foodFeedBtn = document.getElementById("foodFeedBtn");
const foodEmojiEl = document.getElementById("foodEmoji");
const foodNameEl = document.getElementById("foodName");
const foodDescEl = document.getElementById("foodDesc");
const foodMetaEl = document.getElementById("foodMeta");
const dailyBtn = document.getElementById("dailyBtn");
const dailyHint = document.getElementById("dailyHint");
const petFxEl = document.getElementById("petFx");
const toastEl = document.getElementById("toast");
const lvlNumEl = document.getElementById("lvlNum");
const xpFillEl = document.getElementById("xpFill");
const coinsNumEl = document.getElementById("coinsNum");

const dailyPopupEl = document.getElementById("dailyPopup");
const dailyCloseBtn = document.getElementById("dailyCloseBtn");
const dailyClaimBtn = document.getElementById("dailyClaimBtn");
const dailyPopupHintEl = document.getElementById("dailyPopupHint");
let token = null;
let currentRoom = "kitchen";
let isBusy = false;
let mode = "main"; // "main" | "food"
let meCache = null;          // последнее состояние /me
let shopFood = [];           // список еды с сервера (цены/эффекты)
let invMap = {};             // item_id -> qty

const ROOMS = [
  { id: "kitchen", label: "🍽️" },
  { id: "bedroom", label: "🛏️" },
  { id: "bathroom", label: "🧼" },
  { id: "playroom", label: "🎮" },
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

const FOODS = [
  { id: "apple", emoji: "🍎", name: "Яблоко" },
  { id: "pizza", emoji: "🍕", name: "Пицца" },
  { id: "fish",  emoji: "🐟", name: "Рыбка" },
  { id: "cake",  emoji: "🍰", name: "Тортик" },
];

let foodIndex = 0;

let toastTimer = null;

function setStatus(text) {
  if (!toastEl) return;
  if (!text) return;

  toastEl.textContent = text;
  toastEl.style.display = "block";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.display = "none";
  }, 2200);
}

function setBusy(v) {
  isBusy = v;

  // отключаем/включаем все кнопки
  document.querySelectorAll("button").forEach((b) => {
    b.disabled = v;
  });

  // но daily должен оставаться disabled, если уже получен
  if (dailyBtn && meCache?.dailyClaimedToday) {
    dailyBtn.disabled = true;
  }
}
function fxPop(emoji) {
  if (!petFxEl) return;
  const el = document.createElement("div");
  el.className = "fxPop";
  el.textContent = emoji;
  petFxEl.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function renderPetImage(me) {
  if (!petImgEl) return;

  const vs = me.visualState || "mid";

  // ⭐ маппинг: good -> happy.gif (анимация), остальное jpg
  const srcMap = {
    bad: "./assets/bad.jpg",
    mid: "./assets/mid.jpg",
    good: "./assets/happy.gif", // <- твой gif
  };

  const labelMap = {
    bad: "😵 Плохое",
    mid: "😐 Среднее",
    good: "😄 Хорошее",
  };

  const nextSrc = srcMap[vs] || srcMap.mid;

  // "дыхание" включаем всегда (не мешает gif)
  petImgEl.classList.add("idle-breathe");

  // меняем src только если реально изменился (чтобы gif не перезагружался постоянно)
  const cur = petImgEl.getAttribute("data-src") || "";
  if (cur !== nextSrc) {
    petImgEl.setAttribute("data-src", nextSrc);
    petImgEl.src = nextSrc;
  }

  if (visualLabelEl) {
    visualLabelEl.textContent = `Состояние: ${labelMap[vs] || "—"}`;
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
function rebuildInventoryMap(inventoryArr) {
  const m = {};
  (inventoryArr || []).forEach((it) => {
    m[it.item_id] = Number(it.qty) || 0;
  });
  invMap = m;
}

function getQty(itemId) {
  return Number(invMap[itemId]) || 0;
}

async function loadShopFood() {
  const j = await getJson(`${API}/shop/food`, token);
  shopFood = j.items || [];
}
async function claimDaily() {
  if (isBusy) return;

  try {
    setBusy(true);
    setStatus("Получаем награду...");

    const r = await postJson(`${API}/daily/claim`, {}, token);

    // обновим состояние пользователя/монет
    await loadMe();

    setStatus(`🎁 Получено: +${r.reward} монет`);
    if (dailyHint) dailyHint.textContent = `Получено сегодня: +${r.reward}.`;
  } catch (e) {
    const msg = String(e.message || e);

    if (msg.includes("already claimed")) {
      setStatus("🎁 Ты уже получала награду сегодня.");
      if (dailyHint) dailyHint.textContent = "Уже получено сегодня. Приходи завтра 🙂";
      return;
    }

    setStatus("Ошибка: " + msg);
  } finally {
    setBusy(false);
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
  const me = await getJson(`${API}/me`, token);

  meCache = me;
  rebuildInventoryMap(me.inventory);
  maybeShowDailyPopup(me);

  // daily UI
  if (dailyBtn) {
    const claimed = !!me.dailyClaimedToday;
    dailyBtn.disabled = claimed || isBusy;
    dailyBtn.textContent = claimed ? "🎁 Уже получено сегодня" : "Получить ежедневные монеты";
  }
  if (dailyHint) {
    dailyHint.textContent = me.dailyClaimedToday
      ? "Уже получено сегодня. Приходи завтра 🙂"
      : "Можно получить 1 раз в сутки.";
  }
  
  renderPetImage(me);
  render(me);
  runIdleFxIfNeeded(me);

  // если мы на экране еды — перерендерим мету еды (qty/price)
  if (mode === "food") renderFood();

  return me;
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

      // 🔥 меняем фон сцены
      if (sceneEl) {
        sceneEl.className = "scene scene--" + currentRoom;
      }

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
        if (type === "feed") {
          openFoodMenu();
          return;
        }
        await doAction(type);
      } catch (e) {
        setStatus("Ошибка: " + e.message);
      }
    };
    actionsEl.appendChild(b);
  });
}
setMode("main");
if (sceneEl) {
  sceneEl.className = "scene scene--" + currentRoom;
}

function setMode(next) {
  mode = next;

  // main UI blocks
  const actionsCard = document.querySelector(".actionBar");
  const roomsCard = document.querySelector(".hudRooms");

  if (actionsCard) actionsCard.style.display = (mode === "main") ? "" : "none";
  if (roomsCard) roomsCard.style.display = (mode === "main") ? "" : "none";

  // overlay food UI
  if (foodScreenEl) foodScreenEl.style.display = (mode === "food") ? "flex" : "none";
}

function renderFood() {
  const uiItem = FOODS[foodIndex] || FOODS[0];
  if (!uiItem) return;

  const serverItem = (shopFood || []).find((x) => x.id === uiItem.id) || null;

  const price = serverItem ? (serverItem.price ?? 0) : 0;
  const hungerPlus = serverItem ? (serverItem.hunger ?? 0) : 0;
  const moodPlus = serverItem ? (serverItem.mood ?? 0) : 0;

  const qty = getQty(uiItem.id);
  const coins = meCache?.user?.coins ?? 0;

  if (foodEmojiEl) foodEmojiEl.textContent = uiItem.emoji;
  if (foodNameEl) foodNameEl.textContent = uiItem.name;

  // описание эффектов
  const parts = [];
  if (hungerPlus) parts.push(`+${hungerPlus} голод`);
  if (moodPlus) parts.push(`+${moodPlus} настроение`);
  if (foodDescEl) foodDescEl.textContent = parts.length ? parts.join(" • ") : "—";

  // meta: цена/наличие
  if (foodMetaEl) {
    foodMetaEl.textContent = `Цена: ${price} • В наличии: ${qty} • Монеты: ${coins}`;
  }

  // кнопка: использовать или купить
  if (foodFeedBtn) {
    if (qty > 0) {
      foodFeedBtn.textContent = "✅ Использовать";
      foodFeedBtn.disabled = isBusy;
    } else {
      foodFeedBtn.textContent = price > 0 ? `🛒 Купить (${price})` : "🛒 Взять бесплатно";
      foodFeedBtn.disabled = isBusy || coins < price;
    }
  }
}

function openFoodMenu() {
  currentRoom = "kitchen"; // логично: кормление только в кухне
  renderRooms();
  setMode("food");
  renderFood();
}

function closeFoodMenu() {
  setMode("main");
}
// food menu buttons
if (foodPrevBtn) foodPrevBtn.onclick = () => { if (!isBusy) { foodIndex = (foodIndex - 1 + FOODS.length) % FOODS.length; renderFood(); } };
if (foodNextBtn) foodNextBtn.onclick = () => { if (!isBusy) { foodIndex = (foodIndex + 1) % FOODS.length; renderFood(); } };
if (foodExitBtn) foodExitBtn.onclick = () => { if (!isBusy) closeFoodMenu(); };

if (foodFeedBtn) foodFeedBtn.onclick = async () => {
  if (isBusy) return;

  const uiItem = FOODS[foodIndex] || FOODS[0];
  if (!uiItem) return;

  const serverItem = (shopFood || []).find((x) => x.id === uiItem.id) || null;
  const price = serverItem ? (serverItem.price ?? 0) : 0;

  const qty = getQty(uiItem.id);

  try {
    setBusy(true);

    if (qty > 0) {
      // ✅ использовать из инвентаря
      await postJson(`${API}/food/use`, { itemId: uiItem.id }, token);
      await loadMe();
          if (dailyCloseBtn) {
      dailyCloseBtn.onclick = () => {
        if (dailyPopupEl) dailyPopupEl.style.display = "none";
      };
    }

    if (dailyClaimBtn) {
      dailyClaimBtn.onclick = async () => {
        if (isBusy) return;
        try {
          setBusy(true);
          const r = await postJson(`${API}/daily/claim`, {}, token);
          if (dailyPopupHintEl) dailyPopupHintEl.textContent = `Получено: +${r.reward} монет`;
          await loadMe();
          setStatus(`🎁 +${r.reward} монет`);

          // закрыть попап через секунду
          setTimeout(() => {
            if (dailyPopupEl) dailyPopupEl.style.display = "none";
          }, 900);
        } catch (e) {
          const msg = String(e.message || e);
          if (msg.includes("already claimed")) {
            if (dailyPopupHintEl) dailyPopupHintEl.textContent = "Уже получено сегодня 🙂";
            setTimeout(() => {
              if (dailyPopupEl) dailyPopupEl.style.display = "none";
            }, 700);
            return;
          }
          if (dailyPopupHintEl) dailyPopupHintEl.textContent = "Ошибка: " + msg;
          setStatus("Ошибка: " + msg);
        } finally {
          setBusy(false);
        }
      };
    }
      setStatus(`Ок: использовано ${uiItem.name}`);
      closeFoodMenu();
      return;
    }

    // ✅ купить (qty == 0)
    await postJson(`${API}/shop/buy`, { itemId: uiItem.id, qty: 1 }, token);
    await loadMe();
    setStatus(price > 0 ? `Ок: куплено ${uiItem.name}` : `Ок: взято ${uiItem.name}`);

    // после покупки остаёмся в меню — теперь станет “Использовать”
    renderFood();
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("not enough coins")) setStatus("Не хватает монет 😢");
    else setStatus("Ошибка: " + msg);
  } finally {
    setBusy(false);
  }
};

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
let lastUserInteractionAt = Date.now();
let lastIdleFxAt = 0;

function markInteraction() {
  lastUserInteractionAt = Date.now();
}

function idleEmojiByMood(moodState) {
  switch (moodState) {
    case "hungry": return "🍔";
    case "dirty": return "🧼";
    case "tired": return "⚡";
    case "sad": return "😢";
    case "happy": return "💖";
    case "sleeping": return "💤";
    default: return "✨";
  }
}
function todayKeyUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function maybeShowDailyPopup(me) {
  if (!dailyPopupEl) return;

  // если уже забрали — не показываем
  if (me.dailyClaimedToday) return;

  // показываем только 1 раз в сутки на устройстве
  const key = "daily_popup_shown_" + todayKeyUTC();
  if (localStorage.getItem(key) === "1") return;

  localStorage.setItem(key, "1");
  dailyPopupEl.style.display = "flex";

  if (dailyPopupHintEl) dailyPopupHintEl.textContent = "Забери награду и продолжай играть 🙂";
}

function runIdleFxIfNeeded(me) {
  const now = Date.now();
  const idleFor = now - lastUserInteractionAt;

  // если игрок ничего не делал 25+ секунд
  if (idleFor < 25000) return;

  // не чаще чем раз в 18 секунд
  if (now - lastIdleFxAt < 18000) return;

  lastIdleFxAt = now;
  fxPop(idleEmojiByMood(me.moodState));
}

// Функция для рендеринга информации о пользователе и питомце
function renderMe(me) {
  const { user, pet, moodState } = me;

  if (petNameEl) {
    const uname = user?.username ? `@${user.username}` : "@-";
    petNameEl.textContent = `Игрок: ${user?.first_name || "-"} (${uname})`;
  }

  // Уровень / XP / Монеты
  // Level + XP bar + coins (новый HUD)
  const lvl = user?.level ?? 1;
  const xp = user?.xp ?? 0;
  const coins = user?.coins ?? 0;
  const threshold = (lvl || 1) * 50;

  if (lvlNumEl) lvlNumEl.textContent = String(lvl);
  if (coinsNumEl) coinsNumEl.textContent = String(coins);

  const pct = threshold > 0 ? Math.max(0, Math.min(1, xp / threshold)) : 0;
  if (xpFillEl) xpFillEl.style.width = Math.round(pct * 100) + "%";

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
  markInteraction();
  setBusy(true);
  setStatus("Действие...");

  try {
    await postJson(`${API}/action`, { type }, token);  // Выполняем действие
    const me = await loadMe();  // Получаем обновленные данные питомца
    renderPetImage(me);  // Обновляем картинку питомца
    renderMe(me);  // Обновляем другие данные
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
  await loadShopFood();
  if (dailyBtn) {
    dailyBtn.onclick = () => claimDaily();
  }
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