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
    expect(seatMapPosition({ zone_id: "space-a1", row: 1, grid_column: 3 })).toBeNull();
  });
});
