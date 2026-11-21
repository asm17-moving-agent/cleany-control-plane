import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const site = "BUSAN_SOMA_19F";
const endpoint = `/api/seat-layout?site_id=${site}`;
const desk = (page: Page, id = "seat-01") => page.locator(`.slam-seat[data-seat-id="${id}"]`);
const shape = (page: Page, id = "seat-01") => desk(page, id).locator("g[transform]");
const selected = (page: Page) => page.locator(".slam-seat.is-selected");
async function drag(page: Page, element: Locator, dx: number, dy: number) {
  const b = (await element.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}
async function edit(page: Page) {
  await page.getByRole("link", { name: "배치 편집", exact: true }).click();
  await expect(page.getByRole("heading", { name: "좌석 배치 편집", exact: true })).toBeVisible();
  await expect(page.locator(".slam-seat")).toHaveCount(82);
  await expect(page.locator(".slam-seat-layer text").filter({ hasText: /SPACE [AM]\d|D-HUB/i })).toHaveCount(0);
}
async function selectOne(page: Page, id = "seat-01") {
  await page.getByRole("combobox", { name: "좌석 선택", exact: true }).selectOption(id);
  await expect(selected(page)).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
  execFileSync("uv", ["run", "--project", "../backend", "python", "-m", "control_plane.admin", "--database", process.env.CLEANY_E2E_DATABASE!, "site-set-map", site, "slam-20261108"]);
  await page.goto("/map");
  await page.getByLabel("아이디", { exact: true }).fill("e2e-operator");
  await page.getByLabel("비밀번호", { exact: true }).fill("e2e-operator-password-2026");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("combobox", { name: "운영 층 선택" }).selectOption(site);
  await expect(page.locator(".slam-seat")).toHaveCount(82);
});

// Other scenarios use the server fixture's unconnected 19F. Do not leak map setup.
test.afterAll(() => {
  // The production map-registration CLI requires a real map bundle. Restore the
  // deliberately unconnected test fixture directly in this suite's isolated DB.
  execFileSync("python3", ["-c", "import sqlite3, sys\nwith sqlite3.connect(sys.argv[1]) as db: db.execute(\"UPDATE sites SET map_ref=? WHERE site_id=?\", (\"unconnected\", \"BUSAN_SOMA_19F\"))", process.env.CLEANY_E2E_DATABASE!]);
});

test("separate editor keeps panels outside the canvas and supports opacity and multiple selection", async ({ page }, info) => {
  await edit(page);
  for (const [width, height] of [[1920, 1080], [1366, 900], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    const canvas = (await page.getByRole("region", { name: "배치 지도" }).boundingBox())!;
    const properties = (await page.getByRole("complementary", { name: "좌석 속성" }).boundingBox())!;
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(properties.x + 1);
    expect(canvas.width).toBeGreaterThan(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`editor-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await desk(page).click();
  await expect(selected(page)).toHaveCount(6);
  await selectOne(page);
  const opacity = page.getByRole("slider", { name: "선택 좌석 불투명도" });
  await expect(opacity).toHaveValue("75");
  await expect(shape(page)).toHaveCSS("opacity", "0.75");
  await expect(shape(page, "seat-02")).toHaveCSS("opacity", "1");
  await expect(desk(page).locator(":scope > text")).toHaveCSS("opacity", "1");
  await opacity.press("Home");
  await expect(shape(page)).toHaveCSS("opacity", "0");
  await opacity.press("End");
  await expect(shape(page)).toHaveCSS("opacity", "1");
  await expect(page.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
  await page.getByLabel("묶음 선택", { exact: true }).uncheck();
  await desk(page, "seat-02").click({ modifiers: ["Shift"] });
  await expect(selected(page)).toHaveCount(2);
  await desk(page).click({ modifiers: ["Control"] });
  await expect(selected(page)).toHaveCount(1);
  const a = (await desk(page).boundingBox())!, b = (await desk(page, "seat-02").boundingBox())!;
  await page.mouse.move(a.x - 5, a.y - 5); await page.mouse.down();
  await page.mouse.move(b.x + b.width - 3, b.y + b.height * .6, { steps: 8 }); await page.mouse.up();
  await expect(selected(page)).toHaveCount(2);
  await expect(page.getByRole("group", { name: "좌석 정렬" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("editor-selection.png") });
});

test("direct gestures preserve geometry, snap, align, and undo as whole operations", async ({ page }, info) => {
  await edit(page);
  await selectOne(page);
  const before = await shape(page).getAttribute("transform");
  await drag(page, desk(page).locator(".slam-desk"), 63, 21);
  const moved = await shape(page).getAttribute("transform");
  expect(moved).not.toBe(before);
  // Default 10 cm grid in display axes, at map resolution 5 cm/pixel.
  const map = await (await page.request.get(`/api/map?site_id=${site}`)).json();
  const position = moved!.match(/translate\(([^ ]+) ([^)]+)\)/)!.slice(1).map(Number);
  for (const p of position) expect(p / (.1 / map.resolution)).toBeCloseTo(Math.round(p / (.1 / map.resolution)), 5);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(shape(page)).toHaveAttribute("transform", before!);
  await expect(page.getByRole("button", { name: "실행 취소", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  await expect(shape(page)).toHaveAttribute("transform", moved!);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await drag(page, page.getByRole("button", { name: "선택 좌석 회전", exact: true }).locator("circle"), 40, 30);
  expect(await shape(page).getAttribute("transform")).not.toBe(before);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(shape(page)).toHaveAttribute("transform", before!);
  await page.getByRole("button", { name: "복제", exact: true }).click();
  await expect(page.locator(".slam-seat")).toHaveCount(83);
  await expect(selected(page)).toHaveCount(1);
  await expect(page.getByLabel("좌석 번호", { exact: true })).toHaveValue("01 복사");
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.locator(".slam-seat")).toHaveCount(82);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(page.locator(".slam-seat")).toHaveCount(83);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(page.locator(".slam-seat")).toHaveCount(82);
  await selectOne(page);
  await page.getByLabel("묶음 선택", { exact: true }).uncheck();
  await desk(page, "seat-17").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "위쪽 정렬", exact: true }).click();
  const tops = await selected(page).locator(".slam-desk").evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
  expect(tops[0]).toBeCloseTo(tops[1], 4);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await selectOne(page);
  await expect(page.getByLabel("X (m)", { exact: true })).not.toBeVisible();
  await page.getByLabel("폭 (m)", { exact: true }).fill("1.3");
  await page.getByLabel("폭 (m)", { exact: true }).press("Enter");
  await expect(desk(page).locator(".slam-desk")).toHaveAttribute("height", String(1.3 / map.resolution));
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  const deskBeforeApproach = await shape(page).getAttribute("transform");
  await page.getByRole("button", { name: "접근점", exact: true }).click();
  const marker = page.getByRole("button", { name: "01번 접근점", exact: true }).locator("circle");
  const x = await marker.getAttribute("cx"), y = await marker.getAttribute("cy");
  await drag(page, marker, 25, 20);
  expect([await marker.getAttribute("cx"), await marker.getAttribute("cy")]).not.toEqual([x, y]);
  await expect(shape(page)).toHaveAttribute("transform", deskBeforeApproach!);
  const arrow = page.getByRole("button", { name: "01번 접근점", exact: true }).locator("path");
  const direction = await arrow.getAttribute("d");
  await drag(page, page.getByRole("button", { name: "01번 접근점 방향 조절", exact: true }).locator("circle"), 40, 30);
  expect(await arrow.getAttribute("d")).not.toBe(direction);
  await expect(shape(page)).toHaveAttribute("transform", deskBeforeApproach!);
  await page.screenshot({ path: info.outputPath("approach-editor.png") });
  await page.locator(".slam-seat-layer").focus();
  await page.keyboard.press("Control+z");
  await expect(arrow).toHaveAttribute("d", direction!);
  await page.keyboard.press("Control+z");
  await expect(marker).toHaveAttribute("cx", x!);
  await expect(marker).toHaveAttribute("cy", y!);
  await page.getByRole("button", { name: "복귀점", exact: true }).click();
  const canvas = (await page.locator(".facility-map-stage").boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * .7);
  await expect(page.locator('[data-marker-id="home"]')).toBeVisible();
});

test("save review retains drafts on failure and immediately updates the viewer with unverified targets", async ({ page }, info) => {
  const initial = (await (await page.request.get(endpoint)).json()).layout;
  const session = await (await page.request.get("/api/auth/me")).json();
  await edit(page);
  await selectOne(page);
  await page.getByLabel("폭 (m)", { exact: true }).fill("1.3");
  await page.getByLabel("폭 (m)", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "변경사항 확인" });
  await expect(modal).toContainText("1.2×0.77 → 1.3×0.77 m");
  await page.screenshot({ path: info.outputPath("save-review.png") });
  await page.route("**/api/seat-layout?*", route => route.request().method() === "PUT" ? route.fulfill({ status: 503, json: { detail: "테스트 저장 장애" } }) : route.continue());
  await modal.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(modal.getByRole("alert")).toContainText("테스트 저장 장애");
  expect((await (await page.request.get(endpoint)).json()).layout.revision).toBe(initial.revision);
  await page.unroute("**/api/seat-layout?*");
  try {
    await modal.getByRole("button", { name: "변경사항 저장" }).click();
    await expect(modal).not.toBeVisible();
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    const result = (await (await page.request.get(endpoint)).json()).layout;
    expect(result.revision).toBe(initial.revision + 1);
    expect(result.home_verified).toBe(false);
    expect(result.seats.every((s: { verification: string }) => s.verification === "draft")).toBe(true);
    const targets = await (await page.request.get(`/api/seat-layout/targets?site_id=${site}`)).json();
    expect(targets.validation_status).toBe("draft");
    await page.getByRole("button", { name: "편집 종료", exact: true }).click();
    await expect(page).toHaveURL(/\/map\?site=BUSAN_SOMA_19F$/);
    const map = await (await page.request.get(`/api/map?site_id=${site}`)).json();
    await expect(desk(page).locator(".slam-desk")).toHaveAttribute("height", String(1.3 / map.resolution));
    await expect(shape(page)).toHaveCSS("opacity", "1");
  } finally {
    // Restore only the isolated test DB, retaining optimistic revision control.
    const current = (await (await page.request.get(endpoint)).json()).layout;
    const restored = await page.request.put(endpoint, { headers: { "X-CSRF-Token": session.csrf_token, Origin: "http://127.0.0.1:18081" }, data: { ...initial, revision: current.revision } });
    expect(restored.ok(), await restored.text()).toBe(true);
  }
});

test("dirty drafts guard exit, browser back, tabs, facility changes and reload; discard reloads saved data", async ({ page }) => {
  await edit(page);
  await selectOne(page);
  await page.getByRole("button", { name: "오른쪽 15도 회전" }).click();
  const draft = await shape(page).getAttribute("transform");
  for (const trigger of [
    () => page.getByRole("button", { name: "편집 종료", exact: true }).click(),
    () => page.getByRole("link", { name: "작업", exact: true }).click(),
    () => page.evaluate(() => history.back()),
    () => page.getByRole("combobox", { name: "운영 층 선택" }).selectOption("BUSAN_SOMA_18F"),
  ]) {
    const dialog = page.waitForEvent("dialog");
    const action = trigger();
    await (await dialog).dismiss(); await action;
    await expect(page).toHaveURL(/\/map\/edit\?site=BUSAN_SOMA_19F$/);
    await expect(shape(page)).toHaveAttribute("transform", draft!);
    await expect(page.getByRole("combobox", { name: "운영 층 선택" })).toHaveValue(site);
  }
  const reloadDialog = page.waitForEvent("dialog");
  const reload = page.evaluate(() => location.reload());
  expect((await reloadDialog).type()).toBe("beforeunload");
  await (await reloadDialog).dismiss(); await reload;
  await expect(shape(page)).toHaveAttribute("transform", draft!);
  await page.getByRole("button", { name: "운영 메뉴", exact: true }).click();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("menuitem", { name: "로그아웃", exact: true }).click();
  await expect(shape(page)).toHaveAttribute("transform", draft!);
  await page.keyboard.press("Escape");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "변경 취소", exact: true }).click();
  await expect(page.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
  await expect(shape(page)).not.toHaveAttribute("transform", draft!);
  await selectOne(page);
  await page.getByRole("button", { name: "오른쪽 15도 회전" }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "편집 종료", exact: true }).click();
  await expect(page).toHaveURL(/\/map\?site=BUSAN_SOMA_19F$/);
  await expect(shape(page)).not.toHaveAttribute("transform", draft!);
  // Direct URL entry and reload remain authenticated and resolve the same facility.
  await page.goto(`/map/edit?site=${site}`);
  await expect(page.getByRole("heading", { name: "좌석 배치 편집", exact: true })).toBeVisible();
  await expect(page.locator(".slam-seat")).toHaveCount(82);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "운영 층 선택" })).toHaveValue(site);
  await selectOne(page);
  await page.getByRole("button", { name: "오른쪽 15도 회전" }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("combobox", { name: "운영 층 선택" }).selectOption("BUSAN_SOMA_18F");
  await expect(page.getByText("편집할 수 있는 실측 지도가 없습니다.")).toBeVisible();
  await expect(page.locator(".slam-seat")).toHaveCount(0);
});
