#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

cd "${PROJECT_DIR}"
exec /usr/local/bin/node src/server.js
