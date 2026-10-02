import { test as base, expect } from "@playwright/test";
export { expect };
export const test = base.extend<{ signedIn: void }>({
  signedIn: [async ({ page, baseURL }, use) => {
    const response = await page.request.post("/api/auth/login", {
      headers: { Origin: baseURL! }, data: { login_id: "e2e-operator", password: "e2e-operator-password-2026" },
    });
    expect(response.ok()).toBeTruthy();
    await use();
  }, { auto: true }],
});
