import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Mission, MissionPhase, MissionOutcome, Robot } from "../../src/api/types";

async function missionApi(page: Page) {
  let mission: Mission | null = null;
  let robots: Robot[] = [
    { robot_id: "cleany-01", state: "BUSY", active_mission_id: "other-request", last_seen_at: "2026-09-09T00:00:00Z" },
    { robot_id: "cleany-02", state: "IDLE", active_mission_id: null, last_seen_at: "2026-09-09T00:00:00Z" },
  ];
  await page.addInitScript(() => {
    class MissionTestStream extends EventTarget {
      constructor() {
        super();
        (window as unknown as { missionTestStream: EventTarget }).missionTestStream = this;
        queueMicrotask(() => this.dispatchEvent(new Event("open")));
      }
      close() {}
    }
    Object.defineProperty(window, "EventSource", { value: MissionTestStream });
  });
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/missions" && route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      mission = {
        ...input, mission_id: "new-request", phase: "QUEUED", outcome: null, seat_id: input.target.reference_id,
        created_at: "2026-09-09T00:00:00Z", sequence: 0, message: "", cancel_requested: false,
        before_observation: null, after_observation: null,
      };
      return route.fulfill({ status: 201, json: mission });
    }
    const items = path === "/api/robots" ? robots : path === "/api/missions" ? mission ? [mission] : []
      : path === "/api/seats" ? [{ seat_id: "seat-12", label: "12", zone_id: "d-hub", row: 2, grid_column: 5, occupancy: "AVAILABLE", occupant_name: null }] : [];
    return route.fulfill({ json: { items } });
  });
  return async (phase: MissionPhase, outcome: MissionOutcome | null = null) => {
    mission = { ...mission!, phase, outcome, sequence: mission!.sequence + 1 };
    robots = robots.map(robot => robot.robot_id === "cleany-02" ? { ...robot, state: phase === "TERMINAL" ? "IDLE" : "BUSY", active_mission_id: phase === "TERMINAL" ? null : mission!.mission_id } : robot);
    await page.evaluate(payload => {
      (window as unknown as { missionTestStream: EventTarget }).missionTestStream.dispatchEvent(new MessageEvent("update", {
        data: JSON.stringify({ schema_version: 1, event_id: "test-event-" + payload.sequence, event_type: "mission.status_changed", robot_id: "cleany-02", mission_id: payload.mission_id, sequence: payload.sequence, occurred_at: "2026-09-09T00:00:00Z", payload }),
      }));
    }, mission);
  };
}

async function submitSeat(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "12번 좌석 · 비어 있음" }).click();
  const request = page.getByRole("complementary", { name: "작업 요청 패널" });
  await request.getByRole("button", { name: "요청 보내기" }).click();
  await expect(request.getByRole("button", { name: "대기열 등록 완료" })).toBeDisabled();
  return request;
}

test("seat submission opens the assigned robot and advances five connected stages from API updates", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const advance = await missionApi(page);
  const request = await submitSeat(page);
  const panel = page.getByRole("complementary", { name: "로봇 상세", exact: true });
  await expect(panel).toHaveCount(0);
  await advance("OFFERED");
  await expect(panel.getByRole("heading", { name: "cleany-02" })).toBeVisible();
  await expect(request).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "로봇 상세", exact: true })).toBeFocused();
  await expect(panel.getByRole("heading", { name: "현재 위치" })).toHaveCount(0);
  const steps = panel.getByRole("list", { name: "작업 단계" }).getByRole("listitem");
  for (const [phase, current] of [["ACCEPTED", 0], ["NAVIGATING", 1], ["WORKING", 2], ["RETURNING", 3]] as const) {
    await advance(phase);
    await expect(steps.nth(current)).toHaveAttribute("aria-current", "step");
    for (let index = 0; index < 5; index++) await expect(steps.nth(index)).toHaveAttribute("data-state", index < current ? "done" : index === current ? "current" : "pending");
    if (phase === "WORKING") {
      await expect(steps.nth(0).locator(".mission-step-dot")).toHaveCSS("background-color", "rgb(57, 125, 104)");
      await page.waitForTimeout(700);
      await expect(steps.nth(current)).toHaveAttribute("aria-current", "step");
      await page.screenshot({ path: test.info().outputPath("working.png") });
    }
  }
  await advance("TERMINAL", "SUCCESS");
  await expect(panel.locator(".mission-step-status")).toHaveText("완료");
  await expect(panel.locator(".mission-step-progress li[data-state=done]")).toHaveCount(5);
  await expect(panel.getByText("현재 할당된 작업이 없습니다.")).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "작업 상세 보기" })).toHaveAttribute("href", "/missions?mission=new-request");
});

test("closing the queued request cancels its automatic panel switch", async ({ page }) => {
  const advance = await missionApi(page);
  const request = await submitSeat(page);
  await request.getByRole("button", { name: "작업 요청 닫기" }).click();
  await advance("NAVIGATING");
  await expect(page.getByRole("complementary", { name: "로봇 목록", exact: true }).getByText("D-HUB · 12번 좌석")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "로봇 상세", exact: true })).toHaveCount(0);
});

test("a cancelled mission remains visible without a successful completion marker", async ({ page }) => {
  const advance = await missionApi(page);
  await submitSeat(page);
  await advance("WORKING");
  const panel = page.getByRole("complementary", { name: "로봇 상세", exact: true });
  await expect(panel.locator(".mission-step-status")).toHaveText("정리 작업 중");
  await advance("TERMINAL", "CANCELLED");
  await expect(panel.locator(".mission-step-status")).toHaveText("취소");
  await expect(panel.locator(".mission-step-progress li[data-state=done]")).toHaveCount(0);
  await expect(panel.locator(".mission-step-progress li[data-state=stopped]")).toHaveCount(1);
});
