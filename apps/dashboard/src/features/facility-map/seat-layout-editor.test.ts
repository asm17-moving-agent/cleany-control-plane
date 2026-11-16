import { describe, expect, it } from "vitest";
import { displayToSlam, slamToPixel, slamPixelToDisplay, type SlamMapMetadata } from "./slam-map";
import { moveLayoutSeats, rotateLayoutSeats } from "./SeatLayoutLayer";
import type { components } from "../../api/generated/openapi";
const map = { origin: [-17.2, -28.24, 0.3], width: 573, height: 782, resolution: 0.05,
  presentation: { transform: [-0.1725480287456468, -0.9850011054694261, 0.9850011054694261, -0.1725480287456468, 45, 540], rotation_degrees: -99.936 } } as SlamMapMetadata;
const entry = { seat_id: "seat-01", label: "01", table_id: "t1", zone_id: "d-hub", row: 1, grid_column: 1,
  pose: { x: 1, y: 2, yaw: 0 }, approach: { x: 0, y: 2, yaw: 0 }, width: .9, depth: .5, verification: "draft" } as const;
const layout = { map_id: "test", source_sha256: "a".repeat(64), revision: 0, seats: [entry, { ...entry, seat_id: "seat-02", label: "02" }] } as components["schemas"]["SeatLayout"];
describe("metric seat editing", () => {
  it("round trips corners and room points through rotated origin and presentation", () => {
    for (const [x, y] of [[0, 0], [-10, -20], [2, -7], [5, 1]]) {
      const screen = slamPixelToDisplay(map, slamToPixel(map, x, y));
      const world = displayToSlam(map, screen.x, screen.y);
      expect(world.x).toBeCloseTo(x, 10); expect(world.y).toBeCloseTo(y, 10);
    }
  });
  it("moves a seat together with its approach without moving other seats", () => {
    const moved = moveLayoutSeats(layout, ["seat-01"], .2, -.5);
    expect(moved.seats[0].pose).toEqual({ x: 1.2, y: 1.5, yaw: 0 });
    expect(moved.seats[0].approach).toEqual({ x: .2, y: 1.5, yaw: 0 });
    expect(moved.seats[1]).toEqual(layout.seats[1]);
    expect(layout.seats[0]).toEqual(entry);
  });
  it("rotates the approach around the desk and preserves its distance", () => {
    const rotated = rotateLayoutSeats(layout, ["seat-01"], Math.PI / 2).seats[0];
    expect(rotated.pose.x).toBeCloseTo(1); expect(rotated.pose.y).toBeCloseTo(2);
    expect(rotated.approach.x).toBeCloseTo(1); expect(rotated.approach.y).toBeCloseTo(1);
    expect(rotated.approach.yaw).toBeCloseTo(Math.PI / 2);
  });
});
