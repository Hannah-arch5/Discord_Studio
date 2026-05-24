import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { readTaskEvents } from "./task-store.js";

const WORKSPACE = process.cwd();
const RESULT_DIR = path.join(WORKSPACE, "data", "codex-results");

export async function cleanupTaskResults(taskId) {
  const files = await listResultFilesForTask(taskId);
  await removeFiles(files);

  return {
    taskIds: [taskId],
    removed: files
  };
}

export async function cleanupProjectResults(projectName) {
  const taskIds = await findTaskIdsByProject(projectName);
  const filesByTask = await Promise.all(taskIds.map((taskId) => listResultFilesForTask(taskId)));
  const files = filesByTask.flat();
  await removeFiles(files);

  return {
    taskIds,
    removed: files
  };
}

export async function findTaskIdsByProject(projectName) {
  const target = normalize(projectName);
  const events = await readTaskEvents();
  const taskIds = new Set();

  for (const event of events) {
    if (event.type !== "task" || !event.id || !event.project) {
      continue;
    }

    if (normalize(event.project) === target) {
      taskIds.add(event.id);
    }
  }

  return [...taskIds];
}

async function listResultFilesForTask(taskId) {
  let entries;

  try {
    entries = await readdir(RESULT_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${taskId}.`))
    .map((entry) => path.join(RESULT_DIR, entry.name));
}

async function removeFiles(files) {
  await Promise.all(files.map((file) => rm(file, { force: true })));
}

function normalize(value) {
  return value.trim().toLowerCase();
}
