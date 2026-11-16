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
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const button of await page.locator(".workspace-header button, .workspace-header select").all()) {
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  }
});
