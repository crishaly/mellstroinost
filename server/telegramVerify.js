const crypto = require("crypto");

function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  botToken = (botToken || "").trim();
  if (!hash) return { ok: false, error: "no hash" };

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) return { ok: false, error: "hash mismatch" };

  const userJson = params.get("user");
  const user = userJson ? JSON.parse(userJson) : null;
  if (!user?.id) return { ok: false, error: "no user" };

  return { ok: true, user };
}

module.exports = { verifyTelegramInitData };