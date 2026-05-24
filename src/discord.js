import { Client, GatewayIntentBits, Partials } from "discord.js";
import { buildCommandReply } from "./executor.js";
import { appendNotificationEvent, listPendingNotifications } from "./task-store.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanupProjectResults, cleanupTaskResults } from "./cleanup.js";
import { getTeamHelp, normalizeKnownRole, normalizeRole } from "./team.js";

const WORKSPACE = process.cwd();
const SESSION_FILE = path.join(WORKSPACE, "data", "discord-sessions.json");
const NOTIFICATION_POLL_MS = 3000;
const DISCORD_MESSAGE_LIMIT = 1900;
const CONTROL_AUTO_ROLE = "总控/Cassie 自动";

export function hasDiscordConfig() {
  return Boolean(process.env.DISCORD_BOT_TOKEN);
}

export function startDiscordStudio() {
  if (process.env.DISCORD_STUDIO_ENABLED !== "true") {
    console.log("Discord studio disabled. Set DISCORD_STUDIO_ENABLED=true to enable it.");
    return;
  }

  if (!hasDiscordConfig()) {
    console.log("Discord studio disabled. Set DISCORD_BOT_TOKEN to enable it.");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  client.once("ready", () => {
    console.log(`Discord studio connected as ${client.user.tag}.`);
    startNotificationPolling(client);
  });

  client.on("messageCreate", async (message) => {
    await handleDiscordMessage(message);
  });

  client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
    console.error("Discord studio login failed:", error.message);
  });
}

async function handleDiscordMessage(message) {
  if (message.author?.bot || !message.content?.trim()) {
    return;
  }

  if (!isAllowedUser(message.author.id)) {
    await message.reply(
      `这个工作室 bot 目前只给管理员使用。你的 Discord user id 是：${message.author.id}`
    );
    return;
  }

  const text = message.content.trim();

  try {
    if (isStudioCommand(text)) {
      await message.reply(await handleStudioCommand(text, message));
      return;
    }

    if (text.startsWith("!") && !text.startsWith("!task ")) {
      await message.reply(buildUnknownCommandReply(text));
      return;
    }

    const taskText = text.startsWith("!task ") ? text.slice("!task ".length).trim() : text;
    const parsed = parseRolePrefix(taskText);
    const context = await buildDiscordContext(message, parsed);
    const reply = await buildCommandReply(parsed.text, context);
    await message.reply(reply);
  } catch (error) {
    await message.reply(`执行出错：${error.message}`);
  }
}

function isStudioCommand(text) {
  return (
    text === "!studio" ||
    text.startsWith("!studio ") ||
    text.startsWith("!project ") ||
    text.startsWith("!role ") ||
    text.startsWith("!cleanup ") ||
    text === "!team" ||
    text.startsWith("!assign ") ||
    text === "工作室帮助"
  );
}

async function handleStudioCommand(text, message) {
  if (text === "!studio" || text === "!studio help" || text === "工作室帮助") {
    return [
      "AI 工作室已经在线。直接在频道或 thread 里发一句话，我会把它当成这个 session 的任务。",
      "",
      "常用命令：",
      "`!studio info` - 查看当前 session",
      "`!studio project <项目名>` - 设置这个频道/thread 的项目",
      "`!studio role <角色>` - 设置默认 Codex 角色",
      "`!studio retention temp|archive` - 设置这个频道是否保留本地结果文件",
      "`!studio roles` - 查看可用角色",
      "`!studio team` - 查看团队分工",
      "`!assign <角色>: <任务>` - 显式派给某个角色",
      "`!cleanup task <任务编号>` - 删除某个任务的本地结果文件",
      "`!cleanup project <项目名>` - 删除某个项目的本地结果文件",
      "",
      "总控类别下的新频道会默认使用 `总控/Cassie 自动`：设置、纠错、分派建议由 Cassie 接；拆任务、规划、汇总由总控接。",
      "",
      "也可以临时指定角色：",
      "`Cass: 这条任务该交给谁？`",
      "`开发: 帮我检查代码`",
      "`研究: 整理一下竞品信息`"
    ].join("\n");
  }

  if (text === "!studio roles") {
    return "可用角色：总控、助理、管家、研究、开发、设计、审查。也支持 lead/assistant/butler/research/dev/design/review。";
  }

  if (text === "!studio team" || text === "!team") {
    return getTeamHelp();
  }

  if (text.startsWith("!cleanup ")) {
    return handleCleanupCommand(text.slice("!cleanup ".length).trim());
  }

  if (text === "!studio info") {
    const session = await getSession(message);
    return [
      `session：${session.key}`,
      `项目：${session.project}`,
      `默认角色：${session.role}`,
      `本地结果：${session.retention === "archive" ? "归档" : "临时"}`,
      `频道：${session.channelName}`
    ].join("\n");
  }

  if (text.startsWith("!assign ")) {
    const assignment = parseAssignment(text.slice("!assign ".length).trim());

    if (!assignment) {
      return "用法：`!assign 研究: 帮我整理资料` 或 `!assign 开发: 帮我修这个问题`";
    }

    const context = await buildDiscordContext(message, assignment);
    return buildCommandReply(assignment.text, context);
  }

  const projectText = text.startsWith("!project ")
    ? text.slice("!project ".length).trim()
    : text.startsWith("!studio project ")
      ? text.slice("!studio project ".length).trim()
      : "";

  if (projectText) {
    const session = await updateSession(message, { project: projectText });
    return `这个 session 以后归到项目：${session.project}`;
  }

  const roleText = text.startsWith("!role ")
    ? text.slice("!role ".length).trim()
    : text.startsWith("!studio role ")
      ? text.slice("!studio role ".length).trim()
      : "";

  if (roleText) {
    const role = normalizeRole(roleText);
    const patch = { role, retention: inferRetention(role) };
    const session = await updateSession(message, patch);
    return `这个 session 的默认角色设为：${session.role}`;
  }

  const retentionText = text.startsWith("!studio retention ")
    ? text.slice("!studio retention ".length).trim()
    : "";

  if (retentionText) {
    const retention = normalizeRetention(retentionText);

    if (!retention) {
      return "用法：`!studio retention temp` 临时处理，或 `!studio retention archive` 保留本地结果。";
    }

    const session = await updateSession(message, { retention });
    return `这个 session 的本地结果模式设为：${session.retention === "archive" ? "归档" : "临时"}`;
  }

  return "这个工作室命令我还没认出来。发 `!studio help` 看一下可用命令。";
}

async function handleCleanupCommand(text) {
  const taskMatch = text.match(/^task\s+#?([A-Za-z0-9_-]+)$/i);

  if (taskMatch) {
    const result = await cleanupTaskResults(taskMatch[1]);
    return formatCleanupResult(`任务 #${taskMatch[1]}`, result);
  }

  const projectMatch = text.match(/^project\s+(.+)$/i);

  if (projectMatch) {
    const projectName = projectMatch[1].trim();
    const result = await cleanupProjectResults(projectName);
    return formatCleanupResult(`项目 ${projectName}`, result);
  }

  return [
    "用法：",
    "`!cleanup task mpk35ass`",
    "`!cleanup project Spotify研报`",
    "",
    "这个命令只删除电脑本地结果文件，不会删除 Discord 对话。"
  ].join("\n");
}

function formatCleanupResult(label, result) {
  return [
    `已清理：${label}`,
    `涉及任务：${result.taskIds.length ? result.taskIds.map((id) => `#${id}`).join(", ") : "无"}`,
    `删除本地文件：${result.removed.length} 个`,
    "Discord 里的消息不会被删除。"
  ].join("\n");
}

async function buildDiscordContext(message, parsed) {
  const session = await getSession(message);

  return {
    source: "discord",
    project: session.project,
    role: parsed.role || resolveSessionRole(session.role, parsed.text),
    retention: parsed.retention || session.retention,
    sessionKey: session.key,
    discordGuildId: message.guildId,
    discordChannelId: message.channelId,
    discordChannelName: session.channelName,
    discordParentChannelId: message.channel?.parentId,
    discordMessageId: message.id,
    discordAuthorId: message.author.id,
    discordAuthorName: message.author.globalName || message.author.username
  };
}

async function getSession(message) {
  const sessions = await readSessions();
  const key = buildSessionKey(message);
  const existing = sessions[key] || {};
  const channelName = message.channel?.name || "direct-message";

  return {
    key,
    project: existing.project || inferProjectName(message),
    role: existing.role || inferRoleFromName(channelName) || inferRoleFromCategory(message) || "助理 Cassie",
    retention: existing.retention || inferRetention(existing.role || inferRoleFromName(channelName) || inferRoleFromCategory(message) || "助理 Cassie"),
    channelName
  };
}

async function updateSession(message, patch) {
  const sessions = await readSessions();
  const current = await getSession(message);
  const next = { ...current, ...patch };
  sessions[current.key] = {
    project: next.project,
    role: next.role,
    retention: next.retention,
    channelName: next.channelName,
    updatedAt: new Date().toISOString()
  };

  await mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await writeFile(SESSION_FILE, `${JSON.stringify(sessions, null, 2)}\n`, "utf8");
  return next;
}

function buildSessionKey(message) {
  const scope = message.guildId || "dm";
  return `${scope}:${message.channelId}`;
}

function inferProjectName(message) {
  const channelName = message.channel?.parent?.name || message.channel?.name || "private";
  return cleanupName(channelName) || "未分类项目";
}

function inferRoleFromCategory(message) {
  const categoryName = cleanupName(message.channel?.parent?.name || "");

  if (categoryName === "总控") {
    return CONTROL_AUTO_ROLE;
  }

  return undefined;
}

function inferRoleFromName(name) {
  const parts = name.split(/[-_\s]+/).filter(Boolean);

  for (const part of parts) {
    const role = normalizeKnownRole(part);

    if (role) {
      return role;
    }
  }

  return normalizeKnownRole(name);
}

function parseRolePrefix(text) {
  const match = text.match(/^@?([A-Za-z\u4e00-\u9fa5]+)\s*[：:]\s*(.+)$/s);

  if (!match) {
    return { text };
  }

  const role = normalizeKnownRole(match[1]);

  if (!role) {
    return { text };
  }

  return {
    role,
    retention: role === "管家 Tony" ? "temp" : undefined,
    text: match[2].trim()
  };
}

function cleanupName(name) {
  return name
    .replace(/^[#\s]+/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function parseAssignment(text) {
  const parsed = parseRolePrefix(text);

  if (!parsed.role || !parsed.text) {
    return undefined;
  }

  return parsed;
}

function inferRetention(role) {
  return role === "管家 Tony" ? "temp" : "archive";
}

function resolveSessionRole(role, text) {
  if (role !== CONTROL_AUTO_ROLE) {
    return role;
  }

  return shouldUseLead(text) ? "总控 Codex" : "助理 Cassie";
}

function shouldUseLead(text = "") {
  const leadPatterns = [
    "拆",
    "分派",
    "分配",
    "汇总",
    "总结进展",
    "下一步",
    "计划",
    "规划",
    "路线图",
    "优先级",
    "项目",
    "目标",
    "方案",
    "推进",
    "复盘"
  ];

  return leadPatterns.some((pattern) => text.includes(pattern));
}

function buildUnknownCommandReply(text) {
  const suggestions = [
    ["!stduio", "!studio"],
    ["!stuido", "!studio"],
    ["!studuo", "!studio"],
    ["!rol", "!studio role"],
    ["!role", "!studio role"],
    ["!project", "!studio project"],
    ["!retention", "!studio retention"],
    ["!clean", "!cleanup"]
  ];
  const lower = text.toLowerCase();
  const match = suggestions.find(([wrong]) => lower.startsWith(wrong));

  return [
    "助理提醒：这个命令我没认出来。",
    match ? `你可能想输入：\`${text.replace(new RegExp(`^${escapeRegExp(match[0])}`, "i"), match[1])}\`` : "",
    "常用写法：",
    "`!studio info`",
    "`!studio role 助理`",
    "`!studio retention temp`",
    "`!assign 研究: 帮我整理资料`",
    "",
    "如果不是设置命令，直接用白话发也可以。"
  ].filter(Boolean).join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRetention(value) {
  const normalized = value.trim().toLowerCase();

  if (["temp", "temporary", "临时", "不归档", "noarchive"].includes(normalized)) {
    return "temp";
  }

  if (["archive", "归档", "保存", "save"].includes(normalized)) {
    return "archive";
  }

  return undefined;
}

function isAllowedUser(userId) {
  const allowed = (process.env.DISCORD_ALLOWED_USER_IDS || process.env.DISCORD_ADMIN_USER_ID || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!allowed.length) {
    return true;
  }

  return allowed.includes(String(userId));
}

async function readSessions() {
  try {
    return JSON.parse(await readFile(SESSION_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function startNotificationPolling(client) {
  const sendPendingNotifications = async () => {
    try {
      const notifications = await listPendingNotifications();

      for (const notification of notifications) {
        if (notification.channel !== "discord" || !notification.discordChannelId || !notification.text) {
          continue;
        }

        await sendDiscordMessage(client, notification.discordChannelId, notification.text);
        await appendNotificationEvent({
          type: "notification_sent",
          id: notification.id,
          sentAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Discord notification polling failed:", error.message);
    }
  };

  setInterval(sendPendingNotifications, NOTIFICATION_POLL_MS);
  sendPendingNotifications();
}

async function sendDiscordMessage(client, channelId, text) {
  const channel = await client.channels.fetch(channelId);

  if (!channel?.isTextBased()) {
    throw new Error(`Discord channel is not text based: ${channelId}`);
  }

  for (const chunk of splitMessage(text)) {
    await channel.send(chunk);
  }
}

function splitMessage(text) {
  if (text.length <= DISCORD_MESSAGE_LIMIT) {
    return [text];
  }

  const chunks = [];
  let rest = text;

  while (rest.length > DISCORD_MESSAGE_LIMIT) {
    chunks.push(rest.slice(0, DISCORD_MESSAGE_LIMIT));
    rest = rest.slice(DISCORD_MESSAGE_LIMIT);
  }

  if (rest) {
    chunks.push(rest);
  }

  return chunks;
}
