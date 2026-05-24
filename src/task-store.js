import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";

const WORKSPACE = process.cwd();
const TASKS_FILE = path.join(WORKSPACE, "data", "tasks.ndjson");
const NOTIFICATIONS_FILE = path.join(WORKSPACE, "data", "notifications.ndjson");
const STALE_STARTED_MS = 120000;

export function createTaskId() {
  return Date.now().toString(36);
}

export async function appendTaskEvent(event) {
  await mkdir(path.dirname(TASKS_FILE), { recursive: true });
  await appendFile(TASKS_FILE, `${JSON.stringify(event)}\n`, "utf8");
}

export async function appendNotificationEvent(event) {
  await mkdir(path.dirname(NOTIFICATIONS_FILE), { recursive: true });
  await appendFile(NOTIFICATIONS_FILE, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readTaskEvents() {
  try {
    const content = await readFile(TASKS_FILE, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function readNotificationEvents() {
  try {
    const content = await readFile(NOTIFICATIONS_FILE, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function listPendingTasks() {
  const events = await readTaskEvents();
  const tasks = new Map();
  const completed = new Set();

  for (const event of events) {
    if (event.type === "task" && event.id) {
      tasks.set(event.id, normalizeTaskEvent(event));
    }

    if (event.type === "completed" && event.id) {
      completed.add(event.id);
    }
  }

  return [...tasks.values()].filter((task) => !completed.has(task.id));
}

export async function listRunnableTasks() {
  const events = await readTaskEvents();
  const tasks = new Map();
  const started = new Map();
  const completed = new Set();

  for (const event of events) {
    if (event.type === "task" || (!event.type && event.text)) {
      const id = event.id || "legacy";
      tasks.set(id, normalizeTaskEvent({ ...event, id }));
    }

    if (event.type === "started" && event.id) {
      started.set(event.id, event.startedAt);
    }

    if ((event.type === "completed" || event.type === "failed") && event.id) {
      completed.add(event.id);
    }
  }

  const now = Date.now();

  return [...tasks.values()].filter((task) => {
    if (completed.has(task.id)) {
      return false;
    }

    if (!started.has(task.id)) {
      return true;
    }

    const startedAt = Date.parse(started.get(task.id));
    return Number.isFinite(startedAt) && now - startedAt > STALE_STARTED_MS;
  });
}

export async function findTask(id) {
  const pendingTasks = await listPendingTasks();
  return pendingTasks.find((task) => task.id === id);
}

export async function findTaskAnyStatus(id) {
  const events = await readTaskEvents();
  const tasks = new Map();
  const completed = new Set();

  for (const event of events) {
    if (event.type === "task" || (!event.type && event.text)) {
      const taskId = event.id || "legacy";
      tasks.set(taskId, normalizeTaskEvent({ ...event, id: taskId }));
    }

    if (event.type === "completed" && event.id) {
      completed.add(event.id);
    }
  }

  const task = tasks.get(id);

  if (!task) {
    return undefined;
  }

  return {
    ...task,
    completed: completed.has(id)
  };
}

export async function listPendingNotifications() {
  const events = await readNotificationEvents();
  const notifications = new Map();
  const sent = new Set();

  for (const event of events) {
    if (event.type === "notification") {
      notifications.set(event.id, event);
    }

    if (event.type === "notification_sent") {
      sent.add(event.id);
    }
  }

  return [...notifications.values()].filter((notification) => !sent.has(notification.id));
}

function normalizeTaskEvent(event) {
  return {
    id: event.id,
    createdAt: event.createdAt,
    source: event.source || "telegram",
    chatId: event.chatId,
    text: event.text,
    project: event.project,
    role: event.role,
    retention: event.retention,
    sessionKey: event.sessionKey,
    discordGuildId: event.discordGuildId,
    discordChannelId: event.discordChannelId,
    discordChannelName: event.discordChannelName,
    discordParentChannelId: event.discordParentChannelId,
    discordMessageId: event.discordMessageId,
    discordAuthorId: event.discordAuthorId,
    discordAuthorName: event.discordAuthorName
  };
}
