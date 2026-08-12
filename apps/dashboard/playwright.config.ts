import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8080",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1080 },
  },
  webServer: {
    command: "uv run --project ../backend python ../backend/run.py",
    url: "http://127.0.0.1:8080/api/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
