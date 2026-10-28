#!/bin/bash
# Builds AutoConsent and zips it into dist/autoconsent-v<version>.zip for a GitHub release.
set -euo pipefail
cd "$(dirname "$0")/../.."

"$(dirname "$0")/build.sh"
VERSION=$(cat addon/personal/VERSION)
ZIP="$PWD/dist/autoconsent-v$VERSION.zip"
rm -f "$ZIP"
(cd extension && zip -qr -X "$ZIP" . -x '.*')
echo "$ZIP"
