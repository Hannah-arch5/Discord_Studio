import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  appendNotificationEvent,
  appendTaskEvent,
  createTaskId,
  listRunnableTasks
} from "./task-store.js";
import { buildRolePrompt, getRoleProfile } from "./team.js";

const WORKSPACE = process.cwd();
const RESULT_DIR = path.join(WORKSPACE, "data", "codex-results");
const POLL_MS = 5000;
const MAX_NOTIFICATION_LENGTH = 3500;

let running = false;

export function startAutoWorker() {
  if (process.env.AUTO_CODEX_ENABLED !== "true") {
    console.log("Auto Codex worker disabled. Set AUTO_CODEX_ENABLED=true to enable it.");
    return;
  }

  console.log("Auto Codex worker enabled.");
  setInterval(processRunnableTasks, POLL_MS);
  processRunnableTasks();
}

async function processRunnableTasks() {
  if (running) {
    return;
  }

  running = true;

  try {
    const tasks = await listRunnableTasks();

    for (const task of tasks) {
      await runTask(task);
    }
  } catch (error) {
    console.error("Auto Codex worker failed:", error);
  } finally {
    running = false;
  }
}

async function runTask(task) {
  const startedAt = new Date().toISOString();
  const resultFile = path.join(RESULT_DIR, `${task.id}.txt`);
  const stdoutFile = path.join(RESULT_DIR, `${task.id}.stdout.log`);
  const stderrFile = path.join(RESULT_DIR, `${task.id}.stderr.log`);
  const codexBin = process.env.CODEX_BIN || "codex";
  const workdir = process.env.AUTO_CODEX_WORKDIR || WORKSPACE;
  const timeout = Number(process.env.AUTO_CODEX_TIMEOUT_MS || 1200000);
  const roleProfile = getRoleProfile(task.role);
  const isTemporary = task.retention === "temp";

  await mkdir(RESULT_DIR, { recursive: true });
  await appendTaskEvent({
    type: "started",
    id: task.id,
    startedAt,
    runner: "codex-exec"
  });

  await notify(task, `我开始处理了：${taskTitle(task)}\n角色：${roleProfile.name}`);

  const prompt = [
    "你是一个通过 Telegram/Discord 自动触发的 Codex 后台任务执行器。",
    "请在当前项目中完成用户任务。保持改动谨慎，必要时运行验证。",
    "如果任务不明确或存在高风险操作，不要做危险修改；请在最终回复里说明需要用户确认。",
    "你不是聊天模拟器，而是这个本机工作室里的实际执行成员。最终回复要能直接发回 Discord 给用户。",
    "如果你判断任务明显分配给了错误角色，先说明更适合的角色，并给出可复制的 !assign 指令；若任务很简单，也可以顺手完成。",
    "",
    buildRolePrompt(roleProfile.name),
    "",
    `来源：${task.source || "unknown"}`,
    `项目：${task.project || "未指定"}`,
    `角色：${roleProfile.name}`,
    `会话：${task.sessionKey || "未指定"}`,
    `本地结果模式：${isTemporary ? "临时，不要创建或保留本地文件，除非用户明确要求保存。" : "归档，可以在必要时创建本地交付文件。"}`,
    "",
    `用户任务：${task.text}`
  ].join("\n");

  try {
    const { stdout, stderr } = await runCodex(
      codexBin,
      [
        "-a",
        "never",
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "-C",
        workdir,
        "-o",
        resultFile,
        prompt
      ],
      {
        cwd: workdir,
        timeout
      }
    );

    await writeFile(stdoutFile, stdout, "utf8");
    await writeFile(stderrFile, stderr, "utf8");

    const finalMessage = await readFinalMessage(resultFile, stdout, stderr);
    await appendTaskEvent({
      type: "completed",
      id: task.id,
      completedAt: new Date().toISOString(),
      message: finalMessage,
      retention: task.retention
    });
    await notify(task, `处理好了：${taskTitle(task)}\n\n${truncate(finalMessage)}`);

    if (isTemporary) {
      await cleanupResultFiles([resultFile, stdoutFile, stderrFile]);
    }
  } catch (error) {
    const detail = [error.stdout?.trim(), error.stderr?.trim(), error.message]
      .filter(Boolean)
      .join("\n\n");
    await writeFile(stdoutFile, error.stdout || "", "utf8");
    await writeFile(stderrFile, error.stderr || "", "utf8");
    await appendTaskEvent({
      type: "failed",
      id: task.id,
      failedAt: new Date().toISOString(),
      message: detail,
      retention: task.retention
    });
    await notify(task, `这次没跑通：${taskTitle(task)}\n\n${truncate(detail)}`);

    if (isTemporary) {
      await cleanupResultFiles([resultFile, stdoutFile, stderrFile]);
    }
  }
}

function runCodex(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdin.end();

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGTERM");
      const error = new Error(`Codex timed out after ${options.timeout}ms`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    }, options.timeout);

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(`Codex exited with code ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function notify(task, text) {
  if (task.source === "discord" && task.discordChannelId) {
    await appendNotificationEvent({
      type: "notification",
      id: `${createTaskId()}-discord`,
      createdAt: new Date().toISOString(),
      channel: "discord",
      discordChannelId: task.discordChannelId,
      discordMessageId: task.discordMessageId,
      text
    });
  }

  const telegramChatId =
    task.chatId ||
    (task.source === "discord" && process.env.DISCORD_MIRROR_TO_TELEGRAM !== "false"
      ? process.env.TELEGRAM_ADMIN_CHAT_ID
      : undefined);

  if (telegramChatId) {
    await appendNotificationEvent({
      type: "notification",
      id: `${createTaskId()}-telegram`,
      createdAt: new Date().toISOString(),
      channel: "telegram",
      chatId: telegramChatId,
      text
    });
  }
}

async function readFinalMessage(resultFile, stdout, stderr) {
  try {
    const finalMessage = (await readFile(resultFile, "utf8")).trim();

    if (finalMessage) {
      return finalMessage;
    }
  } catch {
    // Fall back to process output below.
  }

  const output = [stdout?.trim(), stderr?.trim()].filter(Boolean).join("\n\n");
  return output || "Codex 执行完成，但没有输出最终消息。";
}

function truncate(text) {
  if (text.length <= MAX_NOTIFICATION_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_NOTIFICATION_LENGTH)}\n\n...输出太长，已截断。`;
}

function taskTitle(task) {
  const labels = [];

  if (task.project) {
    labels.push(task.project);
  }

  if (task.role) {
    labels.push(task.role);
  }

  const labelText = labels.length ? ` [${labels.join(" / ")}]` : "";
  return `#${task.id}${labelText}`;
}

async function cleanupResultFiles(files) {
  await Promise.all(
    files.map((file) =>
      rm(file, { force: true }).catch((error) => {
        console.error(`Failed to remove temporary result file ${file}:`, error.message);
      })
    )
  );
}
