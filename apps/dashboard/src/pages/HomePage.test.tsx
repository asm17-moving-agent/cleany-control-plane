// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { afterEach, it, expect, vi } from "vitest";
import { HomePage } from "./HomePage";
vi.mock("../operations/OperationsContext", () => ({ useOperations: () => ({
 robots: [{ robot_id: "cleany-01", state: "IDLE", active_mission_id: null, last_seen_at: "2026-09-08T01:00:00Z" }],
 seats: [{ seat_id: "seat-12", label: "12", row: 2, grid_column: 5, occupancy: "AVAILABLE", occupant_name: null }], missions: [], isLoading: false, error: null, isCreatingMission: false,
}) }));
vi.mock("../settings/SettingsContext", () => ({ useSettings: () => ({ settings: { defaultPriority: "NORMAL" } }) }));
afterEach(cleanup);
it("opens robot details from the roster and map and closes without leaving home", () => {
 render(<MemoryRouter><Routes><Route element={<Outlet context={{ floor: { id: "BUSAN_SOMA_18F", label: "18층", mapAvailable: true } }} />}><Route index element={<HomePage />} /></Route></Routes></MemoryRouter>);
 expect(within(screen.getByRole("complementary", { name: "로봇 목록" })).queryByRole("link")).not.toBeInTheDocument();
 expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
 expect(within(screen.getByRole("complementary", { name: "로봇 목록" })).getAllByRole("button")).toHaveLength(1);
 const roster = screen.getByRole("complementary", { name: "로봇 목록" });
 fireEvent.click(roster.querySelector("img")!);
 expect(screen.getByRole("complementary", { name: "로봇 상세" })).toBeInTheDocument();
 expect(screen.queryByRole("complementary", { name: "로봇 목록" })).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "로봇 목록" }));
 expect(screen.getByRole("complementary", { name: "로봇 목록" })).toBeInTheDocument();
 expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "cleany-01 상세 열기" }));
 let panel = screen.getByRole("complementary", { name: "로봇 상세" });
 expect(within(panel).getByRole("figure", { name: "Cleany 외형 미리보기" })).toBeInTheDocument();
 expect(within(panel).getByText("미연동")).toBeInTheDocument();
 expect(within(panel).getByText("현재 할당된 작업이 없습니다.")).toBeInTheDocument();
 fireEvent.click(within(panel).getByRole("button", { name: "로봇 목록" }));
 expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "cleany-01 로봇 · 대기 · 예시 위치" }));
 panel = screen.getByRole("complementary", { name: "로봇 상세" });
 expect(within(panel).getByRole("link", { name: "로봇 상세 페이지 보기" })).toHaveAttribute("href", "/robots?robot=cleany-01");
 fireEvent.keyDown(panel, { key: "Escape" });
 expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
});

it("toggles the same seat panel and can reopen it during the closing animation", () => {
 render(<MemoryRouter><Routes><Route element={<Outlet context={{ floor: { id: "BUSAN_SOMA_18F", label: "18층", mapAvailable: true } }} />}><Route index element={<HomePage />} /></Route></Routes></MemoryRouter>);
 const seat = screen.getByRole("button", { name: "12번 좌석 · 비어 있음" });
 fireEvent.click(seat);
 expect(seat).toHaveAttribute("aria-pressed", "true");
 expect(screen.getByRole("button", { name: "요청 보내기" })).toBeVisible();
 fireEvent.click(seat);
 expect(seat).toHaveAttribute("aria-pressed", "false");
 expect(screen.queryByRole("button", { name: "요청 보내기" })).not.toBeInTheDocument();
 fireEvent.click(seat);
 expect(screen.getByRole("button", { name: "요청 보내기" })).toBeVisible();
});

it("keeps seat and robot panels mutually exclusive from both robot entry points", () => {
 render(<MemoryRouter><Routes><Route element={<Outlet context={{ floor: { id: "BUSAN_SOMA_18F", label: "18층", mapAvailable: true } }} />}><Route index element={<HomePage />} /></Route></Routes></MemoryRouter>);
 const seat = screen.getByRole("button", { name: "12번 좌석 · 비어 있음" });
 for (const name of ["cleany-01 상세 열기", "cleany-01 로봇 · 대기 · 예시 위치"]) {
  fireEvent.click(seat);
  expect(screen.getByRole("button", { name: "요청 보내기" })).toBeVisible();
  expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name }));
  expect(document.querySelector(".home-request-drawer .seat-mission-panel")).not.toBeNull();
  expect(screen.getByRole("complementary", { name: "로봇 상세" })).toBeVisible();
  expect(document.querySelector(".home-request-drawer")).toHaveAttribute("inert");
  expect(screen.queryByRole("button", { name: "요청 보내기" })).not.toBeInTheDocument();
  expect(seat).toHaveAttribute("aria-pressed", "false");
 }
 fireEvent.click(seat);
 expect(document.querySelector(".home-robot-drawer .home-robot-detail-panel")).not.toBeNull();
 expect(document.querySelector(".home-robot-drawer")).toHaveAttribute("inert");
 expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
 expect(screen.getByRole("button", { name: "요청 보내기" })).toBeVisible();
});

it("shows occupancy without mission counts or seat search", () => {
 render(<MemoryRouter><Routes><Route element={<Outlet context={{ floor: { id: "BUSAN_SOMA_18F", label: "18층", mapAvailable: true } }} />}><Route index element={<HomePage />} /></Route></Routes></MemoryRouter>);
 expect(screen.getByRole("heading", { name: "18층 좌석 지도" })).toBeVisible();
 expect(screen.queryByRole("navigation", { name: "작업 요청 현황" })).not.toBeInTheDocument();
 expect(screen.queryByRole("search")).not.toBeInTheDocument();
 expect(screen.getByRole("group", { name: "좌석 점유 현황" })).toBeVisible();
 expect(screen.queryByRole("region", { name: "좌석 이용 및 정리 현황" })).not.toBeInTheDocument();
});
it("keeps demo visible and prevents real mission submission", () => {
 render(<MemoryRouter initialEntries={["/?summaryDemo=1"]}><Routes><Route element={<Outlet context={{ floor: { id: "BUSAN_SOMA_18F", label: "18층", mapAvailable: true } }} />}><Route index element={<HomePage />} /></Route></Routes></MemoryRouter>);
 expect(screen.getByRole("button", { name: "데모 · 해제" })).toBeVisible();
 fireEvent.click(screen.getByRole("button", { name: "12번 좌석 · 비어 있음" }));
 expect(screen.getByRole("button", { name: "요청 보내기" })).toBeDisabled();
});
