import crypto from "node:crypto";
import "dotenv/config";
import express from "express";
import { startAutoWorker } from "./auto-worker.js";
import { startDiscordStudio } from "./discord.js";
import { buildCommandReply } from "./executor.js";
import { startTelegramPolling } from "./telegram.js";
import { sendTemplateMessage, sendTextMessage } from "./whatsapp.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  if (!isValidMetaSignature(req)) {
    res.sendStatus(403);
    return;
  }

  res.sendStatus(200);

  try {
    for (const message of extractIncomingMessages(req.body)) {
      await handleIncomingMessage(message);
    }
  } catch (error) {
    console.error("Failed to process webhook:", error);
  }
});

app.post("/notify", async (req, res) => {
  try {
    const to = req.body.to || process.env.ADMIN_WHATSAPP_NUMBER;
    const text = req.body.text || "Codex 有一条更新";

    if (!to) {
      res.status(400).json({ error: "Missing to or ADMIN_WHATSAPP_NUMBER" });
      return;
    }

    const result = await sendTemplateMessage({
      to,
      templateName: process.env.WHATSAPP_TEMPLATE_NAME || "codex_update",
      languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "zh_CN",
      bodyParameters: [text]
    });

    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function isValidMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    return true;
  }

  const signature = req.get("x-hub-signature-256");

  if (!signature || !req.rawBody) {
    return false;
  }

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function extractIncomingMessages(payload) {
  return payload.entry?.flatMap((entry) =>
    entry.changes?.flatMap((change) => change.value?.messages || []) || []
  ) || [];
}

async function handleIncomingMessage(message) {
  const from = message.from;
  const text = message.text?.body?.trim();

  if (!from || !text) {
    return;
  }

  const reply = await buildCommandReply(text);
  await sendTextMessage(from, reply);
}

app.listen(port, host, () => {
  console.log(`WhatsApp bridge listening on http://${host}:${port}`);
});

startTelegramPolling();
startDiscordStudio();
startAutoWorker();
