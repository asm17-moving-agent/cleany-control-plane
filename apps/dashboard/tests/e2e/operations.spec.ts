import { expect, test } from "./support/auth";

test("operator can select a seat on the map and send a supported request", async ({ page }) => {
  await page.goto("/map");
  const fleet = page.getByRole("complementary", { name: "로봇 목록", exact: true });
  await expect(fleet).toBeVisible();
  await expect(page.locator("button.facility-map-seat")).toHaveCount(82);
  await expect(page.getByRole("complementary", { name: "작업 요청 패널" })).toHaveCount(0);
  await page.getByRole("button", { name: "12번 좌석 · 비어 있음" }).click();
  const panel = page.getByRole("complementary", { name: "작업 요청 패널" });
  await expect(panel).toBeVisible();
  await expect(fleet).toBeVisible();
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  await panel.getByRole("combobox", { name: "우선순위" }).selectOption("HIGH");
  const requestPromise = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/missions" && request.method() === "POST");
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/missions" && response.request().method() === "POST");
  await panel.getByRole("button", { name: "요청 보내기" }).click();
  const payload = (await requestPromise).postDataJSON();
  expect(payload).toEqual({
    target: { kind: "SEAT", reference_id: "seat-12", label: "D-HUB · 12번 좌석" },
    priority: "HIGH", idempotency_key: expect.any(String),
  });
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const mission = await response.json();
  const robot = page.getByRole("complementary", { name: "로봇 상세", exact: true });
  await expect(robot).toBeVisible();
  const detail = robot.getByRole("link", { name: "작업 상세 보기" });
  await expect(detail).toHaveAttribute("href", "/missions?mission=" + mission.mission_id);
  await detail.click();
  await expect(page).toHaveURL(new RegExp("/missions\\?mission=" + mission.mission_id + "$"));
  await expect(page.getByRole("region", { name: "작업 상세", exact: true })).toContainText("12번 좌석");
});

test("home entry points and unavailable floors remain accessible", async ({ page }) => {
  await page.goto("/map");
  const floorSelect = page.getByLabel("운영 층 선택");
  await floorSelect.selectOption("BUSAN_SOMA_19F");
  await expect(page.getByRole("heading", { name: "19층 지도 연결 전" })).toBeVisible();
  await expect(page.locator("button.facility-map-seat")).toHaveCount(0);
  await floorSelect.selectOption("BUSAN_SOMA_18F");
  await expect(page.locator("button.facility-map-seat")).toHaveCount(82);
  await expect(page.locator(".facility-plan-label", { hasText: "SPACE A1" })).toBeVisible();
  await expect(page.locator(".facility-zone-overlay, .facility-route-overlay")).toHaveCount(0);

  await page.getByLabel("알림", { exact: true }).click();
  await page.getByRole("menuitem", { name: /결과 검토/ }).click();
  await expect(page).toHaveURL(/\/missions\?filter=REVIEW$/);
  await expect(page.getByLabel("작업 상태", {exact:true})).toHaveValue("REVIEW");
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "홈", exact: true }).click();
  await page.getByLabel("알림", { exact: true }).click();
  await page.getByRole("menuitem", { name: /즉시 조치/ }).click();
  await expect(page).toHaveURL(/\/robots\?filter=attention$/);

  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "홈", exact: true }).click();
  await expect(page.getByRole("heading", { name: "운영 상태" })).toBeVisible();
});

test("production SPA routes and URL filters work on direct access", async ({ page }) => {
  await page.goto("/missions?phase=QUEUED");
  await expect(page.getByLabel("작업 상태", {exact:true})).toHaveValue("QUEUED");
  await page.goto("/results?filter=success");
  await expect(page.getByRole("heading", { level: 2, name: "작업" })).toBeVisible();
  await expect(page.getByLabel("작업 상태", {exact:true})).toHaveValue("SUCCESS");
  await page.goto("/robots");
  await expect(page.getByRole("heading", { level: 2, name: "로봇 관리" })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.getByText("저장됨")).toBeVisible();
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test("home panels fit " + viewport.width + " × " + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/map");
    await page.getByRole("button", { name: "12번 좌석 · 비어 있음" }).click();
    for (const selector of [".workspace-header", ".home-robot-panel", ".home-map-panel", ".seat-mission-panel", ".facility-map-legend"]) {
      // Opening panels animate into place; assert their settled geometry.
      await expect(async () => {
        const bounds = await page.locator(selector).boundingBox();
        expect(bounds, selector).not.toBeNull();
        expect(bounds!.x, selector).toBeGreaterThanOrEqual(0);
        expect(bounds!.y, selector).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height, selector).toBeLessThanOrEqual(viewport.height + 1);
        expect(bounds!.x + bounds!.width, selector).toBeLessThanOrEqual(viewport.width + 1);
      }).toPass({ timeout: 5_000 });
    }
  });
}
