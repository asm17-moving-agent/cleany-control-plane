import { expect, test } from "@playwright/test";

test("operator can navigate, select a facility zone, and request a mission", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /안녕하세요, 운영자님/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /SPACE A1.*선택 가능/ })).toBeVisible();
  await expect(page.locator(".brand-mark img")).toHaveJSProperty("complete", true);

  const zone = page.getByRole("button", { name: /THE GROND.*선택 가능/ });
  await zone.click();
  await expect(zone).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("THE GROND", { exact: true }).last()).toBeVisible();

  await page.getByRole("button", { name: "Mission 요청" }).click();
  await expect(page.getByText("THE GROND 작업을 Queue에 등록했습니다.")).toBeVisible();
  await expect(page.getByText("THE GROND", { exact: true }).first()).toBeVisible();

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
