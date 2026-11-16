import { expect, test } from "@playwright/test";
import { fixture } from "./fixture";

test("navigation and primary content stay inside supported viewports", async ({ page }) => {
  await fixture(page);
  for (const path of ["/", "/missions", "/results", "/robots", "/monitoring", "/settings"]) {
    await page.goto(path + "?demo=1");
    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const button of await page.locator(".workspace-header button, .workspace-header select").all()) {
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  }
});
