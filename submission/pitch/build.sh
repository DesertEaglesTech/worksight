#!/usr/bin/env bash
# Renders the cover PNG (exactly 1280×720) from its HTML source with Playwright's Chromium.
#   bash submission/pitch/build.sh
# Needs web/node_modules (cd web && npm ci). CHROME overrides the browser binary. The pitch deck
# itself lives in the Slides artifact (see submission/description.md) and is exported from there.
set -euo pipefail
cd "$(dirname "$0")"
export COVER_HTML="file://$PWD/worksight-cover.html" COVER_PNG="$PWD/../worksight-cover.png"
node --input-type=module -e '
const { chromium } = await import(process.cwd() + "/../../web/node_modules/playwright-core/index.mjs");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.env.COVER_HTML, { waitUntil: "networkidle" });
await page.screenshot({ path: process.env.COVER_PNG });
await browser.close();
'
