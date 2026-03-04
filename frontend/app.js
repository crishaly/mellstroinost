const tg = window.Telegram?.WebApp;
const API = "https://mellstroinost.onrender.com";

/* --- DOM --- */
const petImgEl = document.getElementById("petImg");
const petFxEl = document.getElementById("petFx");

const hungerBar = document.getElementById("hungerBar");
const moodBar = document.getElementById("moodBar");
const energyBar = document.getElementById("energyBar");
const cleanBar = document.getElementById("cleanBar");

const actionsEl = document.getElementById("actions");
const roomTabsEl = document.getElementById("roomTabs");
const sceneEl = document.getElementById("scene");

const toastEl = document.getElementById("toast");
const lvlNumEl = document.getElementById("lvlNum");
const xpFillEl = document.getElementById("xpFill");
const coinsNumEl = document.getElementById("coinsNum");

/* food overlay */
const foodScreenEl = document.getElementById("foodScreen");
const foodPrevBtn = document.getElementById("foodPrevBtn");
const foodNextBtn = document.getElementById("foodNextBtn");
const foodExitBtn = document.getElementById("foodExitBtn");
const foodFeedBtn = document.getElementById("foodFeedBtn");
const foodEmojiEl = document.getElementById("foodEmoji");
const foodNameEl = document.getElementById("foodName");
const foodDescEl = document.getElementById("foodDesc");
const foodMetaEl = document.getElementById("foodMeta");

/* daily popup */
const dailyPopupEl = document.getElementById("dailyPopup");
const dailyCloseBtn = document.getElementById("dailyCloseBtn");
const dailyClaimBtn = document.getElementById("dailyClaimBtn");
const dailyPopupHintEl = document.getElementById("dailyPopupHint");

/* --- state --- */
let token = null;
let currentRoom = "kitchen";
let isBusy = false;
let mode = "main"; // main | food

let meCache = null;
let shopFood = [];
let invMap = {};
let foodIndex = 0;

/* ---------- config ---------- */
const ROOMS = [
  { id: "kitchen", label: "🍽️" },
  { id: "bedroom", label: "🛏️" },
  { id: "bathroom", label: "🧼" },
  { id: "playroom", label: "🎮" },
];

const ACTIONS_BY_ROOM = {
  kitchen: [["feed", "🍔"]],
  bedroom: [["sleepToggle", "🛏️"]],
  bathroom: [["clean", "🧼"]],
  playroom: [["pet", "🖐️"]],
};

const FOODS = [
  { id: "apple", emoji: "🍎", name: "Яблоко" },
  { id: "pizza", emoji: "🍕", name: "Пицца" },
  { id: "fish",  emoji: "🐟", name: "Рыбка" },
  { id: "cake",  emoji: "🍰", name: "Тортик" },
];

/* ---------- SFX: scroll per food + one eat ---------- */
/* ВАЖНО: покупку НЕ используем. */
const SFX = {
  // звук листания — РАЗНЫЙ для каждого блюда
  selectByFood: {
    apple: new Audio("./assets/apple.mp3"),
    pizza: new Audio("./assets/banana.mp3"),
    fish:  new Audio("./assets/grape.mp3"),
    cake:  new Audio("./assets/salad.mp3"),
  },
  // звук кормления — ОДИН на все блюда (поставь свой файл сюда)
  eat: new Audio("./assets/eat.mp3"),
};

const ALL_SOUNDS = [
  ...Object.values(SFX.selectByFood),
  SFX.eat,
];

ALL_SOUNDS.forEach(a => {
  a.preload = "auto";
  a.volume = 0.65;
  a.playsInline = true;
});

let audioUnlocked = false;
function unlockAudioOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  // iOS/Telegram: нужно "разбудить" аудио пользовательским тапом
  ALL_SOUNDS.forEach(a => {
    try {
      a.muted = true;
      a.play().then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      }).catch(() => {
        a.muted = false;
      });
    } catch {}
  });
}

function playSound(audio) {
  if (!audio) return;
  try {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {}
}

function playSelectSoundForFood(foodId) {
  playSound(SFX.selectByFood[foodId]);
}

/* ---------- helpers ---------- */
let toastTimer = null;
function setStatus(text) {
  if (!toastEl || !text) return;
  toastEl.textContent = text;
  toastEl.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.style.display = "none"), 2200);
}

function setBusy(v) {
  isBusy = v;
  document.querySelectorAll("button").forEach((b) => (b.disabled = v));
  renderActions(); // ✅ сразу обновляем disabled и тексты
}

function fxPop(emoji) {
  if (!petFxEl) return;
  const el = document.createElement("div");
  el.className = "fxPop";
  el.textContent = emoji;
  petFxEl.appendChild(el);
  setTimeout(() => el.remove(), 1000);
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
  if (v < 30) el.style.background = "#ef4444";
  else if (v < 60) el.style.background = "#f59e0b";
  else el.style.background = "#22c55e";
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

/* ---------- network ---------- */
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
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/* ---------- visuals ---------- */
function renderPetImage(me) {
  if (!petImgEl) return;
  const vs = me.visualState || "mid";

  const srcMap = {
    bad: "./assets/bad.png",
    mid: "./assets/mid.png",
    good: "./assets/happy.png",
  };

  const nextSrc = srcMap[vs] || srcMap.mid;
  petImgEl.classList.add("idle-breathe");

  const cur = petImgEl.getAttribute("data-src") || "";
  if (cur !== nextSrc) {
    petImgEl.setAttribute("data-src", nextSrc);
    petImgEl.src = nextSrc;
  }
}

let coinsShown = null;

function animateNumber(el, from, to, ms = 450) {
  if (!el) return;
  const start = performance.now();
  function tick(t) {
    const k = Math.min(1, (t - start) / ms);
    const v = Math.round(from + (to - from) * k);
    el.textContent = String(v);
    if (k < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderHud(me) {
  const user = me.user || {};
  const pet = me.pet || {};

  // level/xp/coins
  const lvl = user?.level ?? 1;
  const xp = user?.xp ?? 0;
  const coins = user?.coins ?? 0;

  const threshold = (lvl || 1) * 50;
  const pct = threshold > 0 ? Math.max(0, Math.min(1, xp / threshold)) : 0;

  if (lvlNumEl) lvlNumEl.textContent = String(lvl);
  if (xpFillEl) xpFillEl.style.width = Math.round(pct * 100) + "%";

  if (coinsNumEl) {
    if (coinsShown === null) {
      coinsShown = coins;
      coinsNumEl.textContent = String(coins);
    } else if (coinsShown !== coins) {
      animateNumber(coinsNumEl, coinsShown, coins, 500);
      coinsShown = coins;
    } else {
      coinsNumEl.textContent = String(coins);
    }
  }

  // stats
  setBar(hungerBar, pet.hunger);
  setBar(moodBar, pet.mood);
  setBar(energyBar, pet.energy);
  setBar(cleanBar, pet.cleanliness);
}

/* ---------- rooms/actions ---------- */
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

      if (sceneEl) {
        sceneEl.className = "scene scene--" + currentRoom;
        sceneEl.classList.add("scene--switch");
        setTimeout(() => sceneEl.classList.remove("scene--switch"), 220);
      }

      // если используешь bg--room на .game
      const gameEl = document.querySelector(".game");
      if (gameEl) {
        gameEl.classList.remove("bg--kitchen","bg--bedroom","bg--bathroom","bg--playroom");
        gameEl.classList.add("bg--" + currentRoom);
      }

      renderRooms();
      renderActions();
    };

    roomTabsEl.appendChild(btn);
  });
}

function canDoAction(me, type) {
  const pet = me?.pet || {};
  if (type === "feed") return (pet.hunger ?? 0) < 100;
  if (type === "clean") return (pet.cleanliness ?? 0) < 100;
  if (type === "pet") return (pet.mood ?? 0) < 100;
  return true;
}

function renderActions() {
  if (!actionsEl) return;
  actionsEl.innerHTML = "";

  const list = ACTIONS_BY_ROOM[currentRoom] || [];
  list.forEach(([type, label]) => {
    const b = document.createElement("button");

    // sleep toggle button
    if (type === "sleepToggle") {
      const sleeping = meCache?.pet?.state === "sleeping";
      b.textContent = sleeping ? "☀️ Разбудить" : "😴 Спать";
      b.disabled = isBusy;

      b.onclick = async () => {
        if (isBusy) return;
        try {
          const realType = sleeping ? "wake" : "sleep";
          await doAction(realType);
        } catch (e) {
          setStatus("Ошибка: " + e.message);
        }
      };

      actionsEl.appendChild(b);
      return;
    }

    // normal actions
    b.textContent = label;

    const allowed = canDoAction(meCache, type);
    b.disabled = isBusy || !allowed;

    b.onclick = async () => {
      if (!canDoAction(meCache, type)) {
        setStatus("Не нужно 🙂 Шкала уже полная.");
        return;
      }
      if (isBusy) return;

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

/* ---------- mode ---------- */
function setMode(next) {
  mode = next;
  const actionsBar = document.querySelector(".actionBar");
  const roomsBar = document.querySelector(".hudRooms");

  if (actionsBar) actionsBar.style.display = (mode === "main") ? "" : "none";
  if (roomsBar) roomsBar.style.display = (mode === "main") ? "" : "none";
  if (foodScreenEl) foodScreenEl.style.display = (mode === "food") ? "flex" : "none";
}

/* ---------- food ---------- */
async function loadShopFood() {
  const j = await getJson(`${API}/shop/food`, token);
  shopFood = j.items || [];
}

function renderFood({ playSelect = false } = {}) {
  const uiItem = FOODS[foodIndex] || FOODS[0];
  if (!uiItem) return;

  if (playSelect) playSelectSoundForFood(uiItem.id); // ✅ звук листания по еде

  const serverItem = (shopFood || []).find((x) => x.id === uiItem.id) || null;

  const price = serverItem ? (serverItem.price ?? 0) : 0;
  const hungerPlus = serverItem ? (serverItem.hunger ?? 0) : 0;
  const moodPlus = serverItem ? (serverItem.mood ?? 0) : 0;

  const qty = getQty(uiItem.id);
  const coins = meCache?.user?.coins ?? 0;

  if (foodEmojiEl) foodEmojiEl.textContent = uiItem.emoji;
  if (foodNameEl) foodNameEl.textContent = uiItem.name;

  const parts = [];
  if (hungerPlus) parts.push(`+${hungerPlus} голод`);
  if (moodPlus) parts.push(`+${moodPlus} настроение`);
  if (foodDescEl) foodDescEl.textContent = parts.length ? parts.join(" • ") : "—";

  if (foodMetaEl) foodMetaEl.textContent = `Цена: ${price} • В наличии: ${qty} • Монеты: ${coins}`;

  if (foodFeedBtn) {
    if ((meCache?.pet?.hunger ?? 0) >= 100) {
      foodFeedBtn.disabled = true;
      foodFeedBtn.textContent = "🍔 Уже сыт";
    } else if (qty > 0) {
      foodFeedBtn.textContent = "✅ Использовать";
      foodFeedBtn.disabled = isBusy;
    } else {
      foodFeedBtn.textContent = price > 0 ? `🛒 Купить (${price})` : "🛒 Взять бесплатно";
      foodFeedBtn.disabled = isBusy || coins < price;
    }
  }
}

function openFoodMenu() {
  currentRoom = "kitchen";
  if (sceneEl) sceneEl.className = "scene scene--kitchen";
  renderRooms();

  setMode("food");
  renderFood({ playSelect: true }); // ✅ при открытии меню тоже звук
}

function closeFoodMenu() {
  setMode("main");
}

/* ---------- daily popup ---------- */
function todayKeyUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function maybeShowDailyPopup(me) {
  if (!dailyPopupEl) return;
  if (me.dailyClaimedToday) return;

  const key = "daily_popup_shown_" + todayKeyUTC();
  if (localStorage.getItem(key) === "1") return;

  localStorage.setItem(key, "1");
  dailyPopupEl.style.display = "flex";
  if (dailyPopupHintEl) dailyPopupHintEl.textContent = "Забери награду и продолжай 🙂";
}

async function claimDailyFromPopup() {
  if (isBusy) return;
  try {
    setBusy(true);
    const r = await postJson(`${API}/daily/claim`, {}, token);
    if (dailyPopupHintEl) dailyPopupHintEl.textContent = `Получено: +${r.reward} монет`;
    await loadMe();
    fxPop("🪙");
    setStatus(`🎁 +${r.reward} монет`);
    setTimeout(() => { if (dailyPopupEl) dailyPopupEl.style.display = "none"; }, 900);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("already claimed")) {
      if (dailyPopupHintEl) dailyPopupHintEl.textContent = "Уже получено сегодня 🙂";
      setTimeout(() => { if (dailyPopupEl) dailyPopupEl.style.display = "none"; }, 700);
      return;
    }
    if (dailyPopupHintEl) dailyPopupHintEl.textContent = "Ошибка: " + msg;
    setStatus("Ошибка: " + msg);
  } finally {
    setBusy(false);
  }
}

/* ---------- actions ---------- */
async function doAction(type) {
  setBusy(true);
  try {
    await postJson(`${API}/action`, { type }, token);

    await loadMe();  // обновили meCache
    renderActions(); // ✅ сразу обновили кнопку сна/доступность

    fxPop(type === "pet" ? "💖" : type === "clean" ? "✨" : type === "sleep" ? "💤" : "✅");
    setStatus("Ок ✅");
  } finally {
    setBusy(false);
  }
}

/* ---------- idle fx ---------- */
let lastIdleFxAt = 0;
let lastUserInteractionAt = Date.now();

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

function runIdleFxIfNeeded(me) {
  const now = Date.now();
  if (now - lastUserInteractionAt < 25000) return;
  if (now - lastIdleFxAt < 18000) return;
  lastIdleFxAt = now;
  fxPop(idleEmojiByMood(me.moodState));
}

/* ---------- loadMe ---------- */
async function loadMe() {
  const me = await getJson(`${API}/me`, token);
  meCache = me;

  rebuildInventoryMap(me.inventory);
  maybeShowDailyPopup(me);

  renderPetImage(me);
  renderHud(me);
  renderActions(); // ✅ тут тоже обновим доступность кнопок (полные шкалы)

  runIdleFxIfNeeded(me);

  if (mode === "food") renderFood({ playSelect: false });
  return me;
}

/* ---------- init ---------- */
async function main() {
  if (!tg) {
    alert("Открой это внутри Telegram (Mini App).");
    return;
  }

  tg.ready();
  tg.expand();

  // unlock sounds on first tap
  document.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });
  document.addEventListener("pointerdown", () => markInteraction(), { passive: true });

  const initData = tg.initData;
  const user = tg.initDataUnsafe?.user;
  if (!user?.id) {
    setStatus("Нет данных пользователя (открой через кнопку бота).");
    return;
  }

  setStatus("Авторизация...");
  const auth = await postJson(`${API}/auth/telegram`, { initData }, null);
  token = auth.token;

  await loadShopFood();

  if (sceneEl) sceneEl.className = "scene scene--" + currentRoom;

  renderRooms();
  setMode("main");

  // food buttons
  if (foodPrevBtn) foodPrevBtn.onclick = () => {
    if (isBusy) return;
    markInteraction();
    foodIndex = (foodIndex - 1 + FOODS.length) % FOODS.length;
    renderFood({ playSelect: true }); // ✅ звук листания
  };

  if (foodNextBtn) foodNextBtn.onclick = () => {
    if (isBusy) return;
    markInteraction();
    foodIndex = (foodIndex + 1) % FOODS.length;
    renderFood({ playSelect: true }); // ✅ звук листания
  };

  if (foodExitBtn) foodExitBtn.onclick = () => {
    if (isBusy) return;
    markInteraction();
    closeFoodMenu();
  };

  if (foodFeedBtn) foodFeedBtn.onclick = async () => {
    if (isBusy) return;
    markInteraction();

    const uiItem = FOODS[foodIndex] || FOODS[0];
    const serverItem = (shopFood || []).find((x) => x.id === uiItem.id) || null;
    const price = serverItem ? (serverItem.price ?? 0) : 0;
    const qty = getQty(uiItem.id);

    try {
      setBusy(true);

      if ((meCache?.pet?.hunger ?? 0) >= 100) {
        setStatus("🍔 Питомец уже сыт.");
        return;
      }

      if (qty > 0) {
        await postJson(`${API}/food/use`, { itemId: uiItem.id }, token);
        await loadMe();

        // ✅ один звук кормления для всех блюд
        playSound(SFX.eat);

        fxPop(uiItem.emoji);
        setStatus(`Ок: ${uiItem.name}`);
        closeFoodMenu();
        return;
      }

      // покупаем — БЕЗ звука покупки
      await postJson(`${API}/shop/buy`, { itemId: uiItem.id, qty: 1 }, token);
      await loadMe();
      setStatus(price > 0 ? `Куплено: ${uiItem.name}` : `Взято: ${uiItem.name}`);
      renderFood({ playSelect: false });
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes("not enough coins")) setStatus("Не хватает монет 😢");
      else setStatus("Ошибка: " + msg);
    } finally {
      setBusy(false);
    }
  };

  // daily popup handlers
  if (dailyCloseBtn) dailyCloseBtn.onclick = () => { if (dailyPopupEl) dailyPopupEl.style.display = "none"; };
  if (dailyClaimBtn) dailyClaimBtn.onclick = () => { markInteraction(); claimDailyFromPopup(); };

  await loadMe();
  setStatus("Игра загружена ✅");

  setInterval(async () => {
    try { await loadMe(); } catch {}
  }, 15000);
}

main().catch((e) => setStatus("Ошибка: " + (e?.message || e)));