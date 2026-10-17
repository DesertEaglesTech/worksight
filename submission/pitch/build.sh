#!/usr/bin/env bash
# Renders the pitch PDF and cover PNG from the HTML sources with headless Chromium.
#   bash submission/pitch/build.sh
# CHROME overrides the browser binary.
set -euo pipefail
cd "$(dirname "$0")"
CHROME=${CHROME:-$(command -v chromium || command -v google-chrome || echo /opt/pw-browsers/chromium-1194/chrome-linux/chrome)}
flags=(--headless --no-sandbox --disable-gpu --allow-file-access-from-files --hide-scrollbars)
"$CHROME" "${flags[@]}" --no-pdf-header-footer --print-to-pdf=../worksight-pitch.pdf \
  "file://$PWD/worksight-pitch.html"
"$CHROME" "${flags[@]}" --window-size=1280,720 --screenshot=../worksight-cover.png \
  "file://$PWD/worksight-cover.html"
