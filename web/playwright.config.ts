import { defineConfig } from "@playwright/test";
const mode = process.env.WORKSIGHT_E2E_MODE === "live" ? "live" : "demo";
const port = process.env.WORKSIGHT_E2E_PORT || "3100";
const url = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: url,
    viewport: { width: 1440, height: 1000 },
    video: "on",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start",
    url,
    reuseExistingServer: !process.env.CI,
    env: {
      WORKSIGHT_MODE: mode,
      WORKSIGHT_API_URL:
        process.env.WORKSIGHT_API_URL || "http://127.0.0.1:8000",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: port,
      HOSTNAME: "127.0.0.1",
    },
  },
});
