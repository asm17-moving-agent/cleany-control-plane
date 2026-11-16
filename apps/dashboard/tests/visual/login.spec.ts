import { expect, test } from "@playwright/test";
import { capture, fixture } from "./fixture";

for (const mode of ["login", "password"] as const) {
  test(mode, async ({ page }, testInfo) => {
    await fixture(page, mode);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(mode === "login" ? "로그인" : "비밀번호 변경");
    await capture(page, testInfo, mode);
  });
}
test("login error", async ({ page }, testInfo) => {
  await fixture(page, "login"); await page.goto("/");
  await page.getByLabel("아이디", { exact: true }).fill("visual-user");
  await page.getByLabel("비밀번호", { exact: true }).fill("invalid-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await capture(page, testInfo, "login-error");
});
