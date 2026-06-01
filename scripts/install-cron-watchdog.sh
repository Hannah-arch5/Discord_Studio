#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WATCHDOG="${PROJECT_DIR}/scripts/discord-studio-watchdog.sh"
MARKER="# Discord_Studio watchdog"
ENTRY="* * * * * ${WATCHDOG} ${MARKER}"

chmod +x "${WATCHDOG}"

TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

crontab -l 2>/dev/null | grep -vF "${MARKER}" >"${TMP_FILE}" || true
echo "${ENTRY}" >>"${TMP_FILE}"
crontab "${TMP_FILE}"

"${WATCHDOG}"

echo "Installed Discord_Studio cron watchdog."
echo "It checks every minute and starts the Discord bot if it is not running."
