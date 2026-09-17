import type { Seat } from "../../api/types";

// Manually mirrored from cleany_gazebo_sim/config/study_cafe/study_cafe_layout.yaml.
// The artwork's raster wall centers fix the map anchor; ROS is not connected.
export const D_HUB_UNITS_PER_METER = 400 / 12.26;
export const D_HUB_ORIGIN = { x: 776, topY: 8, worldTopY: 10.94 / 2 };
export function worldToMap(x: number, y: number) {
  return { x: D_HUB_ORIGIN.x + x * D_HUB_UNITS_PER_METER, y: D_HUB_ORIGIN.topY + (D_HUB_ORIGIN.worldTopY - y) * D_HUB_UNITS_PER_METER };
}
export const D_HUB_ROOM = {
  left: worldToMap(-6.13, 0).x,
  right: worldToMap(6.13, 0).x,
  top: worldToMap(0, 5.47).y,
  bottom: worldToMap(0, -5.47).y,
  cornerRadius: 36, // Preserve the web artwork's rounded corner, not a Gazebo wall.
};
const columns = [1, 2, 3, 5, 6, 8, 9, 10] as const;
const COLUMN_X: Record<Seat["grid_column"], number> = Object.fromEntries(
  [-5.53, -4.33, -3.13, -0.6, 0.6, 3.13, 4.33, 5.53].map((x, i) => [columns[i], worldToMap(x, 0).x]),
) as Record<Seat["grid_column"], number>;
const ROW_Y = [3.17, 0, -3.17].flatMap(y => [y + 0.385, y - 0.385]).map(y => worldToMap(0, y).y);
export const D_HUB_DESK_WIDTH = 1.2 * D_HUB_UNITS_PER_METER;
export const D_HUB_DESK_HEIGHT = 0.77 * D_HUB_UNITS_PER_METER;
export const D_HUB_CHAIR_OFFSET = 0.385 * D_HUB_UNITS_PER_METER;
export const ROOM_DESK_WIDTH = 38;
export const ROOM_DESK_HEIGHT = 28;
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
export const D_HUB_TABLES = [3.17, 0, -3.17].flatMap((worldY, row) =>
  [{ x: -4.33, columns: 3 }, { x: 0, columns: 2 }, { x: 4.33, columns: 3 }].map((table, column) => ({
    ...worldToMap(table.x, worldY), width: table.columns * D_HUB_DESK_WIDTH,
    id: "table-" + (row * 3 + column + 1),
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
    ? { width: (room.vertical ? ROOM_DESK_HEIGHT : ROOM_DESK_WIDTH) * ROOM_DESK_SCALE,
        height: (room.vertical ? ROOM_DESK_WIDTH : ROOM_DESK_HEIGHT) * ROOM_DESK_SCALE }
    : { width: D_HUB_DESK_WIDTH, height: D_HUB_DESK_HEIGHT };
}
export const D_HUB_SEATS = ROW_Y.flatMap((_, row) => columns.map((grid_column, column) => ({
  id: "seat-" + String(row * 8 + column + 1).padStart(2, "0"),
  ...seatMapPosition({ row: row + 1, grid_column })!,
})));
