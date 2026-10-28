#!/bin/bash
# Merges DuckDuckGo's latest autoconsent (rules + engine) into the current branch and rebuilds.
# Merge, not rebase: main is published, so its history must not be rewritten.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi

git fetch -q upstream main
git merge --no-edit upstream/main
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --ignore-scripts --no-audit --no-fund --loglevel=error
"$(dirname "$0")/build.sh"
