import "dotenv/config";
import { sendTelegramMessage } from "../src/telegram.js";

const [chatIdArg, ...textParts] = process.argv.slice(2);
const chatId = chatIdArg || process.env.TELEGRAM_ADMIN_CHAT_ID;
const text = textParts.join(" ") || "Codex 有一条更新";

if (!chatId) {
  console.error("Usage: npm run send:telegram -- <chat_id> <message>");
  console.error("Or set TELEGRAM_ADMIN_CHAT_ID in .env.");
  process.exit(1);
}

try {
  const result = await sendTelegramMessage(chatId, text);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
