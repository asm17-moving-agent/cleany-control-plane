import { defineConfig } from "@playwright/test";

const port = 5176;
export default defineConfig({
  testDir: "./tests/model-preview",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:" + port,
    viewport: { width: 1366, height: 768 },
    locale: "ko-KR",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
    },
  },
  webServer: {
    command: "pnpm dev --port " + port + " --strictPort",
    url: "http://127.0.0.1:" + port + "/robot-model",
    reuseExistingServer: !process.env.CI,
  },
});
