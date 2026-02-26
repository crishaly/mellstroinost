const tg = window.Telegram?.WebApp;

if (!tg) {
  document.getElementById("status").textContent =
    "Открой это внутри Telegram (Mini App).";
} else {
  tg.ready();
  tg.expand();

  const user = tg.initDataUnsafe?.user || null;

  document.getElementById("status").textContent =
    user ? `Привет, ${user.first_name}!` : "Нет данных пользователя";

  document.getElementById("data").textContent = JSON.stringify({
    initData: tg.initData,
    initDataUnsafe: tg.initDataUnsafe
  }, null, 2);
}