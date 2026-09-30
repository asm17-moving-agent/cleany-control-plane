import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: "**/gateway.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:18081",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1080 },
  },
  webServer: {
    command: "uv run --project ../backend python ../backend/run.py",
    env: { CLEANY_ROBOT_MODE: "mock", CLEANY_DATABASE_PATH: ":memory:", CLEANY_PORT: "18081" },
    url: "http://127.0.0.1:18081/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
