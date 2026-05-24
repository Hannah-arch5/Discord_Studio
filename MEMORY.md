# Project Memory

Last updated: 2026-05-25

## What This Project Is

This folder contains a local Telegram/Discord/Codex bridge. The original plan was WhatsApp Cloud API, but the active path moved to Telegram because Meta developer phone verification was blocked by SMS delivery issues. Discord is now being added as an AI studio workspace.

The goal is:

- User sends a message to the Telegram bot.
- User can also send a message in a Discord channel/thread.
- The local background service receives it.
- The service records it as a task with source/session metadata.
- The automatic Codex worker runs `codex exec` on the task.
- Telegram/Discord sends started/completed/failed notifications back to the user.

## Current Project Path

```text
/Users/hannah/Documents/Codex/2026-05-22/whatsapp
```

This directory is not currently a git repository.

## Telegram Bot

- Bot link: `t.me/Tony_525bot`
- Admin chat id is configured in `.env`.
- The bot token is stored in `.env`; do not print or commit it.
- `.gitignore` excludes `.env`, `node_modules/`, and `data/`.

Telegram polling is implemented with Bot API `getUpdates`, so it does not require a public webhook URL.

## Background Service

The bot is installed as a macOS LaunchAgent.

Useful npm scripts:

```bash
npm run service:install
npm run service:restart
npm run service:uninstall
```

Logs:

```text
data/telegram-bot.out.log
data/telegram-bot.err.log
```

After changing source files or `.env`, restart the service.

## Automatic Codex Worker

The worker is enabled through `.env`:

```text
AUTO_CODEX_ENABLED=true
CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex
AUTO_CODEX_WORKDIR=/Users/hannah/Documents/Codex/2026-05-22/whatsapp
AUTO_CODEX_TIMEOUT_MS=1200000
```

Important implementation note:

- The worker uses `spawn`, not `execFile`, and explicitly closes stdin with `child.stdin.end()`.
- This fixed a previous issue where `codex exec` could hang under LaunchAgent.

Worker command shape:

```text
codex -a never exec --skip-git-repo-check --sandbox workspace-write -C <workdir> -o <resultFile> <prompt>
```

Result files are written to:

```text
data/codex-results/
```

Discord task progress is sent back to the original Discord channel/thread. By default it is also mirrored to Telegram if `DISCORD_MIRROR_TO_TELEGRAM` is not set to `false`.

## Current Code Map

- `src/server.js`: starts Express, WhatsApp webhook routes, Telegram polling, and auto worker.
- `src/telegram.js`: Telegram long polling, message handling, pending notification delivery.
- `src/discord.js`: Discord AI Studio bot, channel/thread session handling, Discord notification delivery.
- `src/executor.js`: parses Telegram/WhatsApp commands and stores plain text as tasks.
- `src/task-store.js`: NDJSON task and notification event store.
- `src/auto-worker.js`: scans runnable tasks, calls Codex, appends completion/failure, queues Telegram notifications.
- `src/whatsapp.js`: WhatsApp Cloud API helpers, currently not the active path.

Scripts:

- `scripts/inbox.js`: list pending tasks.
- `scripts/complete-task.js`: manually complete a task and notify Telegram.
- `scripts/fail-task.js`: manually fail/skip a task.
- `scripts/cleanup-results.js`: remove local Codex result files by task or project.
- `scripts/send-telegram.js`: send a Telegram message manually.
- `scripts/install-launch-agent.sh`: install background service.
- `scripts/restart-launch-agent.sh`: restart background service.
- `scripts/uninstall-launch-agent.sh`: uninstall background service.

## Telegram Commands Today

Current supported commands:

```text
/start
/help
/ping
/pwd
/files [path]
/scripts
/run <script>
/task <message>
```

Plain text messages are already saved as tasks too.

UX improvement already started:

- User wants Telegram to feel like normal chat, not command syntax.
- Ordinary text is treated as a task.
- Task creation replies now say: `收到，我开始处理这件事。任务编号：#id`.
- Unknown slash commands now explain that natural language is OK.

## Discord AI Studio

Discord is intended to be the richer "AI studio" surface, while Telegram remains the private control channel.

Implemented:

- Dependency: `discord.js`.
- `DISCORD_STUDIO_ENABLED=false` added to `.env` and `.env.example`.
- `DISCORD_BOT_TOKEN`, `DISCORD_ALLOWED_USER_IDS`, and `DISCORD_MIRROR_TO_TELEGRAM` added.
- `src/discord.js` handles Discord messages and notifications.
- `src/team.js` defines the studio team roles, aliases, responsibilities, and role-specific execution prompts.
- Each Discord channel/thread is treated as a session.
- Session memory is stored in `data/discord-sessions.json`.
- Plain Discord messages create tasks automatically.
- `!studio project <name>` sets the current session project.
- `!studio role <role>` sets the current session default role.
- `!studio info` shows current session metadata.
- `!studio roles` lists supported roles.
- `!studio team` / `!team` lists role responsibilities.
- `!studio retention temp|archive` controls whether local Codex result files are kept for that session.
- `!assign <角色>: <任务>` explicitly assigns one task to a role without changing the channel default.
- `!cleanup task <id>` and `!cleanup project <name>` remove local result files only; Discord messages are not deleted.
- Per-message role prefixes are supported, for example `开发: 帮我检查代码`.
- Supported common roles: 总控、助理、管家、研究、开发、设计、审查.
- Discord task metadata is stored in `data/tasks.ndjson`: source, project, role, retention, session key, channel id, message id, author.

Role behavior is now more team-like:

- 总控 Codex: 拆任务、分派、汇总，维护项目全局判断和下一步行动。
- 助理 Cassie: 发现设置遗漏、命令错误和角色分配不合理时提醒、纠正，并给出正确分派。新频道未设置角色时默认使用 Cassie，默认 `retention=archive`。可用 `Cass:` 或 `Cassie:` 调用。
- 管家 Tony: 处理日常小事、路线餐厅、学习资料、提醒式查询和零碎问答。默认 `retention=temp`。可用 `Tony:` 调用。
- 研究 Codex: 查资料、做研报、整理证据和来源，输出可追溯结论。
- 开发 Codex: 写代码、改项目、跑测试、修问题，交付可运行结果。
- 设计 Codex: 做结构、体验、信息架构、界面方案和视觉方向。
- 审查 Codex: 检查风险、质量、漏洞、遗漏和可验证性。

The auto worker calls `buildRolePrompt()` so each role gets different rules and output expectations.

Special routing:

- New channels under Discord category `总控` default to `总控/Cassie 自动`.
- In that auto mode, setup/correction/routing questions go to `助理 Cassie`; planning, splitting, prioritizing, dispatching, and summary tasks go to `总控 Codex`.

Storage behavior:

- Archive mode keeps Codex result files in `data/codex-results/`.
- Temporary mode removes `data/codex-results/<task_id>.*` after the Discord/Telegram reply is queued.
- Temporary mode still leaves small task and notification events in `data/tasks.ndjson` and `data/notifications.ndjson`.
- Cleanup can also be run from terminal with `npm run cleanup:results -- task <id>` or `npm run cleanup:results -- project <name>`.
- Unknown `!` commands now return an assistant-style correction with likely command suggestions.

Discord setup is complete:

- Discord bot is connected as `Hannah AIl in One Studio#8688`.
- `DISCORD_STUDIO_ENABLED=true`.
- `DISCORD_ALLOWED_USER_IDS` is set to the user's real Discord user id.
- Message Content Intent was enabled in Discord Developer Portal.

## Discord Operating Manual

Conceptual model:

- Discord server = the user's AI Studio workspace / company building.
- Category = a project area or management area.
- Text channel = a room for a role, project, inbox, output, or discussion.
- Thread = one focused task or sub-discussion inside a channel.
- Voice channels are not used for this automation right now.
- Telegram remains a private control and notification channel; Discord is the richer multi-project workspace.

Current intended Discord structure:

```text
All in One Studio

总控
  #inbox
  #todo
  #done

Hannah's Studio
  #ai-studio-总控
  #ai-studio-开发
  #ai-studio-研究
  #ai-studio-设计
  #ai-studio-审查

Specific project categories, for example:
Spotify研报
  #spotify-总控 / #spotify-研报 / other project channels
```

Recommended usage pattern:

- `总控` category is for overall management, triage, inbox, TODO, done, and progress review.
- `Hannah's Studio` category is for talking with different AI team roles generally.
- Specific project categories are for actual project work.
- New channels can be created freely; by default they inherit project name from their category.
- User can use natural language in a configured channel; commands are mainly for setup, cleanup, and explicit routing.

Default behavior:

- New channel project defaults to the category name.
- New channel default role is `助理 Cassie`.
- New channel default storage is `archive`.
- New channels under category `总控` default to role `总控/Cassie 自动`.
- Channels whose name/category implies `管家`, `日常`, `生活`, `butler`, or `daily` should be used for Tony and `temp`.
- Setting a channel role to `管家 Tony` automatically sets retention to `temp`.
- Setting a channel role to other project roles usually keeps/sets retention to `archive`.

Special `总控` auto-routing:

- In Discord category `总控`, new channels use `总控/Cassie 自动`.
- If the message is about setup, command correction, routing, "who should handle this", or general confusion, Cassie handles it.
- If the message is about splitting work, planning, priority, roadmap, project goals, dispatch, progress summaries, or next steps, 总控 handles it.
- User can still explicitly override with `Cass: ...` or `总控: ...`.

Roles and personalities:

- `总控 Codex`: project lead. Splits tasks, dispatches, prioritizes, summarizes, and maintains project-level judgment.
- `助理 Cassie` / `Cass`: studio assistant and dispatcher. Fixes wrong commands, catches missing settings, suggests roles, and gives copyable commands.
- `管家 Tony`: daily-life butler. Handles routes, restaurants, learning materials, temporary searches, and small daily tasks. Defaults to temp.
- `研究 Codex`: research analyst. Handles market research, financial reports, source-backed summaries, and evidence.
- `开发 Codex`: engineer. Edits code, runs tests, fixes automation, and verifies implementation.
- `设计 Codex`: information architecture, UX, UI structure, visual direction, and design planning.
- `审查 Codex`: reviewer. Checks quality, risks, factual gaps, logic problems, tests, and residual risk.

Role invocation:

```text
不写角色
```

Uses the channel default role.

```text
设计: 帮我规划 AI Studio 的频道结构
```

Temporarily routes only that message to `设计 Codex`; it does not change the channel default.

```text
!assign 研究: 帮我整理 Spotify 近三年的财报重点
```

Explicit task assignment to one role; it does not change the channel default.

```text
Cass: 这个频道应该怎么设置？
Tony: 帮我查今晚附近适合两个人吃饭的餐厅
总控: 帮我把这个项目拆成下一周任务
```

Named roles/aliases work as prefix routing.

Important commands:

```text
!studio info
```

Show current channel session: project, default role, retention, channel.

```text
!studio project <项目名>
```

Set current channel/thread project.

```text
!studio role <角色>
```

Set current channel/thread default role.

```text
!studio retention temp
!studio retention archive
```

Set whether new tasks in this channel keep local Codex result files.

```text
!studio roles
!studio team
!team
```

List available roles and team responsibilities.

```text
!cleanup task <task_id>
!cleanup project <project_name>
```

Delete only local result files from the Mac. Does not delete Discord messages.

Storage rules:

- `archive`: keeps local result files under `data/codex-results/`.
- `temp`: sends the result to Discord/Telegram, then removes `data/codex-results/<task_id>.*`.
- Switching a channel from archive to temp affects only future tasks.
- Switching from temp to archive affects only future tasks.
- Old archive files remain until `!cleanup` is used.
- Old temp result files cannot be restored unless the Discord message still contains enough information.
- Small event logs remain in `data/tasks.ndjson` and `data/notifications.ndjson` even for temp tasks.
- Deleting a Discord message/channel does not delete local files.
- Deleting local files does not delete Discord messages.

Examples:

Set up a daily/Tony channel:

```text
!studio project 日常
!studio role 管家
!studio retention temp
```

Set up a research project channel:

```text
!studio project Spotify研报
!studio role 研究
!studio retention archive
```

Use Cassie for correction/routing:

```text
Cass: 这条任务应该交给谁？顺便给我正确指令
```

Use 总控 for project planning:

```text
总控: 帮我把 AI Studio 接下来一周的工作拆一下，并分派给各角色
```

Use cleanup:

```text
!cleanup task mpk35ass
!cleanup project Spotify研报
```

Natural language behavior:

- After a channel is configured, user can just speak normally.
- If no explicit role prefix is present, the default channel role handles the task.
- If a role prefix is present, that one message routes to that role.
- Commands are still best for setup and cleanup.

## Known Completed Tests

- Telegram bot connection tested with `/ping`.
- Background service installed and restarted successfully.
- Automatic worker ran at least one test task successfully.
- Task `#mpfx2p3o` completed with output indicating the automatic task flow worked.
- Notification sending was confirmed after fixing the stdin hang.

## Known Caveats

- `data/` contains local task logs, notification logs, and Codex outputs. It is intentionally ignored by git.
- This project can execute local Codex tasks from Telegram. Keep `TELEGRAM_ADMIN_CHAT_ID` restricted.
- Discord access is restricted through `DISCORD_ALLOWED_USER_IDS`.
- The worker runs with `-a never`, so it cannot ask for approval during auto execution. Risky or unclear tasks should be reported back instead of performed.
- Current `src/task-store.js` still includes fallback handling for legacy text events without `type`; be careful if changing runnable-task filtering.
- WhatsApp code remains in the repo, but it is not the path the user wants right now.
- If the current Mac is shut down, asleep, offline, or the LaunchAgent is stopped, Discord messages will remain in Discord but the bot will not process them. Current implementation does not automatically backfill missed Discord messages after the Mac comes back online.

## Future Hardware Plan

The user is considering buying a newer daily computer and turning the current older Mac into a 24-hour AI Studio execution machine.

Preferred split:

- Old/current Mac:
  - Stays plugged in and online.
  - Runs Discord/Telegram bot and Codex worker.
  - Acts as the AI Studio backend/execution machine.
  - Stores the main AI Studio working directory unless a later migration changes this.
  - Needs sleep disabled, LaunchAgent auto-start verified, and backup configured.
- New daily computer:
  - Used for normal browsing, work, design, writing, and personal use.
  - Sends tasks to the old Mac through Discord.
  - May access the old Mac through Screen Sharing, SSH, or Tailscale.
  - May sync selected project files through GitHub, iCloud, Google Drive, Dropbox, Syncthing, NAS, or another chosen sync path.

File sync guidance for that future setup:

- Avoid blindly syncing everything both ways.
- Code projects should preferably use Git/GitHub.
- Docs/assets can use iCloud/Google Drive/Dropbox if needed.
- Runtime logs, `.env`, `node_modules/`, and `data/` should usually stay local to the execution machine or be backed up intentionally.
- Decide later whether the old Mac becomes the main source of truth or just a 24-hour execution machine.

Before converting the old Mac into an always-on AI Studio server:

1. Disable sleep while plugged in.
2. Confirm LaunchAgent starts at login/reboot.
3. Set up remote access: Screen Sharing, SSH, or Tailscale.
4. Decide file sync strategy.
5. Add backup for the AI Studio directory and important project files.
6. Consider a "missed Discord message backfill" feature so messages sent while offline can be processed after the machine wakes.

## Next Best Step

Keep using the Discord AI Studio and refine channel defaults as habits emerge. Good next technical improvements:

1. Add missed-message backfill for Discord downtime.
2. Add project/task status summaries for `#todo`, `#done`, and `#inbox`.
3. Add a backup/checkup command for the future always-on Mac setup.
