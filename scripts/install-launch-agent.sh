#!/usr/bin/env bash
set -euo pipefail

LABEL="com.hannah.codex.telegrambot"
PROJECT_DIR="/Users/hannah/Documents/Codex/2026-05-22/whatsapp"
PLIST_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/${LABEL}.plist"
NPM_PATH="$(command -v npm)"
USER_ID="$(id -u)"

mkdir -p "${PROJECT_DIR}/data"
mkdir -p "${PLIST_DIR}"

cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NPM_PATH}</string>
    <string>start</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${PROJECT_DIR}/data/telegram-bot.out.log</string>

  <key>StandardErrorPath</key>
  <string>${PROJECT_DIR}/data/telegram-bot.err.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
PLIST

launchctl bootout "gui/${USER_ID}" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${USER_ID}" "${PLIST_PATH}"
launchctl enable "gui/${USER_ID}/${LABEL}"
launchctl kickstart -k "gui/${USER_ID}/${LABEL}"

echo "Installed and started ${LABEL}"
echo "Logs:"
echo "  ${PROJECT_DIR}/data/telegram-bot.out.log"
echo "  ${PROJECT_DIR}/data/telegram-bot.err.log"
