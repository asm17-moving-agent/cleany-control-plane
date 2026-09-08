// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Mission } from "../api/types";
import { useOperations } from "../operations/OperationsContext";
import { HomePage } from "./HomePage";

const { readOperations, createMission } = vi.hoisted(() => ({ readOperations: vi.fn(), createMission: vi.fn() }));
vi.mock("../operations/OperationsContext", () => ({ useOperations: readOperations }));
vi.mock("../settings/SettingsContext", () => ({ useSettings: () => ({ settings: { defaultPriority: "NORMAL" } }) }));
vi.mock("../components/RobotModel", () => ({ RobotModel: () => <figure aria-label="Cleany 외형 미리보기" /> }));
let data: ReturnType<typeof useOperations>;
const request: Mission = {
  mission_id: "requested-mission", phase: "QUEUED", outcome: null, priority: "NORMAL",
  target: { kind: "SEAT", reference_id: "seat-12", label: "12번 좌석" }, seat_id: "seat-12",
  requested_by: "operator", idempotency_key: "test-request", created_at: "2026-09-09T00:00:00Z",
  message: "", cancel_requested: false, sequence: 0, before_observation: null, after_observation: null,
};
function View() {
  return <MemoryRouter><Routes><Route element={<Outlet context={{ floor: { id: "BUSAN_SOMA_18F", label: "18층", mapAvailable: true } }} />}><Route index element={<HomePage />} /></Route></Routes></MemoryRouter>;
}
async function submit() {
  fireEvent.click(screen.getByRole("button", { name: "12번 좌석 · 비어 있음" }));
  fireEvent.click(screen.getByRole("button", { name: "요청 보내기" }));
  await screen.findByRole("button", { name: "대기열 등록 완료" });
}
beforeEach(() => {
  createMission.mockReset().mockResolvedValue(request);
  data = {
    robots: [
      { robot_id: "cleany-01", state: "BUSY", active_mission_id: "another-mission", last_seen_at: "2026-09-09T00:00:00Z" },
      { robot_id: "cleany-02", state: "IDLE", active_mission_id: null, last_seen_at: "2026-09-09T00:00:00Z" },
    ],
    robot: null, seats: [{ seat_id: "seat-12", label: "12", zone_id: "d-hub", row: 2, grid_column: 5, occupancy: "AVAILABLE", occupant_name: null }],
    missions: [], events: [], isLoading: false, error: null, isCreatingMission: false,
    connectionState: "connected", createMission, refresh: vi.fn(), cancelMission: vi.fn(),
  };
  readOperations.mockImplementation(() => data);
});
afterEach(cleanup);

it("waits for the requested assignment, opens its robot and retains the completed progress", async () => {
  const view = render(<View />);
  await submit();
  expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
  data.missions = [{ ...request, phase: "NAVIGATING" }];
  data.robots = data.robots.map(robot => robot.robot_id === "cleany-02" ? { ...robot, state: "BUSY", active_mission_id: request.mission_id } : robot);
  view.rerender(<View />);
  const panel = await screen.findByRole("complementary", { name: "로봇 상세" });
  expect(within(panel).getByRole("heading", { name: "cleany-02" })).toBeVisible();
  expect(within(panel).queryByRole("heading", { name: "현재 위치" })).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: "작업 요청 패널" })).not.toBeInTheDocument();
  expect(within(panel).getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
  data.missions = [{ ...request, phase: "WORKING" }];
  view.rerender(<View />);
  expect(within(panel).getAllByRole("listitem")[2]).toHaveAttribute("aria-current", "step");
  data.missions = [{ ...request, phase: "TERMINAL", outcome: "SUCCESS" }];
  data.robots = data.robots.map(robot => robot.robot_id === "cleany-02" ? { ...robot, state: "IDLE", active_mission_id: null } : robot);
  view.rerender(<View />);
  expect(within(panel).getAllByRole("listitem").every(step => step.dataset.state === "done")).toBe(true);
  expect(within(panel).queryByText("현재 할당된 작업이 없습니다.")).not.toBeInTheDocument();
});

it("does not reopen a queued request after the operator closes its panel", async () => {
  const view = render(<View />);
  await submit();
  fireEvent.click(screen.getByRole("button", { name: "작업 요청 닫기" }));
  data.missions = [{ ...request, phase: "ACCEPTED" }];
  data.robots = data.robots.map(robot => ({ ...robot, active_mission_id: request.mission_id }));
  view.rerender(<View />);
  expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
});

it("uses an observed assignment if a short mission finishes between refreshes", async () => {
  const view = render(<View />);
  await submit();
  data.missions = [{ ...request, phase: "TERMINAL", outcome: "SUCCESS" }];
  data.events = [{
    schema_version: 1, event_id: "assignment-event", event_type: "robot.state_changed", robot_id: "cleany-02",
    mission_id: null, sequence: 0, occurred_at: "2026-09-09T00:00:00Z", payload: { active_mission_id: request.mission_id },
  }];
  view.rerender(<View />);
  const panel = await screen.findByRole("complementary", { name: "로봇 상세" });
  expect(within(panel).getByRole("heading", { name: "cleany-02" })).toBeVisible();
  expect(within(panel).getAllByRole("listitem").every(step => step.dataset.state === "done")).toBe(true);
});

it("keeps a failed submission in the request panel", async () => {
  createMission.mockRejectedValue(new Error("요청 오류"));
  render(<View />);
  fireEvent.click(screen.getByRole("button", { name: "12번 좌석 · 비어 있음" }));
  fireEvent.click(screen.getByRole("button", { name: "요청 보내기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("요청 오류");
  expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
});
