import { expect, test } from "@playwright/test";

test("WebSocket pose reaches the map through SSE and stale snapshots survive reload", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(`ws://${location.host}/api/robots/cleany-01/pose/ws`);
    const owner = window as unknown as { stopTestPose: () => void };
    socket.onerror = () => reject(new Error("test pose producer could not connect"));
    socket.onopen = () => {
      const send = () => socket.send(JSON.stringify({ x: -1.865, y: -4.705, yaw: Math.PI / 2 }));
      send();
      const timer = window.setInterval(send, 200);
      owner.stopTestPose = () => { clearInterval(timer); socket.close(); };
      resolve();
    };
  }));
  const marker = page.locator(".facility-map-robot");
  await expect(marker).toHaveAttribute("aria-label", /실시간 위치/);
  await expect(marker.locator(".facility-robot-bearing g")).toHaveAttribute("transform", "rotate(-90 50 50)");
  await expect(marker.locator("img")).toHaveCSS("transform", "none");
  await expect.poll(async () => marker.evaluate(element => parseFloat(element.style.left)))
    .toBeCloseTo(776 - 1.865 * 400 / 12.26, 2);
  await page.evaluate(() => (window as unknown as { stopTestPose: () => void }).stopTestPose());
  await expect(marker).toHaveClass(/is-stale/);
  await page.reload();
  await expect(marker).toHaveClass(/is-stale/);
  await expect(page.locator(".home-telemetry-status")).toContainText("SSE 연결됨 · 위치 지연");
  await expect(marker.locator(".facility-robot-bearing g")).toHaveAttribute("transform", "rotate(-90 50 50)");
  await expect.poll(async () => marker.evaluate(element => parseFloat(element.style.top)))
    .toBeCloseTo(8 + (5.47 + 4.705) * 400 / 12.26, 2);
});

test("recording and demo modes stay isolated from live telemetry", async ({ page }) => {
  const commands: string[] = [];
  const liveConnections: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().includes("/api/missions")) commands.push(request.url());
    if (/\/api\/(events\/stream|robots\/cleany-01\/pose)/.test(request.url())) liveConnections.push(request.url());
  });
  await page.goto("/?recording=1");
  const marker = page.locator(".facility-map-robot");
  await expect(marker).toHaveAttribute("aria-label", /예시 위치/);
  const before = await marker.getAttribute("style");
  await page.locator('.facility-map-seat[data-seat-id="seat-12"]').click();
  await page.getByRole("button", { name: "요청 보내기", exact: true }).click();
  await expect.poll(() => marker.getAttribute("style")).not.toBe(before);
  await expect(page.locator(".facility-movement-path")).toBeVisible();
  await expect(page.locator(".home-telemetry-status")).toContainText("촬영용 이동");
  expect(commands).toEqual([]);
  expect(liveConnections).toEqual([]);
  await page.goto("/?demo=1&recording=0");
  await expect(page.locator(".facility-map-robot")).toHaveCount(3);
  await expect(page.locator(".home-telemetry-status")).toContainText("예시 위치");
  expect(liveConnections).toEqual([]);
});
