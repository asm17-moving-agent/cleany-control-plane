import type { Seat } from "../../api/types";

// Desk gaps are 2 units within a group and 34.5 units across an aisle.
// API grid columns match the three D-HUB desk groups (3 / 2 / 3 columns).
const COLUMN_X: Record<Seat["grid_column"], number> = {
  1: 604.5, 2: 644.5, 3: 684.5, 5: 757, 6: 797, 8: 869.5, 9: 909.5, 10: 949.5,
};
const ROW_Y = [79, 111, 184, 216, 289, 321] as const;
export const D_HUB_DESK_WIDTH = 38;
export const D_HUB_DESK_HEIGHT = 28;
export const ROOM_DESK_SCALE = 0.85;
export const ROOM_TABLES: { id: string; x: number; y: number; columns: number; vertical?: boolean }[] = [
  { id: "space-a4", x: 150.85, y: 75, columns: 2 },
  { id: "space-m1", x: 262.85, y: 75, columns: 3 },
  { id: "space-m2", x: 391.85, y: 75, columns: 3 },
  { id: "space-m3", x: 519.85, y: 75, columns: 3 },
  { id: "space-a3", x: 68, y: 173, columns: 2, vertical: true },
  { id: "space-a2", x: 68, y: 268, columns: 2, vertical: true },
  { id: "space-a1", x: 68, y: 368, columns: 2, vertical: true },
];
export function roomDeskPositions(columns: number) {
  return [-16, 16].flatMap(y => Array.from({ length: columns }, (_, column) => ({
    x: (column - (columns - 1) / 2) * 40, y,
  })));
}
export const D_HUB_TABLES = [95, 200, 305].flatMap((y, row) =>
  [{ x: 644.5, width: 80 + D_HUB_DESK_WIDTH }, { x: 777, width: 40 + D_HUB_DESK_WIDTH }, { x: 909.5, width: 80 + D_HUB_DESK_WIDTH }].map((table, column) => ({
    ...table, id: "table-" + (row * 3 + column + 1), y,
  })),
);
export function seatMapPosition(seat: Pick<Seat, "row" | "grid_column"> & Partial<Pick<Seat, "zone_id">>) {
  if (seat.zone_id && seat.zone_id !== "d-hub") {
    const room = ROOM_TABLES.find(room => room.id === seat.zone_id);
    if (!room || seat.row < 1 || seat.row > 2 || seat.grid_column > room.columns) return null;
    const local = roomDeskPositions(room.columns)[(seat.row - 1) * room.columns + seat.grid_column - 1];
    if (!local) return null;
    return {
      x: room.x + (room.vertical ? -local.y : local.x) * ROOM_DESK_SCALE,
      y: room.y + (room.vertical ? local.x : local.y) * ROOM_DESK_SCALE,
      rotation: (room.vertical ? 90 : 0) + (seat.row === 2 ? 180 : 0),
    };
  }
  const y = ROW_Y[seat.row - 1];
  const x = COLUMN_X[seat.grid_column];
  return x === undefined || y === undefined ? null : { x, y, rotation: seat.row % 2 ? 0 : 180 };
}
export function seatMapSize(seat: Pick<Seat, "zone_id">) {
  const room = ROOM_TABLES.find(room => room.id === seat.zone_id);
  return room
    ? { width: (room.vertical ? D_HUB_DESK_HEIGHT : D_HUB_DESK_WIDTH) * ROOM_DESK_SCALE,
        height: (room.vertical ? D_HUB_DESK_WIDTH : D_HUB_DESK_HEIGHT) * ROOM_DESK_SCALE }
    : { width: D_HUB_DESK_WIDTH, height: D_HUB_DESK_HEIGHT };
}
const columns = [1, 2, 3, 5, 6, 8, 9, 10] as const;
export const D_HUB_SEATS = ROW_Y.flatMap((_, row) => columns.map((grid_column, column) => ({
  id: "seat-" + String(row * 8 + column + 1).padStart(2, "0"),
  ...seatMapPosition({ row: row + 1, grid_column })!,
})));
