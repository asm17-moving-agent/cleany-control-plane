import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("facility preserves SLAM alignment with 82 draft seats", async ({ page }, testInfo) => {
  execFileSync("uv", ["run", "--project", "../backend", "python", "-m", "control_plane.admin", "--database", process.env.CLEANY_E2E_DATABASE!, "site-set-map", "BUSAN_SOMA_19F", "slam-20261108"]);
  await page.goto("/map");
  await page.getByLabel("아이디", { exact: true }).fill("e2e-operator");
  await page.getByLabel("비밀번호", { exact: true }).fill("e2e-operator-password-2026");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("combobox", { name: "운영 층 선택" }).selectOption("BUSAN_SOMA_19F");
  const image = page.getByRole("img", { name: "시설 도면" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 2286)).toBe(true);
  await expect(page.locator(".slam-seat")).toHaveCount(82);
  await expect(page.locator(".facility-map-robot")).toHaveCount(0);
  // A drag beginning on SVG seat text must not create a browser text selection,
  // even though seat pointer handlers stop propagation before map panning starts.
  await expect(page.locator(".slam-seat-layer text").filter({ hasText: /SPACE [AM]\d|D-HUB/i })).toHaveCount(0);
  const label = page.locator('.slam-seat[data-seat-id="seat-01"] text');
  const labelBox = (await label.boundingBox())!;
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.mouse.move(labelBox.x + 1, labelBox.y + labelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(labelBox.x + labelBox.width + 60, labelBox.y + labelBox.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  const request = page.getByRole("complementary", { name: "작업 요청 패널" });
  // Keep the rest of the map checks independent of whether the drag ended on a seat.
  if (await request.isVisible()) await request.getByRole("button", { name: "작업 요청 닫기" }).click();
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("slam-dashboard.png") });
  const canvas = page.locator(".slam-map-shell .facility-plan-canvas");
  const before = await canvas.getAttribute("style");
  const slider = page.getByRole("slider", { name: "도면과 SLAM 혼합 비율" });
  const raw = page.getByRole("img", { name: "SLAM 지도", exact: true });
  await expect(slider).toHaveValue("0");
  await expect(image).toHaveCSS("opacity", "1");
  await expect(raw).toHaveCSS("opacity", "0");
  await expect.poll(() => raw.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 2286)).toBe(true);
  await expect(canvas).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  // Compare the browser display against the served source: only unknown gray loses
  // alpha. Every opaque wall, obstacle and free-space pixel must remain identical.
  const pixels = await raw.evaluate(async (element: HTMLImageElement) => {
    const source = new Image();
    source.src = "/api/map/presentation/slam?site_id=BUSAN_SOMA_19F";
    await source.decode();
    const surface = document.createElement("canvas");
    surface.width = source.naturalWidth;
    surface.height = source.naturalHeight;
    const context = surface.getContext("2d")!;
    context.drawImage(source, 0, 0);
    const before = context.getImageData(0, 0, surface.width, surface.height).data;
    context.clearRect(0, 0, surface.width, surface.height);
    context.drawImage(element, 0, 0);
    const after = context.getImageData(0, 0, surface.width, surface.height).data;
    let removed = 0, remainingUnknown = 0, changedObserved = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (before[i] === 205 && before[i + 1] === 205 && before[i + 2] === 205) {
        removed++;
        if (after[i + 3] !== 0) remainingUnknown++;
      } else if (before[i + 3] === 255 && [0, 1, 2, 3].some(c => before[i + c] !== after[i + c])) {
        changedObserved++;
      }
    }
    // These source PNG samples are gray 205 at alpha 25, 174 and 18, on the
    // rotated outside edge. Canvas may quantize their RGB away from exactly 205.
    const outsideEdgeAlpha = [[51, 1150], [53, 1150], [51, 1151]]
      .map(([x, y]) => after[(y * surface.width + x) * 4 + 3]);
    return { removed, remainingUnknown, changedObserved, outsideEdgeAlpha };
  });
  expect(pixels.removed).toBeGreaterThan(1_000_000);
  expect(pixels.remainingUnknown).toBe(0);
  expect(pixels.changedObserved).toBe(0);
  expect(pixels.outsideEdgeAlpha).toEqual([0, 0, 0]);
  // Dragging the slider changes only background weights, never the map camera.
  const track = (await slider.boundingBox())!;
  await page.mouse.move(track.x + 4, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2, { steps: 8 });
  await page.mouse.up();
  const middle = Number(await slider.inputValue());
  expect(middle).toBeGreaterThanOrEqual(45);
  expect(middle).toBeLessThanOrEqual(55);
  expect(await canvas.getAttribute("style")).toBe(before);
  await expect(raw).toHaveCSS("opacity", String(middle / 100));
  await expect(image).toHaveCSS("opacity", String(1 - middle / 100));
  await expect(page.locator(".slam-seat-layer")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("slam-blend.png") });
  await page.reload();
  await expect(slider).toHaveValue(String(middle));
  await slider.press("End");
  await expect(slider).toHaveValue("100");
  await expect(image).toHaveCSS("opacity", "0");
  await expect(raw).toHaveCSS("opacity", "1");
  expect(await canvas.getAttribute("style")).toBe(before);
  await page.screenshot({ path: testInfo.outputPath("slam-original.png") });
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await expect(image).toHaveCSS("opacity", "1");
  expect(await canvas.getAttribute("style")).toBe(before);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: testInfo.outputPath("slam-dashboard-compact.png") });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("link", { name: "배치 편집", exact: true })).toHaveAttribute("href", "/map/edit?site=BUSAN_SOMA_19F");
  await expect(page.getByRole("button", { name: "좌석 배치 편집", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "접근점 보기", exact: true })).toHaveCount(0);

  // Synthetic pose proves the rendering transform, not physical localization.
  // Isolate this fixture from retained SSE poses left by the live transport test.
  // Real WebSocket -> SSE delivery remains covered by robot-pose.spec.ts.
  await page.addInitScript(() => {
    class AlignmentTestStream extends EventTarget {
      constructor() {
        super();
        queueMicrotask(() => this.dispatchEvent(new Event("open")));
      }
      close() {}
    }
    Object.defineProperty(window, "EventSource", { value: AlignmentTestStream });
  });
  const metadata = await (await page.request.get("/api/map?site_id=BUSAN_SOMA_19F")).json();
  let poseMapId = metadata.map_id;
  await page.route("**/api/robots?*", route => route.fulfill({ json: { items: [{
    robot_id: "cleany-01", state: "IDLE", active_mission_id: null, last_seen_at: null, control_mode: "mock",
  }] } }));
  await page.route("**/api/robots/cleany-01/pose?*", route => route.fulfill({ json: {
    stale: true, pose: { x: metadata.origin[0] + 300 * metadata.resolution,
      y: metadata.origin[1] + (metadata.height - 400) * metadata.resolution,
      yaw: 0, frame_id: "map", map_id: poseMapId, received_at: new Date().toISOString() },
  } }));
  await page.reload();
  const marker = page.locator(".facility-map-robot");
  await expect(marker).toBeVisible();
  const [a, b, c, d, e, f] = metadata.presentation.transform;
  const position = await marker.evaluate(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
  expect(position.x).toBeCloseTo(a * 300 + c * 400 + e, 2);
  expect(position.y).toBeCloseTo(b * 300 + d * 400 + f, 2);
  await expect(marker.locator("g")).toHaveAttribute("transform", `rotate(${metadata.presentation.rotation_degrees} 50 50)`);
  const markerBefore = await marker.getAttribute("style");
  const markerOpacityBefore = await marker.evaluate(el => getComputedStyle(el).opacity);
  await slider.press("End");
  await expect(marker).toHaveCSS("opacity", markerOpacityBefore);
  expect(await marker.getAttribute("style")).toBe(markerBefore);
  await page.screenshot({ path: testInfo.outputPath("synthetic-pose-alignment.png") });
  poseMapId = "a-different-map";
  await page.reload();
  await expect(page.getByText("지도 기준 로봇 위치 대기 중")).toBeVisible();
  await expect(marker).toHaveCount(0);
  // Existing bundles without edited layers still use their original rigid transform.
  const legacy = structuredClone(metadata);
  legacy.presentation.layers = null;
  await page.route("**/api/map?*", route => route.fulfill({ json: legacy }));
  await page.reload();
  await slider.press("Home");
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 573)).toBe(true);
  await expect(image).not.toHaveCSS("transform", "none");
  // A failed hidden layer remains reported after the other layer successfully loads.
  await page.route("**/api/map/image?*", route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "SLAM 이미지를 불러오지 못했습니다." })).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 573)).toBe(true);
  await page.unroute("**/api/map/image?*");
  legacy.presentation = null;
  await page.reload();
  await expect(slider).toHaveCount(0);
  await expect(raw).toHaveCSS("opacity", "1");
  await expect.poll(() => raw.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 573)).toBe(true);
});
