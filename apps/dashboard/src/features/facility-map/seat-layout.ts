import type { Seat } from "../../api/types";

// Desk gaps are 2 units within a group and 34.5 units across an aisle.
// API grid columns match the three D-HUB desk groups (3 / 2 / 3 columns).
const COLUMN_X: Record<Seat["grid_column"], number> = {
  1: 604.5, 2: 644.5, 3: 684.5, 5: 757, 6: 797, 8: 869.5, 9: 909.5, 10: 949.5,
};
const ROW_Y = [79, 111, 184, 216, 289, 321] as const;
export const D_HUB_DESK_WIDTH = 38;
export const D_HUB_DESK_HEIGHT = 28;
export const D_HUB_TABLES = [95, 200, 305].flatMap((y, row) =>
  [{ x: 644.5, width: 80 + D_HUB_DESK_WIDTH }, { x: 777, width: 40 + D_HUB_DESK_WIDTH }, { x: 909.5, width: 80 + D_HUB_DESK_WIDTH }].map((table, column) => ({
    ...table, id: "table-" + (row * 3 + column + 1), y,
  })),
);
export function seatMapPosition(seat: Pick<Seat, "row" | "grid_column">) {
  const y = ROW_Y[seat.row - 1];
  const x = COLUMN_X[seat.grid_column];
  return x === undefined || y === undefined ? null : { x, y, rotation: seat.row % 2 ? 0 : 180 };
}
const columns = [1, 2, 3, 5, 6, 8, 9, 10] as const;
export const D_HUB_SEATS = ROW_Y.flatMap((_, row) => columns.map((grid_column, column) => ({
  id: "seat-" + String(row * 8 + column + 1).padStart(2, "0"),
  ...seatMapPosition({ row: row + 1, grid_column })!,
})));
