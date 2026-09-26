#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' "Python 3.10 or newer is required. Install Python 3 and python3-venv, then try again."
  exit 1
fi

exec python3 launch.py