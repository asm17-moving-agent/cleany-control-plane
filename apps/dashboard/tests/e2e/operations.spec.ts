import { expect, test } from "@playwright/test";

test("operator can navigate, select a seat, and request a mission", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "로봇 관제 시나리오" })).toBeVisible();
  await expect(page.getByRole("button", { name: /번 좌석/ })).toHaveCount(48);
  await expect(page.locator(".brand-mark img")).toHaveJSProperty("complete", true);

  const seat = page.getByRole("button", { name: /18번 좌석/ });
  await seat.click();
  await expect(seat).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("B-3", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mission 요청" }).click();
  await expect(page.getByText("Mission을 Queue에 등록했습니다.")).toBeVisible();
  await expect(page.getByText("18번 좌석", { exact: true }).first()).toBeVisible();

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
