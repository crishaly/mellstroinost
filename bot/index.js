console.log("starting bot...");

const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

console.log("token exists:", !!BOT_TOKEN);
console.log("webapp url:", WEBAPP_URL);

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
if (!WEBAPP_URL) throw new Error("WEBAPP_URL is missing");

const bot = new Telegraf(BOT_TOKEN);

bot.catch((err, ctx) => {
  console.error("BOT ERROR:", err);
});

bot.start((ctx) => {
  console.log("received /start from", ctx.from?.id);
  return ctx.reply(
    "Открывай тамагочи:",
    Markup.inlineKeyboard([
      Markup.button.webApp("▶️ Открыть", WEBAPP_URL),
    ])
  );
});

bot.launch().then(() => console.log("Bot started"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));