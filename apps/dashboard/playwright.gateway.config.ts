import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import base from "./playwright.config";

process.env.CLEANY_GATEWAY_E2E_DATABASE ??= join(mkdtempSync(join(tmpdir(), "cleany-gateway-e2e-")), "control.db");
export default defineConfig({
  ...base,
  testMatch: "gateway.spec.ts",
  testIgnore: [],
  globalTeardown: "./tests/e2e/support/gateway-teardown.ts",
  use: { ...base.use, baseURL: "http://127.0.0.1:18082" },
  webServer: {
    command: "uv run --project ../backend python ../backend/run.py",
    env: {
      CLEANY_ROBOT_MODE: "gateway", CLEANY_PORT: "18082",
      CLEANY_DATABASE_PATH: process.env.CLEANY_GATEWAY_E2E_DATABASE,
    },
    url: "http://127.0.0.1:18082/api/health", reuseExistingServer: false, timeout: 30_000,
  },
});
