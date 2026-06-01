import "dotenv/config";
import { appendNotificationEvent } from "../src/task-store.js";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";

const [, , channelId, text = "", ...files] = process.argv;

if (!channelId) {
  console.error("Usage: npm run send:discord -- <channel_id> <message> [file ...]");
  process.exit(1);
}

const resolvedFiles = [];

for (const file of files) {
  const resolved = path.resolve(file);
  await access(resolved);
  resolvedFiles.push(resolved);
}

await appendNotificationEvent({
  type: "notification",
  id: `${Date.now()}-${randomUUID()}-discord`,
  createdAt: new Date().toISOString(),
  channel: "discord",
  discordChannelId: channelId,
  text,
  files: resolvedFiles
});

console.log(`Queued Discord notification for ${channelId} with ${resolvedFiles.length} file(s).`);
