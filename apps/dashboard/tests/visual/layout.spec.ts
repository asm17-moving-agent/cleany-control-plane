import { expect, test } from "@playwright/test";
import { fixture } from "./fixture";

test("navigation and primary content stay inside supported viewports", async ({ page }) => {
  await fixture(page);
  for (const path of ["/", "/map", "/missions", "/results", "/robots", "/monitoring", "/settings"]) {
    await page.goto(path + "?demo=1");
    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
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
