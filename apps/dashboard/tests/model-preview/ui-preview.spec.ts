import { expect, test } from "@playwright/test";
import { fixture } from "../visual/fixture";

test("development gallery exposes the shared sizes and accessible form semantics", async ({ page }, testInfo) => {
  await fixture(page);
  await page.goto("/ui-preview?demo=1");
  for (const [name, height] of [["compact", "32px"], ["default", "40px"], ["large", "48px"]]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCSS("height", height);
  }
  const input = page.getByRole("textbox", { name: "이름", exact: true });
  await input.fill("Cleany"); await input.focus();
  await expect(input).toHaveCSS("outline-width", "2px");
  await expect(page.getByRole("textbox", { name: "오류", exact: true })).toHaveAccessibleDescription("입력 내용을 확인하세요.");
  await expect(page.getByRole("switch")).toHaveAccessibleName("실시간 표시");
  await page.getByRole("switch").click();
  await expect(page.getByRole("switch")).not.toBeChecked();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({path:testInfo.outputPath("ui-preview.png"),fullPage:true,animations:"disabled"});
});
