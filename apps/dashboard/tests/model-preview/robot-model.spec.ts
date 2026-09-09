import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ROTATION_GUIDE } from "../../src/components/robot-model-motion";

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
  const canvas = page.getByRole("group", { name: "Cleany 모델 회전" });
  await expect(canvas).toHaveAttribute("data-model", "standby");
  await expect(canvas).toHaveAttribute("data-exterior", "true");
  return canvas;
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

test("touch-only devices use the poster and do not fetch the GLB", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    const downloads: string[] = [];
    page.on("request", request => { if (request.url().endsWith(".glb")) downloads.push(request.url()); });
    await fixtureApi(page);
    await page.goto("/robot-model");
    await expect(page.getByAltText("Cleany 대기 자세와 외장 시안")).toBeVisible();
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
  await expect(page.getByAltText("Cleany 대기 자세와 외장 시안")).toBeVisible();
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
  await expect(page.getByAltText("Cleany 대기 자세와 외장 시안")).toBeVisible();
  await page.getByRole("button", { name: "3D 다시 시도" }).click();
  await expect(page.locator(".robot-model-card")).toHaveAttribute("data-state", "ready");
});

test("home roster stays static while the detail model supports dragging and teardown", async ({ page }) => {
  await fixtureApi(page);
  await page.goto("/?renderStats=1");
  const roster = page.getByRole("complementary", { name: "로봇 목록", exact: true });
  await roster.locator(".home-robot-thumbnail").hover();
  await page.mouse.move(0, 0);
  await expect(roster.locator(".robot-model-card, canvas")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "로봇 상세", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "cleany-01 상세 열기" }).click();
  const panel = page.getByRole("complementary", { name: "로봇 상세", exact: true });
  await expect(panel.locator(".robot-model-card")).toHaveCount(1);
  await expect(panel.getByText("미연동", { exact: true })).toBeVisible();
  await expect(panel.getByText("현재 할당된 작업이 없습니다.")).toBeVisible();
  expect(await panel.locator(".robot-detail-metrics").evaluate(element =>
    element.getBoundingClientRect().bottom <= element.closest(".robot-detail-content")!.getBoundingClientRect().bottom,
  )).toBe(true);
  const detailModel = panel.locator(".robot-model-card");
  await detailModel.scrollIntoViewIfNeeded();
  await expect(detailModel).toHaveAttribute("data-state", "ready");
  const detailCanvas = detailModel.getByRole("group", { name: "Cleany 모델 회전" });
  await detailCanvas.hover();
  await expectIdle(page, detailCanvas);
  const detailStart = await yaw(detailCanvas);
  const detailBounds = (await detailCanvas.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(detailBounds.x + detailBounds.width / 2 + 65, detailBounds.y + detailBounds.height / 2 + 12, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await expectIdle(page, detailCanvas);
  expect(await yaw(detailCanvas)).toBeLessThan(detailStart - .2);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "로봇 목록", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".robot-model-card")).toHaveCount(0);
  await page.setViewportSize({ width: 1100, height: 768 });
  expect(await roster.locator(".home-robot-identity strong").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "작업", exact: true }).click();
  await expect(page.locator(".robot-model-card, .robot-model-canvas canvas")).toHaveCount(0);
});

test("robot detail extends a two-headed arc with its outward turn and return, then yields to dragging", async ({ page }) => {
  test.setTimeout(45000);
  await fixtureApi(page);
  await page.goto("/robots?renderStats=1");
  const card = page.locator(".workspace-robot-overview .robot-model-card");
  await expect(card).toHaveAttribute("data-state", "ready");
  const canvas = card.getByRole("group", { name: "Cleany 모델 회전" });
  const guide = card.locator(".robot-model-rotation-guide");
  const arc = guide.locator(".robot-model-rotation-arc");
  const arrowheads = guide.locator(".robot-model-arrowhead");
  await expect(arrowheads).toHaveCount(2);
  const home = await yaw(canvas);
  for (let cycle = 0; cycle < 2; cycle++) {
    await expect(canvas).toHaveAttribute("data-guide-direction", "left", { timeout: 10000 });
    await expect.poll(() => yaw(canvas), { intervals: [50, 100, 200] }).toBeGreaterThan(home + .15);
    await expect(canvas).toHaveAttribute("data-guide-geometry", "ground-arc");
    await expect(guide).toHaveCSS("opacity", "1");
    for (const arrowhead of await arrowheads.all()) await expect(arrowhead).toHaveAttribute("d", /^M.+L.+L.+$/);
    const outwardPath = await arc.getAttribute("d");
    await expect(canvas).toHaveAttribute("data-guide-direction", "right");
    await expect(arc).not.toHaveAttribute("d", outwardPath!);
    await expect.poll(() => yaw(canvas), { intervals: [50, 100, 200] }).toBeLessThan(home + .15);
    await expect(canvas).toHaveAttribute("data-guide-direction", "none");
    await expect(guide).toHaveCSS("opacity", "0");
    await expectIdle(page, canvas);
    expect(await yaw(canvas)).toBeCloseTo(home, 4);
  }
  await canvas.hover();
  await expectIdle(page, canvas);
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 55, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await canvas.evaluate(element => (element as HTMLElement).blur());
  await expectIdle(page, canvas);
  const chosen = await yaw(canvas);
  const frames = await canvas.getAttribute("data-frames");
  await page.waitForTimeout(ROTATION_GUIDE.repeatDelayMs + 500);
  expect(await yaw(canvas)).toBeCloseTo(chosen, 4);
  expect(await canvas.getAttribute("data-frames")).toBe(frames);
  await expect(canvas).toHaveAttribute("data-guide-direction", "none");
  await expect(card.locator(".robot-model-caption")).toHaveCSS("border-top-width", "0px");
  await expect(card.locator(".robot-model-caption")).toHaveCSS("justify-content", "flex-end");
  await expect(card.locator(".robot-model-hint")).toHaveText("드래그하여 회전");
  await expect(card.locator(".robot-model-label")).toHaveCount(0);
});

test("reduced motion suppresses the detail guide and keeps keyboard rotation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixtureApi(page);
  await page.goto("/robots?renderStats=1");
  const card = page.locator(".workspace-robot-overview .robot-model-card");
  await expect(card).toHaveAttribute("data-state", "ready");
  const canvas = card.getByRole("group", { name: "Cleany 모델 회전" });
  const home = await yaw(canvas);
  await page.waitForTimeout(ROTATION_GUIDE.firstDelayMs + ROTATION_GUIDE.durationSeconds * 1000 + 300);
  await expect(canvas).toHaveAttribute("data-guide-direction", "none");
  await expectIdle(page, canvas);
  expect(await yaw(canvas)).toBeCloseTo(home, 4);
  await canvas.press("ArrowRight");
  await expect.poll(() => yaw(canvas)).toBeLessThan(home - .2);
});

test("home detail pauses its guide when the model is scrolled out of view", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 480 });
  await fixtureApi(page);
  await page.goto("/?renderStats=1");
  await page.getByRole("button", { name: "cleany-01 상세 열기" }).click();
  const panel = page.getByRole("complementary", { name: "로봇 상세", exact: true });
  const card = panel.locator(".robot-model-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-state", "ready");
  const canvas = card.getByRole("group", { name: "Cleany 모델 회전" });
  await page.mouse.move(0, 0);
  await expect(canvas).toHaveAttribute("data-guide-direction", "left");
  await panel.locator(".robot-detail-content").evaluate(element => { element.scrollTop = 0; });
  await expect.poll(() => canvas.evaluate(element =>
    element.getBoundingClientRect().top >= element.closest(".robot-detail-content")!.getBoundingClientRect().bottom,
  )).toBe(true);
  await expectIdle(page, canvas);
  await expect(canvas).toHaveAttribute("data-guide-direction", "none");
  const frames = await canvas.getAttribute("data-frames");
  await page.waitForTimeout(ROTATION_GUIDE.firstDelayMs + ROTATION_GUIDE.durationSeconds * 1000);
  expect(await canvas.getAttribute("data-frames")).toBe(frames);
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
  await page.getByRole("button", { name: "cleany-01 상세 열기" }).click();
  await page.locator(".robot-model-card").scrollIntoViewIfNeeded();
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
