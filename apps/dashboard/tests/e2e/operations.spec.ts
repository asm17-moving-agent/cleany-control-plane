import { expect, test } from "@playwright/test";

test("operator can inspect the facility overview and dashboard pages", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "부산 소마 센터 18층" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "로봇 현황" })).toBeVisible();
  const floorSelect = page.getByLabel("운영 층 선택");
  await expect(floorSelect).toHaveValue("BUSAN_SOMA_18F");
  await expect(page.getByText("Cleany D1")).toBeVisible();
  await expect(page.getByText("자동 운행")).toBeVisible();
  await floorSelect.selectOption("BUSAN_SOMA_19F");
  await expect(page.getByRole("heading", { level: 1, name: "부산 소마 센터 19층" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "19층 지도 연결 전" })).toBeVisible();
  await page.getByRole("button", { name: "18층 지도 보기" }).click();
  await expect(floorSelect).toHaveValue("BUSAN_SOMA_18F");
  await expect(page.locator(".facility-plan-label", { hasText: "SPACE A1" })).toBeVisible();
  await expect(page.locator(".facility-zone-overlay")).toHaveCount(0);
  await expect(page.locator(".brand-mark img")).toHaveJSProperty("complete", true);

  await page.getByRole("link", { name: "미션" }).click();
  await expect(page).toHaveURL(/\/missions$/);
  await expect(page.getByRole("heading", { name: "전체 미션" })).toBeVisible();

  await page.getByRole("link", { name: "모니터링" }).click();
  await expect(page).toHaveURL(/\/monitoring$/);
  await expect(page.getByRole("heading", { name: "연결 및 작업 상태" })).toBeVisible();
});

test("direct route access is handled by the production SPA fallback", async ({ page }) => {
  await page.goto("/robots");
  await expect(page.getByRole("heading", { level: 1, name: "로봇 관리" })).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "관제 설정" })).toBeVisible();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.getByText("이 브라우저에 설정을 저장했습니다.")).toBeVisible();
});
