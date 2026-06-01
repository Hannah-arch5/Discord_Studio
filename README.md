# Discord_Studio

Local Discord/Telegram AI Studio bridge for sending tasks from mobile chat to a Mac-hosted Codex worker.

Discord is the main AI Studio workspace. Telegram remains available as a private control and notification channel. Legacy WhatsApp Cloud API helpers are still present but are not the active path.

## Telegram Setup

1. In Telegram, open `@BotFather`.

2. Send:

   ```text
   /newbot
   ```

3. Follow BotFather's prompts. It will give you a bot token like:

   ```text
   1234567890:AA...
   ```

4. Copy the env file:

   ```bash
   cp .env.example .env
   ```

5. Add the token to `.env`:

   ```text
   TELEGRAM_BOT_TOKEN=your_bot_token
   ```

6. Start the service:

   ```bash
   npm run dev
   ```

7. Open your bot in Telegram and send:

   ```text
   /start
   ```

   The bot replies with your chat id. Add it to `.env` to restrict the bot to your account:

   ```text
   TELEGRAM_ADMIN_CHAT_ID=your_chat_id
   ```

8. Restart the service, then test:

   ```text
   /ping
   ```

## Telegram Commands

Send these commands to your bot:

```text
/ping
```

Test the connection.

```text
/pwd
```

Show the current project directory.

```text
/files
```

List files in the project. You can also pass a path, for example `/files src`.

```text
/scripts
```

Show available npm scripts from `package.json`.

```text
/run <script>
```

Run an npm script, for example `/run test`. Long-running scripts such as `dev` and `start` are blocked from Telegram so the bot does not start another copy of itself.

```text
/task <message>
```

Append a numbered task to `data/tasks.ndjson`. Plain text messages are saved as tasks too.

On the computer, list pending Telegram tasks:

```bash
npm run inbox
```

After completing a task, mark it done and notify Telegram:

```bash
npm run complete-task -- <task_id> "处理结果"
```

## Discord AI Studio

Discord can run alongside Telegram. Telegram stays useful as your private control channel; Discord becomes the project workspace with channel/thread based sessions.

### Setup

1. Open Discord Developer Portal and create an application.

2. Add a bot to the application.

3. Enable these bot settings:

   ```text
   Message Content Intent
   Server Members Intent is not required for the current implementation
   ```

4. Invite the bot to your server with permissions to read and send messages.

5. Add these values to `.env`:

   ```text
   DISCORD_STUDIO_ENABLED=true
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_ALLOWED_USER_IDS=your_discord_user_id
   DISCORD_MIRROR_TO_TELEGRAM=true
   ```

6. Restart the background service:

   ```bash
   npm run service:restart
   ```

### Studio Model

Each Discord channel or thread is treated as a separate session. Tasks created in that session keep this context:

```text
project
role
discord channel/thread id
author
message id
```

This makes Discord suitable for "one project per category" and "one task per thread" workflows.

### Studio Commands

Send these in Discord:

```text
!studio help
```

Show the studio guide.

```text
!studio info
```

Show the current channel/thread session.

```text
!studio project <项目名>
```

Set the project name for the current channel/thread.

```text
!studio role <角色>
```

Set the default Codex role for the current channel/thread. Supported common roles:

```text
总控
助理
管家
研究
开发
设计
审查
```

```text
!studio retention temp
!studio retention archive
```

Choose whether this channel/thread keeps local Codex result files. New channels default to `助理 Cassie` and `archive`. Channels under the `总控` category default to `总控/Cassie 自动` and `temp`. `管家 Tony` defaults to `temp`.

```text
!studio team
```

Show the team members and their responsibilities.

```text
!assign <角色>: <任务>
```

Explicitly assign one task to a role, without changing the channel's default role.

```text
!cleanup task <任务编号>
!cleanup project <项目名>
```

Delete local Codex result files from the computer. This does not delete Discord messages or channels.

Plain messages create tasks automatically. You can also specify a role for a single message:

```text
Cass: 这条任务应该交给谁？顺便给我正确指令
开发: 帮我检查这个项目的启动脚本
研究: 帮我整理 Discord AI 工作室的信息架构
Tony: 帮我查今晚附近适合两个人吃饭的餐厅
```

### Team Roles

The studio uses role-specific operating rules when Codex runs a task:

```text
总控 Codex：拆任务、分派、汇总，维护项目全局判断和下一步行动。
助理 Cassie：发现设置遗漏、命令错误和角色分配不合理时提醒、纠正，并给出正确分派。
管家 Tony：处理日常小事、路线餐厅、学习资料、提醒式查询和零碎问答。
研究 Codex：查资料、做研报、整理证据和来源，输出可追溯结论。
开发 Codex：写代码、改项目、跑测试、修问题，交付可运行结果。
设计 Codex：做结构、体验、信息架构、界面方案和视觉方向。
审查 Codex：检查风险、质量、漏洞、遗漏和可验证性。
```

Recommended workflow:

```text
#inbox
如果这个频道在 `总控` 类别下，新频道默认会使用 `总控/Cassie 自动`，本地结果模式默认是 `temp`。设置、纠错、分派建议由 Cassie 接；拆任务、规划、汇总由总控接。

#项目-总控
把复杂目标丢给总控 Codex，让它拆任务、分派和汇总。

#daily / #管家
把路线、餐厅、学习资料、临时查询交给管家 Tony，并设置 `!studio retention temp`。

#项目-研究
把资料、竞品、市场、财报任务交给研究 Codex。

#项目-开发
把代码、脚本、自动化、验证任务交给开发 Codex。

#项目-设计
把页面结构、体验、视觉方向交给设计 Codex。

#项目-审查
把方案、代码、报告交给审查 Codex 做风险检查。
```

Task progress is sent back to the same Discord channel/thread. If `DISCORD_MIRROR_TO_TELEGRAM=true`, task progress is also mirrored to `TELEGRAM_ADMIN_CHAT_ID`.

Temporary tasks still keep small task/notification event records, but local Codex result files under `data/codex-results/` are removed after the reply is sent.

## Run In Background On macOS

Install the Telegram bot as a LaunchAgent:

```bash
npm run service:install
```

It starts at login and restarts if it exits. Logs are written to:

```text
data/telegram-bot.out.log
data/telegram-bot.err.log
```

Uninstall it:

```bash
npm run service:uninstall
```

Restart it after code or `.env` changes:

```bash
npm run service:restart
```

## Automatic Codex Worker

Set these values in `.env` to let the background bot run Codex automatically for new Telegram tasks:

```text
AUTO_CODEX_ENABLED=true
CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex
AUTO_CODEX_WORKDIR=/Users/hannah/Documents/Codex/2026-05-22/whatsapp
AUTO_CODEX_TIMEOUT_MS=1200000
```

With this enabled, a Telegram task goes through this flow:

```text
/task ...
bot records the task
auto worker runs codex exec
bot sends started/completed/failed notifications
```

The worker uses `codex -a never exec --sandbox workspace-write` in the configured workdir. Do not enable this for untrusted Telegram chats.

## Telegram Proactive Messages

After `TELEGRAM_ADMIN_CHAT_ID` is configured, send yourself a message from the command line:

```bash
npm run send:telegram -- "" "任务已完成"
```

Or pass the chat id explicitly:

```bash
npm run send:telegram -- 123456789 "任务已完成"
```

## Discord Proactive Messages

Queue a proactive Discord message through the running Discord Studio bot:

```bash
npm run send:discord -- <discord_channel_id> "任务已完成"
```

Queue a message with file attachments:

```bash
npm run send:discord -- <discord_channel_id> "研报最终版已完成" /absolute/path/report.pdf
```

The background service sends queued Discord notifications from `data/notifications.ndjson`. Restart the service after code changes:

```bash
npm run service:restart
```

## Setup

These steps are only needed for WhatsApp Cloud API.

1. Create a Meta app and add WhatsApp Cloud API:
   https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/

2. Copy the env file:

   ```bash
   cp .env.example .env
   ```

3. Fill these values in `.env`:

   ```text
   WHATSAPP_TOKEN=
   WHATSAPP_PHONE_NUMBER_ID=
   WHATSAPP_VERIFY_TOKEN=
   ADMIN_WHATSAPP_NUMBER=
   WHATSAPP_TEMPLATE_NAME=
   WHATSAPP_TEMPLATE_LANGUAGE=zh_CN
   ```

4. Install and start:

   ```bash
   npm install
   npm run dev
   ```

5. Expose the local service with a public HTTPS URL, for example ngrok or Cloudflare Tunnel:

   ```bash
   ngrok http 3000
   ```

6. In Meta Developers, configure the webhook callback URL:

   ```text
   https://your-public-url.example/webhook
   ```

   Use the same `WHATSAPP_VERIFY_TOKEN` from `.env`, then subscribe to the `messages` field.

## Receiving Messages

Send `/ping` to the connected WhatsApp Business number. The service should reply with `pong`.

Inside the 24-hour customer service window, the service can reply with normal text messages.

## Proactive Messages

Outside the 24-hour window, WhatsApp requires an approved message template.

Create a template in WhatsApp Manager, for example:

```text
Template name: codex_update
Language: zh_CN
Body: {{1}}
```

After approval, send a proactive template message:

```bash
npm run send:template -- 8613800138000 "任务已完成"
```

Or call the local endpoint:

```bash
curl -X POST http://localhost:3000/notify \
  -H "Content-Type: application/json" \
  -d '{"text":"任务已完成"}'
```

## Next Step: Connect Codex/OpenAI

`src/executor.js` currently handles simple commands locally. Replace or extend `buildCommandReply()` with your own job runner, OpenAI API call, or queue-based Codex integration.

Keep long-running jobs asynchronous: reply immediately that the command was accepted, run the task in the background, then send a template notification when it completes.
