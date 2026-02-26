const tg = window.Telegram?.WebApp;

const statusEl = document.getElementById("status");
const dataEl = document.getElementById("data");

const API = "http://localhost:3001";

function setStatus(text) {
  statusEl.textContent = text;
}

function render(obj) {
  dataEl.textContent = JSON.stringify(obj, null, 2);
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

async function main() {
  if (!tg) {
    setStatus("Открой это внутри Telegram (Mini App).");
    return;
  }

  tg.ready();
  tg.expand();

  setStatus("Авторизация...");

  const initData = tg.initData;
  const initUnsafe = tg.initDataUnsafe;
  const user = initUnsafe?.user;

  if (!user?.id) {
    setStatus("Нет данных пользователя (открой через кнопку бота).");
    render({ initData, initUnsafe });
    return;
  }

  // 1) auth
  const auth = await postJson(`${API}/auth/telegram`, { initData });

  // 2) get state
  const me = await getJson(`${API}/me/${auth.telegram_id}`);

  setStatus(`Привет, ${me.user.first_name}!`);
  render(me);

  // простые кнопки управления прямо в DOM (временно, для теста)
  const actions = [
    ["feed", "🍔 Покормить"],
    ["pet", "🖐️ Погладить"],
    ["clean", "🧼 Убрать"],
    ["sleep", "😴 Спать"],
    ["wake", "☀️ Разбудить"],
  ];

  const box = document.createElement("div");
  box.style.marginTop = "12px";
  box.style.display = "flex";
  box.style.flexWrap = "wrap";
  box.style.gap = "8px";

  actions.forEach(([type, label]) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid #ddd";
    btn.style.cursor = "pointer";

    btn.onclick = async () => {
      try {
        setStatus("Действие...");
        const res = await postJson(`${API}/action/${auth.telegram_id}`, { type });
        const updated = await getJson(`${API}/me/${auth.telegram_id}`);
        setStatus(`Ок: ${label}`);
        render(updated);
      } catch (e) {
        setStatus(`Ошибка: ${e.message}`);
      }
    };

    box.appendChild(btn);
  });

  document.body.appendChild(box);
}

main().catch((e) => {
  setStatus(`Ошибка: ${e.message}`);
});