import "dotenv/config";
import { appendNotificationEvent, appendTaskEvent, createTaskId, findTaskAnyStatus } from "../src/task-store.js";

const [id, ...messageParts] = process.argv.slice(2);
const message = messageParts.join(" ").trim() || "任务已取消。";

if (!id) {
  console.error("Usage: npm run fail-task -- <task_id> <message>");
  process.exit(1);
}

const task = await findTaskAnyStatus(id);

await appendTaskEvent({
  type: "failed",
  id,
  failedAt: new Date().toISOString(),
  message
});

if (task?.chatId) {
  await appendNotificationEvent({
    type: "notification",
    id: `${createTaskId()}-telegram`,
    createdAt: new Date().toISOString(),
    channel: "telegram",
    chatId: task.chatId,
    text: `这次先停下：#${id}\n${message}`
  });
}

if (task?.discordChannelId) {
  await appendNotificationEvent({
    type: "notification",
    id: `${createTaskId()}-discord`,
    createdAt: new Date().toISOString(),
    channel: "discord",
    discordChannelId: task.discordChannelId,
    text: `这次先停下：#${id}\n${message}`
  });
}

console.log(`Failed task #${id}`);
