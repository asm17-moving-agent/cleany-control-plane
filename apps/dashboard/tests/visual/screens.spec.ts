import { expect, test } from "@playwright/test";
import { capture, fixture } from "./fixture";

test.beforeEach(async ({ page }) => { await fixture(page); });
for (const [name, route] of [
  ["home", "/map?demo=1"], ["missions", "/missions?demo=1"],
  ["results", "/results?demo=1&filter=review"], ["robots", "/robots?demo=1"],
  ["monitoring", "/monitoring?demo=1"], ["settings", "/settings?demo=1"],
] as const) {
  test(name, async ({ page }, testInfo) => {
    await page.goto(route);
    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
    if (name === "missions" || name === "results") await expect(page.locator(".task-detail-heading")).toBeVisible();
    if (name === "monitoring") {
      // The home is lazy-loaded; navigation alone does not prove chart readiness.
      await expect(page.locator(".cafe-seat-grid > span")).toHaveCount(82);
      await expect(page.locator(".cafe-home .recharts-surface")).toHaveCount(3);
    }
    await capture(page, testInfo, name);
  });
}
test("request", async ({ page }, testInfo) => {
  await page.goto("/map?demo=1");
  await page.getByRole("button", { name: /^12번 좌석 ·/ }).click();
  await expect(page.getByRole("button", { name: "요청 보내기" })).toBeDisabled();
  await capture(page, testInfo, "request");
});
test("robot drawer", async ({ page }, testInfo) => {
  await page.goto("/map?demo=1");
  // Finish the initial map paint before focusing/zooming it. Otherwise Chromium can
  // retain a different SVG text raster when the floorplan decodes during the zoom.
  await page.locator("img.facility-plan-artwork").evaluate(async element => {
    await (element as HTMLImageElement).decode();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.getByRole("button", { name: "cleany-01 상세 열기" }).click();
  await expect(page.getByRole("complementary", { name: "로봇 상세", exact: true })).toBeVisible();
  await capture(page, testInfo, "robot-drawer");
});
test("menu", async ({ page }, testInfo) => {
  await page.goto("/settings?demo=1");
  await page.getByLabel("운영 메뉴", { exact: true }).click();
  await expect(page.locator(".workspace-popover:visible")).toBeVisible();
  await capture(page, testInfo, "menu");
});
test("empty", async ({ page }, testInfo) => {
  await page.goto("/missions");
  await expect(page.getByRole("heading", { name: "작업 요청 없음" })).toBeVisible();
  await capture(page, testInfo, "empty");
});

test("workspace request and previous day", async ({ page }, testInfo) => {
  await page.goto('/missions?demo=1');
  await page.getByRole('button', {name:'＋ 새 작업 요청', exact:true}).click();
  await page.getByLabel('작업 좌석', {exact:true}).selectOption('seat-12');
  await expect(page.getByRole('button', {name:'요청 보내기', exact:true})).toBeDisabled();
  const submit = await page.getByRole('button', {name:'요청 보내기', exact:true}).boundingBox();
  expect(submit!.y + submit!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await capture(page, testInfo, 'workspace-request');
  await page.getByRole('button', {name:'이전 날짜', exact:true}).click();
  await expect(page.getByRole('region', {name:'작업 상세', exact:true})).toContainText('NAVIGATION_BLOCKED');
  await capture(page, testInfo, 'workspace-previous-day');
});

test("manual and camera", async ({ page }, testInfo) => {
  await page.goto("/robots?demo=1");
  const panel = page.getByRole("region", { name: "수동 조종", exact: true });
  // Wait for the local font before scrolling; native select text otherwise caches its fallback paint.
  await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await panel.scrollIntoViewIfNeeded(); // Wait for the existing panel entrance animation to settle.
  await panel.evaluate(el => el.scrollIntoView({block: "start"}));
  await expect(panel.getByRole("application", { name: "이동 조이스틱", exact: true })).toHaveAttribute("aria-disabled", "true");
  await capture(page, testInfo, "manual-camera");
  await panel.getByRole("button", { name: "■ 정지", exact: true }).scrollIntoViewIfNeeded();
  await capture(page, testInfo, "manual-controls");
});

test("data error", async ({ page }, testInfo) => {
  await page.route('**/api/missions?*', route => route.fulfill({status:503,json:{detail:'fixture unavailable'}}));
  await page.goto('/missions');
  await expect(page.getByText('작업 목록을 불러올 수 없음')).toBeVisible();
  await capture(page, testInfo, 'data-error');
});
test("loading", async ({ page }, testInfo) => {
  await page.route('**/api/missions?*', () => new Promise(() => {}));
  await page.goto('/missions');
  await expect(page.locator('.ops-body')).toHaveAttribute('aria-busy','true');
  await capture(page, testInfo, 'loading');
});

test("home attention", async ({ page }, testInfo) => {
  await page.goto('/?demo=1&homeScenario=attention');
  await expect(page.getByRole('alert')).toContainText('관리자 확인 필요');
  await capture(page, testInfo, 'home-attention');
});
test("home no data", async ({ page }, testInfo) => {
  await page.route('**/api/sites', route => route.fulfill({json:{items:[{site_id:'BUSAN_SOMA_19F',display_name:'부산 소마 센터 19층',map_ref:'unconnected'}]}}));
  await page.goto('/?demo=1');
  await expect(page.getByRole('heading',{name:'예시 데이터 없음'})).toBeVisible();
  await capture(page, testInfo, 'home-no-data');
});
