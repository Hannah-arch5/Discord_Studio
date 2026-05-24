import "dotenv/config";
import {
  appendNotificationEvent,
  appendTaskEvent,
  createTaskId,
  findTaskAnyStatus
} from "../src/task-store.js";

const [id, ...messageParts] = process.argv.slice(2);
const message = messageParts.join(" ").trim();

if (!id || !message) {
  console.error("Usage: npm run complete-task -- <task_id> <message>");
  process.exit(1);
}

const task = await findTaskAnyStatus(id);

if (!task) {
  console.error(`No task found for id: ${id}`);
  process.exit(1);
}

if (!task.completed) {
  await appendTaskEvent({
    type: "completed",
    id,
    completedAt: new Date().toISOString(),
    message
  });
}

if (task.chatId) {
  await appendNotificationEvent({
    type: "notification",
    id: `${createTaskId()}-telegram`,
    createdAt: new Date().toISOString(),
    channel: "telegram",
    chatId: task.chatId,
    text: `处理好了：#${id}\n${message}`
  });
}

if (task.discordChannelId) {
  await appendNotificationEvent({
    type: "notification",
    id: `${createTaskId()}-discord`,
    createdAt: new Date().toISOString(),
    channel: "discord",
    discordChannelId: task.discordChannelId,
    text: `处理好了：#${id}\n${message}`
  });
}

console.log(`Completed task #${id}`);
console.log("Queued notifications.");
