#!/bin/bash
# Regenerates the PNG icons from the SVGs in this folder (needs rsvg-convert: brew install librsvg).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p png
for s in 16 32 48 128; do rsvg-convert -w $s -h $s logo.svg -o png/icon-$s.png; done
for name in logo lock lock-alert; do rsvg-convert -w 38 -h 38 $name.svg -o png/state-$name.png; done
rsvg-convert -w 512 -h 512 logo.svg -o png/icon-512.png
