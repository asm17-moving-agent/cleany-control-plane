// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Seat } from "../../api/types";
import { FacilityMap } from "./FacilityMap";

const seats: Seat[] = [
  {
    seat_id: "seat-01",
    label: "01",
    row: 1,
    grid_column: 1,
    occupancy: "AVAILABLE",
    occupant_name: null,
  },
];

afterEach(cleanup);

function FacilityMapHarness() {
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [seatId, setSeatId] = useState<string | null>(null);

  return (
    <FacilityMap
      seats={seats}
      selectedZoneId={zoneId}
      selectedSeatId={seatId}
      onSelectSeat={(nextSeatId) => setSeatId((current) => current === nextSeatId ? null : nextSeatId)}
      onBackToZones={() => {
        setZoneId(null);
        setSeatId(null);
      }}
      robotState="IDLE"
    />
  );
}

describe("FacilityMap navigation", () => {
  it("keeps the edited floor plan fixed below the interactive overlays", () => {
    const { container } = render(<FacilityMapHarness />);

    expect(container.querySelector("img.facility-plan-artwork")).toHaveAttribute("width", "1650");
    expect(container.querySelector("img.facility-plan-artwork")).toHaveAttribute("height", "953");
    expect(container.querySelectorAll(".facility-plan-label")).toHaveLength(16);
    expect(container.querySelectorAll(".facility-inactive-areas path")).toHaveLength(1);
    expect(container.querySelector(".facility-inactive-areas path"))
      .toHaveAttribute("d", "M8 8H74V90H8Z M976 8H1154V662H8V454H976Z");
    expect(screen.getByText("회색 영역: 운영 대상 외")).toBeInTheDocument();
    expect(container.querySelector(".facility-plan-label")).toHaveAttribute("dominant-baseline", "middle");
    expect(container.querySelector(".facility-plan-static-overlay")).toHaveAttribute("preserveAspectRatio", "none");
    expect(container.querySelectorAll("#facility-seat-symbol")).toHaveLength(1);
    expect(container.querySelectorAll(".facility-dhub-table")).toHaveLength(9);
    expect(container.querySelectorAll(".facility-dhub-furniture .facility-static-seat")).toHaveLength(48);
    expect(
      [...container.querySelectorAll(".facility-dhub-table")].map((table) => table.getAttribute("y")),
    ).toEqual(["90", "190", "290"].flatMap((y) => Array(3).fill(y)));
    expect(container.querySelector(".facility-static-seat")).toHaveAttribute("width", "26");
    expect(container.querySelector(".facility-static-seat")).toHaveAttribute("height", "28.6");
    expect(container.querySelector('[data-plan-label="d-hub"]')).toHaveAttribute("y", "35");
    expect(container.querySelectorAll(".facility-elevator-symbol")).toHaveLength(5);
    expect(container.querySelector(".facility-elevator-symbol image"))
      .toHaveAttribute("href", expect.stringMatching(/^data:image\/svg\+xml/));
    expect(container.querySelector(".facility-zone-overlay")).not.toBeInTheDocument();
    expect(container.querySelector(".facility-route-overlay")).toHaveAttribute("preserveAspectRatio", "none");
    expect(container.querySelector(".facility-plan-rotated-geometry")).not.toBeInTheDocument();
  });

  it("renders zone names as information without exposing zone controls", () => {
    render(<FacilityMapHarness />);

    expect(screen.queryByRole("button", { name: /THE GROND/ })).not.toBeInTheDocument();
    expect(document.querySelector(".facility-plan-labels")).toHaveTextContent("THE GROND");
  });

  it("opens the matching robot inspector from an operations-map marker", () => {
    const onSelectRobot = vi.fn();
    render(
      <FacilityMap
        seats={seats}
        selectedZoneId={null}
        selectedSeatId={null}
        onSelectSeat={vi.fn()}
        onBackToZones={vi.fn()}
        robots={[{
          robotId: "cleany-02",
          state: "BUSY",
          x: 380,
          y: 280,
          positionMode: "scenario",
        }]}
        selectedRobotId={null}
        onSelectRobot={onSelectRobot}
        variant="operations"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cleany-02 로봇.*작업 중/ }));
    expect(onSelectRobot).toHaveBeenCalledWith("cleany-02");
  });
});
