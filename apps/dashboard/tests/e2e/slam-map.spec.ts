import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("facility preserves SLAM alignment with 82 draft seats", async ({ page }, testInfo) => {
  execFileSync("uv", ["run", "--project", "../backend", "python", "-m", "control_plane.admin", "--database", process.env.CLEANY_E2E_DATABASE!, "site-set-map", "BUSAN_SOMA_19F", "slam-20261108"]);
  await page.goto("/map");
  await page.getByLabel("아이디", { exact: true }).fill("e2e-operator");
  await page.getByLabel("비밀번호", { exact: true }).fill("e2e-operator-password-2026");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("combobox", { name: "운영 층 선택" }).selectOption("BUSAN_SOMA_19F");
  const image = page.getByRole("img", { name: "실측 SLAM 기반 운영 지도" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 573)).toBe(true);
  await expect(page.locator(".slam-seat")).toHaveCount(82);
  await expect(page.locator(".facility-map-robot")).toHaveCount(0);
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("slam-dashboard.png") });
  const canvas = page.locator(".slam-map-shell .facility-plan-canvas");
  const before = await canvas.getAttribute("style");
  await page.getByRole("button", { name: "SLAM 원본", exact: true }).click();
  const raw = page.getByRole("img", { name: "SLAM으로 작성한 실측 점유 지도" });
  await expect.poll(() => raw.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 573)).toBe(true);
  expect(await canvas.getAttribute("style")).toBe(before);
  await page.screenshot({ path: testInfo.outputPath("slam-original.png") });
  await page.getByRole("button", { name: "운영 지도", exact: true }).click();
  await expect(image).toBeVisible();
  expect(await canvas.getAttribute("style")).toBe(before);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: testInfo.outputPath("slam-dashboard-compact.png") });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "좌석 배치 편집", exact: true }).click();
  await page.getByLabel("좌석 선택", { exact: true }).selectOption("seat-01");
  const selectedMarker = page.locator('[data-seat-id="seat-01"]');
  const beforeDrag = await selectedMarker.locator('g').getAttribute('transform');
  const neighbor = page.locator('[data-seat-id="seat-02"] g');
  const beforeNeighbor = await neighbor.getAttribute('transform');
  const unrelated = await page.locator('[data-seat-id="seat-04"] g').getAttribute('transform');
  const box = (await selectedMarker.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 12, { steps: 4 }); await page.mouse.up();
  expect(await selectedMarker.locator('g').getAttribute('transform')).not.toBe(beforeDrag);
  expect(await neighbor.getAttribute('transform')).not.toBe(beforeNeighbor);
  expect(await page.locator('[data-seat-id="seat-04"] g').getAttribute('transform')).toBe(unrelated);
  await page.getByRole('button', { name: '되돌리기', exact: true }).click();
  expect(await selectedMarker.locator('g').getAttribute('transform')).toBe(beforeDrag);
  await page.getByRole('button', { name: '책상 묶음 복제', exact: true }).click();
  await expect(page.locator('.slam-seat')).toHaveCount(88);
  await page.getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect(page.locator('.slam-seat')).toHaveCount(82);
  await page.getByRole('button', { name: '좌석 추가', exact: true }).click();
  await expect(page.locator('.slam-seat')).toHaveCount(83);
  await page.getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect(page.locator('.slam-seat')).toHaveCount(82);
  await page.getByLabel('좌석 선택', { exact: true }).selectOption('seat-01');
  const originalX = await page.getByLabel("책상 X (m)", { exact: true }).inputValue();
  await page.getByLabel("책상 X (m)", { exact: true }).fill(String(Number(originalX) + 0.15));
  await page.getByLabel("책상 X (m)", { exact: true }).blur();
  await expect(page.getByRole("button", { name: "배치 저장", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "배치 저장", exact: true }).click();
  await expect(page.getByText(/저장 완료 · 현장 검증 대기/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("seat-editor.png") });
  await page.reload();
  await expect(page.locator(".slam-seat")).toHaveCount(82);
  await page.getByRole("button", { name: "좌석 배치 편집", exact: true }).click();
  await page.getByLabel("좌석 선택", { exact: true }).selectOption("seat-01");
  expect(Number(await page.getByLabel("책상 X (m)", { exact: true }).inputValue())).toBeCloseTo(Number(originalX) + 0.15, 2);
  // Restore the initial geometry after proving persistence; revisions remain monotonic.
  await page.getByLabel("책상 X (m)", { exact: true }).fill(originalX);
  await page.getByLabel("책상 X (m)", { exact: true }).blur();
  await page.getByRole("button", { name: "배치 저장", exact: true }).click();
  await expect(page.getByText(/저장 완료 · 현장 검증 대기/)).toBeVisible();
  await page.getByRole("button", { name: "편집 닫기", exact: true }).click();

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
  await page.getByRole("button", { name: "SLAM 원본", exact: true }).click();
  expect(await marker.getAttribute("style")).toBe(markerBefore);
  await page.screenshot({ path: testInfo.outputPath("synthetic-pose-alignment.png") });
  poseMapId = "a-different-map";
  await page.reload();
  await expect(page.getByText("지도 기준 로봇 위치 대기 중")).toBeVisible();
  await expect(marker).toHaveCount(0);
});
