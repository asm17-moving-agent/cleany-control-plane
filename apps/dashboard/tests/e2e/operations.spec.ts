import { expect, test } from "@playwright/test";

test("operator can select a seat on the map and send a supported request", async ({ page }) => {
  await page.goto("/");
  const fleet = page.getByRole("complementary", { name: "로봇 현황" });
  await expect(fleet).toBeVisible();
  await expect(page.locator("button.facility-map-seat")).toHaveCount(48);
  await expect(page.getByRole("complementary", { name: "작업 요청 패널" })).toHaveCount(0);
  await page.getByRole("button", { name: "12번 좌석 · 비어 있음" }).click();
  const panel = page.getByRole("complementary", { name: "작업 요청 패널" });
  await expect(panel).toBeVisible();
  await expect(fleet).toBeVisible();
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  await panel.getByRole("radio", { name: "높음" }).check();
  const requestPromise = page.waitForRequest((request) => request.url().endsWith("/api/missions") && request.method() === "POST");
  await panel.getByRole("button", { name: "요청 보내기" }).click();
  const payload = (await requestPromise).postDataJSON();
  expect(payload).toEqual({
    target: { kind: "SEAT", reference_id: "seat-12", label: "D-HUB · 12번 좌석" },
    priority: "HIGH", requested_by: "scenario-operator", idempotency_key: expect.any(String),
  });
  await expect(panel.getByRole("button", { name: "대기열 등록 완료" })).toBeDisabled();
  await panel.getByRole("link", { name: "요청 현황 보기" }).click();
  await expect(page).toHaveURL(/\/missions\?mission=/);
  await expect(page.locator(".mission")).toContainText("12번 좌석");
});

test("home entry points and unavailable floors remain accessible", async ({ page }) => {
  await page.goto("/");
  const floorSelect = page.getByLabel("운영 층 선택");
  await floorSelect.selectOption("BUSAN_SOMA_19F");
  await expect(page.getByRole("heading", { name: "19층 지도 연결 전" })).toBeVisible();
  await expect(page.locator("button.facility-map-seat")).toHaveCount(0);
  await floorSelect.selectOption("BUSAN_SOMA_18F");
  await expect(page.locator("button.facility-map-seat")).toHaveCount(48);
  await expect(page.locator(".facility-plan-label", { hasText: "SPACE A1" })).toBeVisible();
  await expect(page.locator(".facility-zone-overlay, .facility-route-overlay")).toHaveCount(0);

  await page.getByRole("navigation", { name: "업무 요약" }).getByRole("link", { name: /결과 검토/ }).click();
  await expect(page).toHaveURL(/\/results\?filter=review$/);
  await expect(page.getByRole("link", { name: /검토 대상/ })).toHaveAttribute("aria-current", "page");
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "홈", exact: true }).click();
  await page.getByRole("navigation", { name: "업무 요약" }).getByRole("link", { name: /즉시 조치/ }).click();
  await expect(page).toHaveURL(/\/robots\?filter=attention$/);

  await page.getByLabel("운영 메뉴", { exact: true }).click();
  await page.getByRole("link", { name: "모니터링", exact: true }).click();
  await expect(page.getByRole("heading", { name: "연결 및 작업 상태" })).toBeVisible();
});

test("production SPA routes and URL filters work on direct access", async ({ page }) => {
  await page.goto("/missions?phase=QUEUED");
  await expect(page.getByLabel("단계", { exact: true })).toHaveValue("QUEUED");
  await page.goto("/results?filter=success");
  await expect(page.getByRole("heading", { level: 2, name: "작업 결과" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "결과 필터" }).getByRole("link", { name: /완료/ })).toHaveAttribute("aria-current", "page");
  await page.goto("/robots");
  await expect(page.getByRole("heading", { level: 2, name: "로봇 관리" })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.getByText("이 브라우저에 설정을 저장했습니다.")).toBeVisible();
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test("home panels fit " + viewport.width + " × " + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "12번 좌석 · 비어 있음" }).click();
    for (const selector of [".workspace-header", ".home-robot-panel", ".home-map-panel", ".seat-mission-panel", ".home-summary-strip"]) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });
}
