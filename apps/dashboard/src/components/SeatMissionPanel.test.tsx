// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeatMissionPanel } from "./SeatMissionPanel";

const { createMission } = vi.hoisted(() => ({ createMission: vi.fn() }));
vi.mock("../operations/OperationsContext", () => ({ useOperations: () => ({ createMission, isCreatingMission: false, robots: [] }) }));
vi.mock("../settings/SettingsContext", () => ({ useSettings: () => ({ settings: { defaultPriority: "NORMAL" } }) }));
const seat = { seat_id: "seat-12", label: "12", zone_id: "d-hub", row: 2, grid_column: 5, occupancy: "AVAILABLE", occupant_name: null } as const;
function panel(unavailable = false) { return render(<MemoryRouter><SeatMissionPanel seat={seat} unavailable={unavailable} onClose={vi.fn()} /></MemoryRouter>); }
afterEach(cleanup);
beforeEach(() => { createMission.mockReset(); });

describe("seat mission submission", () => {
  it("submits the room seat identity and displays its actual zone", async () => {
    createMission.mockResolvedValue({ mission_id: "room-request" });
    render(<MemoryRouter><SeatMissionPanel seat={{ ...seat, seat_id: "seat-m1-06", label: "M1-06", zone_id: "space-m1", row: 2, grid_column: 3, occupancy: "UNKNOWN" }} unavailable={false} onClose={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText(/점유 미확인/)).toHaveTextContent("SPACE M1");
    fireEvent.click(screen.getByRole("button", { name: "요청 보내기" }));
    await screen.findByRole("link", { name: "요청 현황 보기" });
    expect(createMission.mock.calls[0][0].target).toEqual({ kind: "SEAT", reference_id: "seat-m1-06", label: "SPACE M1 · M16번 좌석" });
  });
  it("reuses the same idempotency key after a network failure and sends only supported fields", async () => {
    createMission.mockRejectedValueOnce(new Error("네트워크 오류")).mockResolvedValueOnce({ mission_id: "mission-retry" });
    panel();
    fireEvent.click(screen.getByRole("radio", { name: "높음" }));
    fireEvent.click(screen.getByRole("button", { name: "요청 보내기" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("radio", { name: "높음" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "다시 요청" }));
    await screen.findByRole("link", { name: "요청 현황 보기" });
    expect(createMission.mock.calls[1][0]).toEqual(createMission.mock.calls[0][0]);
    expect(createMission.mock.calls[0][0]).toEqual({ target: { kind: "SEAT", reference_id: "seat-12", label: "D-HUB · 12번 좌석" }, priority: "HIGH", requested_by: "scenario-operator", idempotency_key: expect.any(String) });
    expect(screen.getByRole("link", { name: "요청 현황 보기" })).toHaveAttribute("href", "/missions?mission=mission-retry");
    expect(screen.getByRole("button", { name: "대기열 등록 완료" })).toBeDisabled();
  });
  it("guards rapid repeated submission and keeps pending controls locked", async () => {
    let finish!: (value: { mission_id: string }) => void;
    createMission.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { container } = panel();
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.submit(container.querySelector("form")!);
    expect(createMission).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "작업 요청 닫기" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "높음" })).toBeDisabled();
    finish({ mission_id: "one-mission" });
    await waitFor(() => expect(screen.getByRole("button", { name: "대기열 등록 완료" })).toBeDisabled());
  });
  it("starts a different attempt when the priority changes after a failed request", async () => {
    createMission.mockRejectedValue(new Error("다시 시도해 주세요"));
    panel();
    fireEvent.click(screen.getByRole("button", { name: "요청 보내기" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("radio", { name: "높음" }));
    fireEvent.click(screen.getByRole("button", { name: "요청 보내기" }));
    await screen.findByRole("alert");
    expect(createMission.mock.calls[1][0].priority).toBe("HIGH");
    expect(createMission.mock.calls[1][0].idempotency_key).not.toBe(createMission.mock.calls[0][0].idempotency_key);
  });
  it("prevents submission while the API data is unavailable", () => {
    const { container } = panel(true);
    fireEvent.submit(container.querySelector("form")!);
    expect(createMission).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "요청 보내기" })).toBeDisabled();
  });
});
