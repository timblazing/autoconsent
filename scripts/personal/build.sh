#!/bin/bash
# Builds the personal extension (upstream addon + addon/personal UI) into ./extension.
# After it finishes, click reload on the extension in helium://extensions.
set -euo pipefail
cd "$(dirname "$0")/../.."

[ -d node_modules ] || PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --ignore-scripts --no-audit --no-fund --loglevel=error

npm run build-rules --silent
./build.sh >/tmp/autoconsent-build.log 2>&1 || { cat /tmp/autoconsent-build.log; exit 1; }

OUT=dist/addon-mv3
ESBUILD="node_modules/.bin/esbuild --bundle --log-level=warning"
$ESBUILD addon/personal/background.ts --outfile=$OUT/background.bundle.js
mkdir -p $OUT/personal
$ESBUILD addon/personal/popup.ts --outfile=$OUT/personal/popup.bundle.js
$ESBUILD addon/personal/options.ts --outfile=$OUT/personal/options.bundle.js
cp addon/personal/popup.html addon/personal/options.html $OUT/personal/
rm -rf $OUT/personal/ui && cp -R addon/personal/ui $OUT/personal/ui

node scripts/personal/manifest.mjs $OUT/manifest.json

rm -rf extension
cp -R $OUT extension
node -e "const m=require('./extension/manifest.json'); console.log('Built ' + m.name + ' ' + m.version + ' -> ' + process.cwd() + '/extension')"
