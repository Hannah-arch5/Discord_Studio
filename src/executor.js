import { execFile } from "node:child_process";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { appendTaskEvent, createTaskId } from "./task-store.js";
import { normalizeRole } from "./team.js";

const execFileAsync = promisify(execFile);
const WORKSPACE = process.cwd();
const MAX_MESSAGE_LENGTH = 3500;
const BLOCKED_SCRIPTS = new Set(["dev", "start", "send:telegram", "send:template"]);

export async function buildCommandReply(text, context = {}) {
  if (text === "/ping") {
    return "pong";
  }

  if (text === "/start") {
    const chatId = context.chatId ? `\n\n你的 chat id 是：${context.chatId}` : "";
    return `已连接。你可以直接发一句话给我，我会把它当成任务处理。发 /help 可以看工具命令。${chatId}`;
  }

  if (text === "/help" || text === "帮助") {
    return [
      "你可以直接用白话发任务，比如：",
      "帮我检查这个项目有没有问题",
      "",
      "也可以用这些工具命令：",
      "/ping - 测试连接",
      "/pwd - 查看当前项目目录",
      "/files [路径] - 查看文件列表",
      "/scripts - 查看 package.json 里的 npm scripts",
      "/run <script> - 运行 npm script，例如 /run test",
      "/task <内容> - 明确创建一个任务",
      "",
      "普通文字会记录成任务，由后台 Codex 自动处理。"
    ].join("\n");
  }

  if (text === "/pwd") {
    return WORKSPACE;
  }

  if (text === "/files" || text.startsWith("/files ")) {
    const requestedPath = text.slice("/files".length).trim() || ".";
    return listFiles(requestedPath);
  }

  if (text === "/scripts") {
    return listScripts();
  }

  if (text.startsWith("/run ")) {
    const scriptName = text.slice("/run ".length).trim();
    return runNpmScript(scriptName);
  }

  if (text.startsWith("/task ")) {
    const task = text.slice("/task ".length).trim();
    return saveTask(task, context);
  }

  if (text.startsWith("/")) {
    return "我没认出这个命令。你可以直接用白话发任务，或者发 /help 看工具命令。";
  }

  return saveTask(text, context);
}

async function listFiles(requestedPath) {
  const dir = await resolveInsideWorkspace(requestedPath);
  const dirStat = await stat(dir);

  if (!dirStat.isDirectory()) {
    return `${path.relative(WORKSPACE, dir) || "."} 不是目录`;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const lines = entries
    .filter((entry) => entry.name !== "node_modules")
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .slice(0, 80)
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`);

  if (!lines.length) {
    return "目录是空的。";
  }

  return truncate(lines.join("\n"));
}

async function listScripts() {
  const pkg = JSON.parse(await readFile(path.join(WORKSPACE, "package.json"), "utf8"));
  const scripts = Object.keys(pkg.scripts || {});

  if (!scripts.length) {
    return "package.json 里没有 npm scripts。";
  }

  return scripts.map((script) => `/run ${script}`).join("\n");
}

async function runNpmScript(scriptName) {
  if (!scriptName) {
    return "用法：/run <script>，例如 /run test";
  }

  if (BLOCKED_SCRIPTS.has(scriptName)) {
    return `为了避免把 bot 服务自己套娃启动，暂时不允许从 Telegram 运行 /run ${scriptName}。`;
  }

  const pkg = JSON.parse(await readFile(path.join(WORKSPACE, "package.json"), "utf8"));

  if (!pkg.scripts?.[scriptName]) {
    return `找不到 npm script：${scriptName}\n先发 /scripts 看可用列表。`;
  }

  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", scriptName], {
      cwd: WORKSPACE,
      timeout: 120000,
      maxBuffer: 128 * 1024
    });

    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
    return truncate(output || `npm run ${scriptName} 执行完成，没有输出。`);
  } catch (error) {
    const output = [error.stdout?.trim(), error.stderr?.trim(), error.message]
      .filter(Boolean)
      .join("\n\n");
    return truncate(`执行失败：npm run ${scriptName}\n\n${output}`);
  }
}

async function saveTask(task, context) {
  if (!task) {
    return "任务内容是空的。";
  }

  const id = createTaskId();
  const role = normalizeRole(context.role);
  const record = {
    type: "task",
    id,
    createdAt: new Date().toISOString(),
    source: context.source || "telegram",
    chatId: context.chatId,
    project: context.project,
    role,
    retention: context.retention,
    sessionKey: context.sessionKey,
    discordGuildId: context.discordGuildId,
    discordChannelId: context.discordChannelId,
    discordChannelName: context.discordChannelName,
    discordParentChannelId: context.discordParentChannelId,
    discordMessageId: context.discordMessageId,
    discordAuthorId: context.discordAuthorId,
    discordAuthorName: context.discordAuthorName,
    text: task
  };

  await appendTaskEvent(record);

  const contextLine = [context.project, role].filter(Boolean).join(" / ");
  const suffix = contextLine ? `\n归档：${contextLine}` : "";
  const retentionLine = context.retention === "temp" ? "\n模式：临时处理，不保留本地结果文件" : "";
  return `收到，我开始处理这件事。任务编号：#${id}${suffix}${retentionLine}`;
}

async function resolveInsideWorkspace(requestedPath) {
  const resolved = path.resolve(WORKSPACE, requestedPath);
  const workspaceRealPath = await realpath(WORKSPACE);

  let targetRealPath;
  try {
    targetRealPath = await realpath(resolved);
  } catch {
    throw new Error(`路径不存在：${requestedPath}`);
  }

  if (targetRealPath !== workspaceRealPath && !targetRealPath.startsWith(`${workspaceRealPath}${path.sep}`)) {
    throw new Error("只能查看当前项目目录里的文件。");
  }

  return targetRealPath;
}

function truncate(text) {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_MESSAGE_LENGTH)}\n\n...输出太长，已截断。`;
}
