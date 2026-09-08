import { describe, expect, it } from "vitest";
import { D_HUB_SEATS, ROOM_TABLES, seatMapPosition, seatMapSize } from "./seat-layout";
import type { Seat } from "../../api/types";

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
    expect(seatMapPosition({ zone_id: "space-a1", row: 1, grid_column: 1 })).toEqual({ x: 81.6, y: 351, rotation: 90 });
    expect(seatMapPosition({ zone_id: "space-m1", row: 2, grid_column: 3 })).toEqual({ x: 296.85, y: 88.6, rotation: 180 });
    expect(seatMapPosition({ zone_id: "space-a1", row: 1, grid_column: 3 })).toBeNull();
  });
  it("uses the API row and grid column instead of deriving geometry from an ID or label", () => {
    expect(seatMapPosition({ row: 1, grid_column: 1 })).toEqual({ x: 604.5, y: 79, rotation: 0 });
    expect(seatMapPosition({ row: 1, grid_column: 5 })).toEqual({ x: 757, y: 79, rotation: 0 });
    expect(seatMapPosition({ row: 2, grid_column: 1 })).toEqual({ x: 604.5, y: 111, rotation: 180 });
    expect(seatMapPosition({ row: 6, grid_column: 10 })).toEqual({ x: 949.5, y: 321, rotation: 180 });
    expect(seatMapPosition({ row: 7, grid_column: 1 })).toBeNull();
  });
  it("aligns the desktop targets with all 48 unique row-major API seats", () => {
    expect(D_HUB_SEATS).toHaveLength(48);
    expect(new Set(D_HUB_SEATS.map(({ x, y }) => `${x},${y}`)).size).toBe(48);
    expect(D_HUB_SEATS.find(({ id }) => id === "seat-09")).toEqual({ id: "seat-09", x: 604.5, y: 111, rotation: 180 });
    expect(D_HUB_SEATS.find(({ id }) => id === "seat-12")).toEqual({ id: "seat-12", x: 757, y: 111, rotation: 180 });
  });
});
