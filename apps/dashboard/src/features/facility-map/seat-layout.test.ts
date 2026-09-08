import { describe, expect, it } from "vitest";
import { D_HUB_SEATS, seatMapPosition } from "./seat-layout";

describe("API seat coordinates", () => {
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
