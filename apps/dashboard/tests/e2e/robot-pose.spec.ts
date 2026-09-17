import { expect, test } from "@playwright/test";

test("WebSocket pose reaches the map through SSE and stale snapshots survive reload", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(`ws://${location.host}/api/robots/cleany-01/pose/ws`);
    const owner = window as unknown as { stopTestPose: () => void };
    socket.onerror = () => reject(new Error("test pose producer could not connect"));
    socket.onopen = () => {
      const send = () => socket.send(JSON.stringify({ x: -1.865, y: -4.705 }));
      send();
      const timer = window.setInterval(send, 200);
      owner.stopTestPose = () => { clearInterval(timer); socket.close(); };
      resolve();
    };
  }));
  const marker = page.locator(".facility-map-robot");
  await expect(marker).toHaveAttribute("aria-label", /실시간 위치/);
  await expect.poll(async () => marker.evaluate(element => parseFloat(element.style.left)))
    .toBeCloseTo(776 - 1.865 * 400 / 12.26, 2);
  await page.evaluate(() => (window as unknown as { stopTestPose: () => void }).stopTestPose());
  await expect(marker).toHaveClass(/is-stale/);
  await page.reload();
  await expect(marker).toHaveClass(/is-stale/);
  await expect(page.locator(".home-telemetry-status")).toContainText("SSE 연결됨 · 위치 지연");
  await expect.poll(async () => marker.evaluate(element => parseFloat(element.style.top)))
    .toBeCloseTo(8 + (5.47 + 4.705) * 400 / 12.26, 2);
});
