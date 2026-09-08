import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function fixtureApi(page: Page, robotCount = 1) {
  await page.route(url => url.pathname.startsWith("/api/"), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/events/stream") return route.fulfill({ contentType: "text/event-stream", body: ": connected\n\n" });
    return route.fulfill({ json: { items: path === "/api/robots" ? Array.from({ length: robotCount }, (_, index) => ({
      robot_id: "cleany-" + String(index + 1).padStart(2, "0"), state: "IDLE", active_mission_id: null, last_seen_at: "2026-09-08T10:00:00Z",
    })) : [] } });
  });
}
async function openPreview(page: Page) {
  await fixtureApi(page);
  await page.goto("/robot-model?renderStats=1");
  await expect(page.locator(".robot-model-card")).toHaveAttribute("data-state", "ready");
  return page.getByRole("group", { name: "Cleany 모델 회전" });
}
async function yaw(canvas: Locator) { return Number(await canvas.getAttribute("data-yaw")); }
async function settle(canvas: Locator) {
  await expect(canvas).toHaveAttribute("data-animating", "false", { timeout: 10000 });
}
async function expectIdle(page: Page, canvas: Locator) {
  await settle(canvas);
  // Pointer release may still have one final paint queued after the pose settles.
  await expect.poll(async () => {
    const frames = await canvas.getAttribute("data-frames");
    await page.waitForTimeout(250);
    return await canvas.getAttribute("data-frames") === frames;
  }).toBe(true);
}

test("hover settles, dragging keeps its angle, and reset and keyboard controls work", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const canvas = await openPreview(page);
  const home = await yaw(canvas);
  await expectIdle(page, canvas);
  await canvas.hover();
  await expect.poll(() => yaw(canvas)).toBeGreaterThan(home + .15);
  await expectIdle(page, canvas);
  await page.mouse.move(0, 0);
  await expect.poll(() => yaw(canvas)).toBeCloseTo(home, 4);
  await expectIdle(page, canvas);

  await canvas.hover();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 65, bounds.y + bounds.height / 2 + 15, { steps: 8 });
  await expect.poll(() => yaw(canvas)).toBeLessThan(home - .3);
  const chosen = await yaw(canvas);
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await expectIdle(page, canvas);
  expect(await yaw(canvas)).toBeCloseTo(chosen, 4);
  await expect(page.getByRole("button", { name: "모델을 처음 각도로 되돌리기" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("dragged.png") });
  await page.getByRole("button", { name: "모델을 처음 각도로 되돌리기" }).click();
  await expect.poll(() => yaw(canvas)).toBeCloseTo(home, 4);
  await expectIdle(page, canvas);
  await canvas.press("ArrowRight");
  await expect.poll(() => yaw(canvas)).toBeLessThan(home - .2);
  await canvas.press("Home");
  await expect.poll(() => yaw(canvas)).toBeCloseTo(home, 4);
  await expectIdle(page, canvas);
  expect(errors).toEqual([]);
});

test("hover finishes promptly even when the browser delivers infrequent frames", async ({ page }) => {
  await page.addInitScript(() => {
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 500);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
  });
  const canvas = await openPreview(page);
  const home = await yaw(canvas);
  await canvas.hover();
  await expect.poll(() => yaw(canvas), { timeout: 4000 }).toBeGreaterThan(home + .15);
  await expect(canvas).toHaveAttribute("data-animating", "false", { timeout: 4000 });
  await page.mouse.move(0, 0);
  await expect.poll(() => yaw(canvas), { timeout: 4000 }).toBeCloseTo(home, 4);
});

test("pointer capture allows releasing a drag outside the card", async ({ page }) => {
  const canvas = await openPreview(page);
  const bounds = (await canvas.boundingBox())!;
  await canvas.hover();
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width + 60, bounds.y + 100, { steps: 8 });
  await expect(canvas).toHaveAttribute("data-dragging", "true");
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-dragging", "false");
  await expectIdle(page, canvas);
  const chosen = await yaw(canvas);
  await page.mouse.move(0, 0);
  expect(await yaw(canvas)).toBeCloseTo(chosen, 4);
});

test("reduced motion disables hover and easing while keeping deliberate rotation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const canvas = await openPreview(page);
  const home = await yaw(canvas);
  await canvas.hover();
  await expectIdle(page, canvas);
  expect(await yaw(canvas)).toBe(home);
  await canvas.press("ArrowRight");
  await expect.poll(() => yaw(canvas)).toBeLessThan(home - .2);
  await expect(canvas).toHaveAttribute("data-animating", "false");
  await canvas.press("Home");
  await expect.poll(() => yaw(canvas)).toBe(home);
});

test("touch-only devices use the poster and do not fetch the GLB", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    const downloads: string[] = [];
    page.on("request", request => { if (request.url().endsWith(".glb")) downloads.push(request.url()); });
    await fixtureApi(page);
    await page.goto("http://127.0.0.1:5176/robot-model");
    await expect(page.getByAltText("Cleany 로봇 외형")).toBeVisible();
    await expect(page.locator(".robot-model-card")).toHaveAttribute("data-state", "poster");
    await expect(page.locator("canvas")).toHaveCount(0);
    expect(downloads).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("touch-poster.png") });
  } finally { await context.close(); }
});

test("a failed model download retains the poster and can be retried", async ({ page }) => {
  await fixtureApi(page);
  await page.route("**/models/*.glb", route => route.abort());
  await page.goto("/robot-model");
  await expect(page.locator(".robot-model-card")).toHaveAttribute("data-state", "error");
  await expect(page.getByAltText("Cleany 로봇 외형")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.unroute("**/models/*.glb");
  await page.getByRole("button", { name: "3D 다시 시도" }).click();
  await expect(page.locator(".robot-model-card")).toHaveAttribute("data-state", "ready");
});

test("a lost WebGL context falls back cleanly and supports a fresh renderer", async ({ page }) => {
  await openPreview(page);
  await page.locator(".robot-model-canvas canvas").evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!;
    gl.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await expect(page.locator(".robot-model-card")).toHaveAttribute("data-state", "error");
  await expect(page.getByAltText("Cleany 로봇 외형")).toBeVisible();
  await page.getByRole("button", { name: "3D 다시 시도" }).click();
  await expect(page.locator(".robot-model-card")).toHaveAttribute("data-state", "ready");
});

test("home model rotation is separate from opening details and survives closing the drawer", async ({ page }) => {
  await fixtureApi(page);
  await page.goto("/?renderStats=1");
  const roster = page.getByRole("complementary", { name: "로봇 현황", exact: true });
  await expect(roster.locator(".robot-model-card")).toHaveAttribute("data-state", "ready");
  const canvas = roster.getByRole("group", { name: "Cleany 모델 회전" });
  const home = await yaw(canvas);
  await canvas.click();
  await expect(page.getByRole("complementary", { name: "로봇 상세", exact: true })).toHaveCount(0);
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 45, bounds.y + bounds.height / 2 + 8, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await expectIdle(page, canvas);
  const chosen = await yaw(canvas);
  expect(chosen).toBeLessThan(home - .2);
  await expect(page.getByRole("complementary", { name: "로봇 상세", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "cleany-01 상세 열기" }).click();
  const panel = page.getByRole("complementary", { name: "로봇 상세", exact: true });
  await expect(panel.locator(".robot-model-card")).toHaveCount(0);
  await expect(panel.getByText("미연동", { exact: true })).toBeVisible();
  await expect(panel.getByText("현재 할당된 작업이 없습니다.")).toBeVisible();
  expect(await panel.locator(".robot-detail-metrics").evaluate(element =>
    element.getBoundingClientRect().bottom <= element.closest(".robot-detail-content")!.getBoundingClientRect().bottom,
  )).toBe(true);
  await panel.getByRole("button", { name: "로봇 상세 닫기" }).click();
  await expect(panel).toHaveCount(0);
  expect(await yaw(canvas)).toBeCloseTo(chosen, 4);
  await page.setViewportSize({ width: 1100, height: 768 });
  expect(await roster.locator(".home-robot-identity strong").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "작업", exact: true }).click();
  await expect(page.locator(".robot-model-card, .robot-model-canvas canvas")).toHaveCount(0);
});

test("home loads nearby roster models and pauses a model scrolled out of view", async ({ page }) => {
  await fixtureApi(page, 6);
  await page.goto("/?renderStats=1");
  const cards = page.getByRole("complementary", { name: "로봇 현황", exact: true }).locator(".robot-model-card");
  await expect(cards.first()).toHaveAttribute("data-state", "ready");
  await expect(cards.last()).toHaveAttribute("data-state", "poster");
  const canvas = cards.first().getByRole("group", { name: "Cleany 모델 회전" });
  await canvas.hover();
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => canvas.evaluate(element =>
    element.getBoundingClientRect().bottom <= element.closest(".home-robot-list")!.getBoundingClientRect().top,
  )).toBe(true);
  await expectIdle(page, canvas);
  await expect(cards.last()).toHaveAttribute("data-state", "ready");
});

test("leaving home during download does not resurrect its canvas", async ({ page }) => {
  await fixtureApi(page);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/models/*.glb", async route => { await delayed; await route.continue(); });
  const requested = page.waitForRequest(request => request.url().endsWith(".glb"));
  await page.goto("/");
  await requested;
  await expect(page.locator(".robot-model-card")).toHaveAttribute("data-state", "loading");
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "작업", exact: true }).click();
  const completed = page.waitForResponse(response => response.url().endsWith(".glb"));
  release();
  await (await completed).finished();
  await page.waitForTimeout(150);
  await expect(page.locator(".robot-model-card, .robot-model-canvas canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});
