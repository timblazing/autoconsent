#!/bin/bash
# Pulls DuckDuckGo's latest autoconsent (rules + engine), replays the personal branch on top, and rebuilds.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi

git fetch -q upstream main
git rebase upstream/main
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --ignore-scripts --no-audit --no-fund --loglevel=error
"$(dirname "$0")/build.sh"
