import "dotenv/config";
import { sendTemplateMessage } from "../src/whatsapp.js";

const [toArg, ...textParts] = process.argv.slice(2);
const to = toArg || process.env.ADMIN_WHATSAPP_NUMBER;
const text = textParts.join(" ") || "Codex 有一条更新";

if (!to) {
  console.error("Usage: npm run send:template -- <phone_number> <message>");
  console.error("Or set ADMIN_WHATSAPP_NUMBER in .env.");
  process.exit(1);
}

try {
  const result = await sendTemplateMessage({
    to,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || "codex_update",
    languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "zh_CN",
    bodyParameters: [text]
  });

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
