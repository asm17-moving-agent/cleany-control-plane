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
 expect(within(screen.getByRole("complementary", { name: "로봇 현황" })).queryByRole("link")).not.toBeInTheDocument();
 expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
 expect(within(screen.getByRole("complementary", { name: "로봇 현황" })).getAllByRole("button")).toHaveLength(1);
 const roster = within(screen.getByRole("complementary", { name: "로봇 현황" }));
 fireEvent.click(roster.getByRole("figure", { name: "Cleany 외형 미리보기" }));
 expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "cleany-01 상세 열기" }));
 fireEvent.click(screen.getByRole("button", { name: "cleany-01 상세 열기" }));
 expect(screen.queryByRole("complementary", { name: "로봇 상세" })).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "cleany-01 상세 열기" }));
 let panel = screen.getByRole("complementary", { name: "로봇 상세" });
 expect(within(panel).queryByRole("figure", { name: "Cleany 외형 미리보기" })).not.toBeInTheDocument();
 expect(within(panel).getByText("미연동")).toBeInTheDocument();
 expect(within(panel).getByText("현재 할당된 작업이 없습니다.")).toBeInTheDocument();
 fireEvent.click(within(panel).getByRole("button", { name: "로봇 상세 닫기" }));
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
