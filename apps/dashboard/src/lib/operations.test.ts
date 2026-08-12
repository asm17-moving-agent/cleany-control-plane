import { describe, expect, it } from "vitest";
import type { Mission, Seat } from "../api/types";
import { missionProgress, missionTone, seatLocation, seatPosition } from "./operations";

function seat(label: string): Seat {
  return {
    seat_id: `seat-${label}`,
    label,
    row: Math.floor((Number(label) - 1) / 8) + 1,
    grid_column: 1,
    occupancy: "AVAILABLE",
    occupant_name: null,
  };
}

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    mission_id: "mission-1",
    seat_id: "seat-01",
    target: { kind: "SEAT", reference_id: "seat-01", label: "01번 좌석" },
    priority: "NORMAL",
    requested_by: "operator",
    idempotency_key: "key-1",
    created_at: "2026-08-12T00:00:00Z",
    phase: "QUEUED",
    outcome: null,
    message: "Mission queued.",
    sequence: 0,
    cancel_requested: false,
    before_observation: null,
    after_observation: null,
    ...overrides,
  };
}

describe("seat layout", () => {
  it.each([
    ["01", 1, 2, "A-1"],
    ["03", 3, 2, "C-1"],
    ["04", 5, 2, "D-1"],
    ["08", 10, 2, "H-1"],
    ["17", 1, 5, "A-3"],
    ["48", 10, 9, "H-6"],
  ])("places seat %s in the expected grid cell", (label, column, gridRow, location) => {
    expect(seatPosition(seat(label))).toMatchObject({ column, gridRow });
    expect(seatLocation(seat(label))).toBe(location);
  });
});

describe("mission presentation", () => {
  it("maps lifecycle phases to stable progress", () => {
    expect(missionProgress("QUEUED")).toBe(8);
    expect(missionProgress("WORKING")).toBe(68);
    expect(missionProgress("TERMINAL")).toBe(100);
  });

  it("uses outcome before phase when choosing a tone", () => {
    expect(missionTone(mission({ phase: "TERMINAL", outcome: "SUCCESS" }))).toBe("success");
    expect(missionTone(mission({ phase: "TERMINAL", outcome: "FAILED" }))).toBe("danger");
    expect(missionTone(mission({ phase: "WORKING" }))).toBe("info");
  });
});
