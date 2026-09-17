import { expect, test } from "@playwright/test";

test("demo navigation loads example photos, blocks commands, and returns to live data", async ({ page }) => {
  const apiRequests: { method: string; path: string }[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) apiRequests.push({ method: request.method(), path });
  });

  await page.goto("/results?demo=1&filter=review");
  const banner = page.getByRole("status").filter({ hasText: "예시 데이터" });
  await expect(banner).toBeVisible();
  for (const label of ["작업 전", "작업 후"]) {
    const photo = page.getByRole("img", { name: label + " AI 생성 예시 사진" });
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }

  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  await navigation.getByRole("link", { name: "작업", exact: true }).click();
  await expect(page.getByRole("region", { name: "작업 요청 목록" }).getByRole("link")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "작업 취소 요청" })).toBeDisabled();
  await page.getByRole("button", { name: "새로고침", exact: true }).click();

  await navigation.getByRole("link", { name: "로봇", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "로봇 관리" })).toBeVisible();
  await page.reload();
  await expect(banner).toBeVisible();

  await navigation.getByRole("link", { name: "홈", exact: true }).click();
  await expect(page.locator("button.facility-map-seat")).toHaveCount(82);
  const fleet = page.getByRole("complementary", { name: "로봇 목록", exact: true });
  await expect(fleet.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: /^12번 좌석 ·/ }).click();
  await expect(page.getByRole("button", { name: "요청 보내기" })).toBeDisabled();
  expect(apiRequests).toEqual([]);

  const liveRobots = page.waitForResponse(response => new URL(response.url()).pathname === "/api/robots");
  await page.getByRole("button", { name: "실제 데이터로 돌아가기" }).click();
  expect((await liveRobots).ok()).toBe(true);
  await expect(banner).toHaveCount(0);
  await expect(fleet.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "12번 좌석 · 비어 있음", exact: true }).click();
  await expect(page.getByRole("button", { name: "요청 보내기" })).toBeEnabled();
  expect(apiRequests.length).toBeGreaterThan(0);
  expect(apiRequests.every(request => request.method === "GET")).toBe(true);
});
