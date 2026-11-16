import { defineConfig } from "@playwright/test";

const external = process.env.CLEANY_VISUAL_URL;
export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./test-results/visual",
  snapshotPathTemplate: (process.env.CLEANY_VISUAL_SNAPSHOTS ?? "{testDir}/snapshots") + "/{projectName}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixels: 0, threshold: 0 } },
  use: {
    baseURL: external ?? "http://127.0.0.1:18083",
    locale: "ko-KR", timezoneId: "Asia/Seoul", colorScheme: "light",
    reducedMotion: "reduce", deviceScaleFactor: 1, trace: "retain-on-failure",
    // Partial raster retains slightly different SVG/rounded-edge antialiasing after
    // incremental paints. Render complete tiles for reproducible zero-pixel checks.
    // https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md
    launchOptions: { args: ["--disable-partial-raster"] },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "laptop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "compact", testMatch: /layout\.spec\.ts/, use: { viewport: { width: 1024, height: 768 } } },
    { name: "mobile-login", testMatch: /login\.spec\.ts/, use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: external ? undefined : {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 18083 --strictPort",
    url: "http://127.0.0.1:18083", reuseExistingServer: false,
  },
});
