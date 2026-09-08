// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Seat } from "../../api/types";
import { FacilityMap } from "./FacilityMap";

const seats: Seat[] = [
  { seat_id: "seat-01", label: "01", row: 1, grid_column: 1, occupancy: "AVAILABLE", occupant_name: null },
  { seat_id: "seat-12", label: "12", row: 2, grid_column: 5, occupancy: "OCCUPIED", occupant_name: "Operator" },
];
afterEach(cleanup);
function FacilityMapHarness() {
  const [seatId, setSeatId] = useState<string | null>(null);
  return <FacilityMap seats={seats} selectedSeatId={seatId} onSelectSeat={setSeatId}
    robots={[]} selectedRobotId={null} onSelectRobot={vi.fn()} />;
}
describe("FacilityMap", () => {
  it("preserves the actual 18F artwork beneath the seat and robot layers", () => {
    const { container } = render(<FacilityMapHarness />);
    expect(container.querySelector("img.facility-plan-artwork")).toHaveAttribute("width", "1650");
    expect(container.querySelector("img.facility-plan-artwork")).toHaveAttribute("height", "953");
    expect(container.querySelectorAll(".facility-plan-label")).toHaveLength(16);
    expect(container.querySelector(".facility-inactive-areas path"))
      .toHaveAttribute("d", "M8 8H74V90H8Z M976 8H1154V662H8V454H976Z");
    expect(screen.getByText("운영 대상 외")).toBeInTheDocument();
    expect(container.querySelectorAll(".facility-dhub-furniture .facility-dhub-table")).toHaveLength(9);
    expect(container.querySelectorAll(".facility-dhub-furniture .facility-desk-surface")).toHaveLength(48);
    expect(container.querySelectorAll(".facility-static-seat")).toHaveLength(0);
    expect(container.querySelectorAll(".facility-elevator-symbol")).toHaveLength(5);
    expect(container.querySelector(".facility-route-overlay")).not.toBeInTheDocument();
    expect(container.querySelector(".facility-plan-canvas")).toContainElement(container.querySelector(".facility-seat-overlay"));
    expect(container.querySelector(".facility-plan-canvas")).toContainElement(container.querySelector(".facility-robot-overlay"));
  });
  it("selects a seat directly on the map and retains its identity through zoom and reset", () => {
    const { container } = render(<FacilityMapHarness />);
    const canvas = container.querySelector<HTMLElement>(".facility-plan-canvas")!;
    const initialTransform = canvas.style.transform;
    const seat = screen.getByRole("button", { name: "12번 좌석 · 사용 중" });
    fireEvent.click(seat);
    expect(seat).toHaveAttribute("aria-pressed", "true");
    expect(canvas.style.transform).toBe(initialTransform);
    expect(screen.getByLabelText("지도 확대 비율")).toHaveTextContent("125%");
    fireEvent.click(screen.getByRole("button", { name: "지도 확대" }));
    expect(screen.getByLabelText("지도 확대 비율")).toHaveTextContent("156%");
    fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
    expect(seat).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("지도 확대 비율")).toHaveTextContent("100%");
    expect(screen.queryByRole("button", { name: /D-HUB/ })).not.toBeInTheDocument();
  });
  it("disables seat requests when data cannot be trusted but leaves the map controls usable", () => {
    const select = vi.fn();
    render(<FacilityMap seats={seats} selectedSeatId={null} onSelectSeat={select}
      robots={[]} selectedRobotId={null} onSelectRobot={vi.fn()} seatSelectionDisabled />);
    fireEvent.click(screen.getByRole("button", { name: "01번 좌석 · 비어 있음" }));
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "지도 확대" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "로봇 중심" })).toBeDisabled();
  });
  it("selects the matching robot and identifies its position as illustrative", () => {
    const onSelectRobot = vi.fn();
    render(<FacilityMap seats={seats} selectedSeatId={null} onSelectSeat={vi.fn()}
      robots={[{ robotId: "cleany-02", state: "BUSY", x: 380, y: 280, positionMode: "scenario" }]}
      selectedRobotId={null} onSelectRobot={onSelectRobot} />);
    fireEvent.click(screen.getByRole("button", { name: "cleany-02 로봇 · 작업 중 · 예시 위치" }));
    expect(onSelectRobot).toHaveBeenCalledWith("cleany-02");
  });
});
