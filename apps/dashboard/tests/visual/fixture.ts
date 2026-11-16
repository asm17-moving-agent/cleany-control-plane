import { expect, type Page, type TestInfo } from "@playwright/test";

/** Display-only fixture. Does not authenticate or send commands to a real backend. */
export async function fixture(page: Page, mode: "signed-in" | "login" | "password" = "signed-in") {
  await page.clock.setFixedTime(new Date("2026-11-16T10:00:00Z"));
  // Chromium native select can retain a fallback-font paint across a late font swap.
  // Load the real local font before the production entry module in visual fixtures only.
  // Functional E2E still exercises the unmodified bootstrap and real loading behavior.
  await page.route("**/*", async route => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    const html = (await response.text()).replace(
      /<script type="module" crossorigin src="([^"]+)"><\/script>/,
      (_, src: string) => `<script type="module">await document.fonts.load('400 14px "Cleany Pretendard"'); await document.fonts.load('600 14px "Cleany Pretendard"'); await import(${JSON.stringify(src)});</script>`,
    );
    await route.fulfill({ response, body: html });
  });
  await page.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = match(query);
      // Exercise the existing static CAD poster path. WebGL interactions have a separate suite.
      if (query === "(any-hover: hover) and (any-pointer: fine)") Object.defineProperty(result, "matches", { value: false });
      return result;
    };
  });
  await page.route(url => url.pathname.startsWith("/api/"), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me" || path === "/api/auth/session/touch") {
      return route.fulfill(mode === "login" ? { status: 401, json: { detail: "로그인이 필요합니다." } } : { json: {
        user_id: "visual-user", customer_id: "visual-customer", customer_name: "Visual fixture",
        display_name: "운영자", login_id: "visual", csrf_token: "fixture", expires_at: 1794840000,
        must_change_password: mode === "password",
      } });
    }
    if (path === "/api/sites") return route.fulfill({ json: { items: [
      { site_id: "BUSAN_SOMA_18F", display_name: "부산 소마 센터 18층", map_ref: "facility-18f" },
    ] } });
    if (path === "/api/events/stream") return route.fulfill({ contentType: "text/event-stream", body: ": connected\n\n" });
    if (route.request().method() !== "GET") return route.fulfill({ status: 401, json: { detail: "입력 내용을 확인해 주세요." } });
    return route.fulfill({ json: { items: [] } });
  });
}

export async function capture(page: Page, testInfo: TestInfo, name: string) {
  if (name !== "loading") await expect(page.locator('.task-calendar-status').filter({hasText:'불러오는 중'})).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {})));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(page).toHaveScreenshot(name + ".png", { fullPage: true });
  // Metadata makes viewport and fixture provenance explicit in exported comparison reports.
  await testInfo.attach("fixture", { body: JSON.stringify({ name, viewport: page.viewportSize(), time: "2026-11-16T10:00:00Z", data: "display-only fixtures", model: "static CAD poster" }), contentType: "application/json" });
}
