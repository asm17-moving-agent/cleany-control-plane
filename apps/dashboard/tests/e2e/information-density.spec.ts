import { expect, test } from "./support/auth";
import { operationsDemo } from "../../src/operations/operations-demo";

test("page headers are compact and the map keeps its viewport geometry", async ({ page }) => {
  for (const route of ["/missions", "/results", "/robots", "/monitoring", "/settings"]) {
    await page.goto(route + "?demo=1");
    const header = page.locator(".ui-page-header");
    await expect(header).toHaveCSS("height", "72px");
    await expect(header.locator("p")).toHaveCount(0);
  }
  await page.goto("/map?demo=1");
  // The occupancy chart may grow beyond the map header's existing minimum.
  await expect(page.locator(".home-map-header")).toHaveCSS("min-height", "96px");
  await expect(page.locator("button.facility-map-seat")).toHaveCount(82);
  await expect(page.getByText("좌석을 선택해 작업을 요청하세요")).toHaveCount(0);
  await expect(page.locator(".workspace-demo-banner")).toContainText("실제 명령 미전송");
});

test("retrieval errors remain distinct from an empty queue and can be retried", async ({ page }) => {
  let failed = true;
  await page.route("**/api/missions?*", route => route.fulfill(failed
    ? { status: 503, json: { detail: "fixture unavailable" } }
    : { json: { items: [] } }));
  await page.goto("/missions");
  const error = page.getByRole("alert");
  await expect(error).toContainText("작업 목록을 불러올 수 없음");
  await expect(page.getByRole("heading", { name: "작업 요청 없음" })).toHaveCount(0);
  failed = false;
  await error.getByRole("button", { name: "다시 시도" }).click();
  await expect(error).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "작업 요청 없음" })).toBeVisible();
});

test("result metadata folds without hiding failures, unfinished work or execution provenance", async ({ page }) => {
  const result = { ...operationsDemo.missions.find(mission => mission.outcome === "HUMAN_REVIEW_REQUIRED")!,
    before_observation: null, after_observation: null,
    execution_profile: { navigation: "real", perception: "mock", planning: "mock", execution: "mock" },
    failure_code: "OBJECT_REMAINING", skipped_tasks: ["수첩 정리"], needs_human_review: true,
  };
  await page.route("**/api/missions?*", route => route.fulfill({ json: { items: [result] } }));
  await page.goto("/results?mission=" + result.mission_id);
  const detail = page.getByRole("region", { name: "작업 상세", exact: true });
  await expect(detail.getByText("실제 로봇 · 작업 모의 실행")).toBeVisible();
  await expect(detail.getByText("OBJECT_REMAINING")).toBeVisible();
  await expect(detail.getByText("수첩 정리")).toBeVisible();
  await expect(detail.getByRole("definition").filter({ hasText: "사람 확인 필요" })).toBeVisible();
  await expect(detail.getByText("자료 없음", { exact: true })).toHaveCount(2);
  await expect(detail.getByText("요청 ID", { exact: true })).not.toBeVisible();
  await detail.getByText("상세 정보", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(detail.getByText(result.mission_id, { exact: true })).toBeVisible();
  await page.reload();
  await expect(detail.getByText("열람만으로 검토 완료되지 않습니다.")).toBeVisible();
});

test("manual help does not send commands and blocking and stop confirmation stay visible", async ({ page }) => {
  const commands: unknown[] = [];
  const state = { configured: true, available: true, connected: true, ready: true, phase: "idle",
    mock: true, blocked_reason: "정비 중 · 조종 불가" as string | null, message: "모의 서버",
    stop_confirmed: false, web_max_velocity: 2, velocity: [0, 0, 0, 0] };
  await page.route("**/api/robots/cleany-01/manual/status?*", route => route.fulfill({ json: state }));
  await page.route("**/api/robots/cleany-01/manual/control?*", route => {
    commands.push(route.request().postDataJSON()); return route.fulfill({ json: state });
  });
  await page.goto("/robots");
  const panel = page.getByRole("region", { name: "수동 조종", exact: true });
  await expect(panel.getByText(state.blocked_reason!)).toBeVisible();
  await expect(panel.getByRole("application", { name: "이동 조이스틱" })).toHaveAttribute("aria-disabled", "true");
  await expect(panel.locator(".manual-stop-status")).toContainText("미확인");
  state.blocked_reason = null;
  await expect(panel.getByRole("application", { name: "이동 조이스틱" })).toHaveAttribute("aria-disabled", "false");
  const help = panel.getByText("조작 도움말", { exact: true });
  await help.focus(); await page.keyboard.press("Space");
  await expect(panel.getByText("방향키 이동 · A/D 회전 · Space / Esc 정지 요청")).toBeVisible();
  expect(commands).toHaveLength(0);
  state.stop_confirmed = true;
  await expect(panel.locator(".manual-stop-status")).toContainText("모의 확인");
  await expect(panel.getByText("입력 종료 시 정지 요청 · 물리 비상정지 아님")).toBeVisible();
});
