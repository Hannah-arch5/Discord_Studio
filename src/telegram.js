import { buildCommandReply } from "./executor.js";
import { appendNotificationEvent, listPendingNotifications } from "./task-store.js";

const POLL_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 3000;
const NOTIFICATION_POLL_MS = 3000;

export function hasTelegramConfig() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegramMessage(chatId, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

export function startTelegramPolling() {
  if (!hasTelegramConfig()) {
    console.log("Telegram bot disabled. Set TELEGRAM_BOT_TOKEN to enable it.");
    return;
  }

  let offset = 0;
  let stopped = false;

  const poll = async () => {
    while (!stopped) {
      try {
        const updates = await callTelegram("getUpdates", {
          offset,
          timeout: POLL_TIMEOUT_SECONDS,
          allowed_updates: ["message"]
        });

        for (const update of updates) {
          offset = update.update_id + 1;
          await handleTelegramUpdate(update);
        }
      } catch (error) {
        console.error("Telegram polling failed:", error.message);
        await sleep(RETRY_DELAY_MS);
      }
    }
  };

  poll();
  startNotificationPolling();

  return () => {
    stopped = true;
  };
}

function startNotificationPolling() {
  const sendPendingNotifications = async () => {
    try {
      const notifications = await listPendingNotifications();

      for (const notification of notifications) {
        if (notification.channel !== "telegram" || !notification.chatId || !notification.text) {
          continue;
        }

        await sendTelegramMessage(notification.chatId, notification.text);
        await appendNotificationEvent({
          type: "notification_sent",
          id: notification.id,
          sentAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Telegram notification polling failed:", error.message);
    }
  };

  setInterval(sendPendingNotifications, NOTIFICATION_POLL_MS);
  sendPendingNotifications();
}

async function handleTelegramUpdate(update) {
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  if (!chatId || !text) {
    return;
  }

  console.log(`Telegram message from chat ${chatId}: ${text}`);

  if (!isAllowedChat(chatId)) {
    await sendTelegramMessage(
      chatId,
      `这个 bot 已限制给管理员使用。你的 chat id 是：${chatId}`
    );
    return;
  }

  try {
    const reply = await buildCommandReply(text, { chatId });
    await sendTelegramMessage(chatId, reply);
  } catch (error) {
    await sendTelegramMessage(chatId, `执行出错：${error.message}`);
  }
}

function isAllowedChat(chatId) {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!adminChatId) {
    return true;
  }

  return String(chatId) === adminChatId;
}

async function callTelegram(method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.ok) {
    const description = body.description || response.statusText;
    throw new Error(`Telegram API error ${response.status}: ${description}`);
  }

  return body.result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
