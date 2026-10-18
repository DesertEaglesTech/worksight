#!/usr/bin/env bash
# Renders the cover PNG from its HTML source with headless Chromium.
#   bash submission/pitch/build.sh
# CHROME overrides the browser binary. The pitch deck itself lives in the Slides artifact
# (see submission/description.md) and is exported from there as PDF.
set -euo pipefail
cd "$(dirname "$0")"
CHROME=${CHROME:-$(command -v chromium || command -v google-chrome || echo /opt/pw-browsers/chromium-1194/chrome-linux/chrome)}
"$CHROME" --headless --no-sandbox --disable-gpu --allow-file-access-from-files --hide-scrollbars \
  --virtual-time-budget=5000 --window-size=1280,720 --screenshot=../worksight-cover.png \
  "file://$PWD/worksight-cover.html"
