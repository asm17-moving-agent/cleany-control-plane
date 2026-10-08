import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

process.env.CLEANY_E2E_DATABASE ??= join(mkdtempSync(join(tmpdir(), "cleany-accounts-e2e-")), "control.db");
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
    command: "uv run --project ../backend python tests/e2e/support/server.py",
    env: { CLEANY_ROBOT_MODE: "mock", CLEANY_DATABASE_PATH: process.env.CLEANY_E2E_DATABASE, CLEANY_AUTH_STREAM_RECHECK_SECONDS: "0.1", CLEANY_PORT: "18081" },
    url: "http://127.0.0.1:18081/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
