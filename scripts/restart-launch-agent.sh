#!/usr/bin/env bash
set -euo pipefail

LABEL="com.hannah.codex.telegrambot"
USER_ID="$(id -u)"

launchctl kickstart -k "gui/${USER_ID}/${LABEL}"
echo "Restarted ${LABEL}"
