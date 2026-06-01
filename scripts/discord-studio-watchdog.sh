#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
NODE_PATH="/usr/local/bin/node"
PID_PATTERN="${PROJECT_DIR}/src/server.js"
OUT_LOG="${PROJECT_DIR}/data/discord-studio.cron.out.log"
ERR_LOG="${PROJECT_DIR}/data/discord-studio.cron.err.log"

mkdir -p "${PROJECT_DIR}/data"

if /usr/bin/pgrep -f "${PID_PATTERN}" >/dev/null 2>&1; then
  exit 0
fi

cd "${PROJECT_DIR}"
nohup "${NODE_PATH}" src/server.js >>"${OUT_LOG}" 2>>"${ERR_LOG}" &
