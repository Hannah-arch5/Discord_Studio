import "dotenv/config";
import { listPendingTasks } from "../src/task-store.js";

const tasks = await listPendingTasks();

if (!tasks.length) {
  console.log("No pending tasks.");
  process.exit(0);
}

for (const task of tasks) {
  console.log(`#${task.id}`);
  console.log(`createdAt: ${task.createdAt || "unknown"}`);
  console.log(`source: ${task.source || "unknown"}`);
  console.log(`project: ${task.project || "unknown"}`);
  console.log(`role: ${task.role || "unknown"}`);
  console.log(`retention: ${task.retention || "archive"}`);
  console.log(`chatId: ${task.chatId || "unknown"}`);
  console.log(`discordChannelId: ${task.discordChannelId || "unknown"}`);
  console.log(task.text);
  console.log("");
}
