import { expect, test } from "@playwright/test";
import { fixture } from "./fixture";

test("navigation and primary content stay inside supported viewports", async ({ page }) => {
  await fixture(page);
  for (const path of ["/", "/map", "/missions", "/results", "/robots", "/monitoring", "/settings"]) {
    await page.goto(path + "?demo=1");
    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
    if (path === "/missions" || path === "/results") {
      await expect(page.locator('.task-detail-heading')).toBeVisible();
      for (const panel of await page.locator('.task-calendar-surface, .task-day-summary, .task-list-panel, .task-detail-panel').all()) {
        // The larger distribution shares the existing sidebar scroll with the calendar.
        await panel.scrollIntoViewIfNeeded();
        const box = await panel.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      }
      const footer = await page.locator('.task-detail-footer').boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
    if (path === "/" || path === "/monitoring") {
      await expect(page.locator(".cafe-seat-grid > span")).toHaveCount(82);
      await expect(page.locator(".cafe-home .recharts-surface")).toHaveCount(3);
      for (const card of await page.locator(".cafe-card, .cafe-operation").all()) {
        const box = await card.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      }
    }
    if (path === "/map") {
      const map = page.locator(".facility-map-shell");
      const initial = (await map.boundingBox())!;
      const frame = (await page.locator(".home-workspace-body").boundingBox())!;
      expect(initial.x).toBe(frame.x);
      expect(initial.width).toBe(frame.width);
      await page.getByRole("button", {name: /^12번 좌석 ·/}).click();
      const request = page.getByRole("complementary", {name: "작업 요청 패널"});
      await expect(request).toBeVisible();
      await expect(page.locator(".home-request-drawer")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
      expect(await map.boundingBox()).toEqual(initial);
      const panel = (await request.boundingBox())!;
      expect(panel.x).toBeGreaterThan(initial.x);
      expect(panel.x + panel.width).toBeLessThanOrEqual(initial.x + initial.width);
      expect(panel.y + panel.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      const submit = (await request.getByRole("button", {name: "요청 보내기"}).boundingBox())!;
      expect(submit.y + submit.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await page.getByRole("button", {name: "cleany-01 상세 열기"}).click();
      await expect(page.getByRole("complementary", {name: "로봇 상세", exact: true})).toBeVisible();
      await expect(request).not.toBeVisible();
      expect(await map.boundingBox()).toEqual(initial);
      await page.getByRole("button", {name: "로봇 목록", exact: true}).click();
      await expect(page.getByRole("complementary", {name: "로봇 목록", exact: true})).toBeVisible();
      expect(await map.boundingBox()).toEqual(initial);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const button of await page.locator(".workspace-header button, .workspace-header select").all()) {
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  }
});
