import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3100", viewport: { width: 1440, height: 1000 }, video: "on", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "npm run build && npm run start", url: "http://127.0.0.1:3100", reuseExistingServer: !process.env.CI, env: { WORKSIGHT_MODE: "demo", NEXT_TELEMETRY_DISABLED: "1", PORT: "3100", HOSTNAME: "127.0.0.1" } },
});
