import { describe, expect, it } from "vitest";
import { D_HUB_DESK_HEIGHT, D_HUB_DESK_WIDTH, D_HUB_SEATS, D_HUB_UNITS_PER_METER, ROOM_TABLES, seatMapPosition, seatMapSize, worldToMap } from "./seat-layout";
import type { Seat } from "../../api/types";
import { getFacilityZone } from "./facility-18f";

describe("API seat coordinates", () => {
  it("places every room target on its own desk without overlapping D-HUB or adjacent seats", () => {
    const positions = [...D_HUB_SEATS.map(s => `${s.x},${s.y}`)];
    for (const room of ROOM_TABLES) {
      for (const row of [1, 2]) for (const column of [1, 2, 3].slice(0, room.columns)) {
        const seat = { zone_id: room.id, row, grid_column: column } as Seat;
        const point = seatMapPosition(seat)!;
        positions.push(`${point.x},${point.y}`);
        expect(Math.abs(point.x - room.x)).toBeLessThan(51);
        expect(Math.abs(point.y - room.y)).toBeLessThan(30);
        const size = seatMapSize(seat);
        expect(size.width > size.height).toBe(!room.vertical);
      }
    }
    expect(positions).toHaveLength(82);
    expect(new Set(positions).size).toBe(82);
    expect(seatMapPosition({ zone_id: "space-a1", row: 1, grid_column: 3 })).toBeNull();
  });
  it("derives D-HUB geometry from the Gazebo metric transform without changing SPACE dimensions", () => {
    for (const [seat, expected] of [
      [D_HUB_SEATS[0], worldToMap(-5.53, 3.555)],
      [D_HUB_SEATS[47], worldToMap(5.53, -3.555)],
    ]) {
      expect(seat.x).toBeCloseTo(expected.x, 10);
      expect(seat.y).toBeCloseTo(expected.y, 10);
    }
    expect(D_HUB_DESK_WIDTH).toBe(1.2 * D_HUB_UNITS_PER_METER);
    expect(D_HUB_DESK_HEIGHT).toBe(0.77 * D_HUB_UNITS_PER_METER);
    expect(seatMapSize({ zone_id: "space-m1" })).toEqual({ width: 38 * 0.85, height: 28 * 0.85 });
    expect(seatMapSize({ zone_id: "space-a1" })).toEqual({ width: 28 * 0.85, height: 38 * 0.85 });
    const dhub = getFacilityZone("d-hub")!;
    expect(Math.min(...dhub.points.map(point => point.x))).toBe(576);
    expect(Math.max(...dhub.points.map(point => point.x))).toBe(976);
    expect(Math.min(...dhub.points.map(point => point.y))).toBe(8);
    const width = Math.max(...dhub.points.map(point => point.x)) - Math.min(...dhub.points.map(point => point.x));
    const height = Math.max(...dhub.points.map(point => point.y)) - Math.min(...dhub.points.map(point => point.y));
    expect(width / height).toBeCloseTo(12.26 / 10.94, 10);
    // D-HUB table tops touch within pairs and leave the metric center aisles.
    expect((D_HUB_SEATS[1].x - D_HUB_SEATS[0].x) / D_HUB_UNITS_PER_METER).toBeCloseTo(1.2, 10);
    expect((D_HUB_SEATS[8].y - D_HUB_SEATS[0].y) / D_HUB_UNITS_PER_METER).toBeCloseTo(0.77, 10);
    expect((D_HUB_SEATS[3].x - D_HUB_SEATS[2].x - D_HUB_DESK_WIDTH) / D_HUB_UNITS_PER_METER).toBeCloseTo(1.33, 10);
    for (const seat of D_HUB_SEATS) {
      expect(seat.x).toBeGreaterThan(576);
      expect(seat.x).toBeLessThan(976);
      expect(seat.y).toBeGreaterThan(8);
      expect(seat.y).toBeLessThan(364.93);
    }
  });
});
