import { describe, expect, it } from "vitest";
import { displayToSlam, slamToPixel, slamPixelToDisplay, type SlamMapMetadata } from "./slam-map";
import { alignLayoutSeats, cloneLayoutSeats, historyReducer, layoutChanges, moveLayoutSeats, rotateLayoutSeats, seatBounds, selectedSeats, snappedPoint, updateApproaches } from "./seat-layout-editor";
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
  it("rotates desks and approaches around the explicit selection pivot", () => {
    const next = rotateLayoutSeats(layout, ["seat-01"], Math.PI, { x: 0, y: 0 });
    expect(next.seats[0].pose.x).toBeCloseTo(-1);
    expect(next.seats[0].pose.y).toBeCloseTo(-2);
    expect(next.seats[0].approach.x).toBeCloseTo(0);
    expect(next.seats[0].approach.y).toBeCloseTo(-2);
    expect(next.seats[1]).toEqual(layout.seats[1]);
  });
  it("supports group toggling and independent multi-selection", () => {
    expect(selectedSeats(layout, "seat-01", [], false, true)).toEqual(["seat-01", "seat-02"]);
    expect(selectedSeats(layout, "seat-02", ["seat-01"], true, false)).toEqual(["seat-01", "seat-02"]);
    expect(selectedSeats(layout, "seat-01", ["seat-01", "seat-02"], true, true)).toEqual([]);
  });
  it("aligns rotated desk edges in display space while preserving each approach offset", () => {
    const moved = moveLayoutSeats(layout, ["seat-02"], 1.1, .8);
    const aligned = alignLayoutSeats(moved, map, ["seat-01", "seat-02"], "left");
    expect(seatBounds(map, aligned.seats[0]).x).toBeCloseTo(seatBounds(map, aligned.seats[1]).x, 9);
    for (const seat of aligned.seats) {
      const before = moved.seats.find(s => s.seat_id === seat.seat_id)!;
      expect(seat.approach.x - seat.pose.x).toBeCloseTo(before.approach.x - before.pose.x, 9);
      expect(seat.approach.y - seat.pose.y).toBeCloseTo(before.approach.y - before.pose.y, 9);
    }
  });
  it("snaps at physical spacing in the displayed axes", () => {
    const a = snappedPoint(map, { x: 21.3, y: 31.2 }, .25);
    expect(a).toEqual({ x: 20, y: 30 });
    const b = displayToSlam(map, a.x + .25 / map.resolution, a.y), origin = displayToSlam(map, a.x, a.y);
    expect(Math.hypot(b.x - origin.x, b.y - origin.y)).toBeCloseTo(.25, 8);
  });
  it("edits approaches without moving desks and invalidates physical verification", () => {
    const next = updateApproaches({ ...layout, home_verified: true, verification_evidence: "field-record" }, ["seat-01"], { x: .5, yaw: Math.PI });
    expect(next.seats[0].pose).toEqual(layout.seats[0].pose);
    expect(next.seats[0].approach.x).toBe(.5);
    expect(next.seats[1]).toEqual(layout.seats[1]);
    expect(next.home_verified).toBe(false); expect(next.verification_evidence).toBeNull();
  });
  it("clones with unique labels and table groups, then restores exact layouts with undo/redo", () => {
    const twoGroups = { ...layout, seats: [layout.seats[0], { ...layout.seats[1], table_id: "t2" }] };
    const copy = cloneLayoutSeats(twoGroups, ["seat-01", "seat-02"], "abcdef12");
    expect(new Set(copy.layout.seats.map(s => s.label)).size).toBe(4);
    expect(copy.layout.seats[2].table_id).not.toBe(copy.layout.seats[3].table_id);
    const next = historyReducer({ past: [], present: twoGroups, future: [] }, { type: "apply", layout: copy.layout });
    const undone = historyReducer(next, { type: "undo" });
    expect(undone.present).toEqual(twoGroups);
    expect(historyReducer(undone, { type: "redo" }).present).toEqual(copy.layout);
    expect(historyReducer(undone, { type: "apply", layout: moveLayoutSeats(twoGroups, ["seat-01"], .1, 0) }).future).toEqual([]);
  });
  it("summarizes additions, removed seats, labels and approach changes before save", () => {
    const next = updateApproaches(layout, ["seat-01"], { y: .2 });
    next.seats = [{ ...next.seats[0], label: "변경" }];
    const changes = layoutChanges(layout, next);
    expect(changes[0]).toMatchObject({ action: "수정", label: "변경" });
    expect(changes[0].details).toContain("접근점 변경");
    expect(changes[1]).toMatchObject({ action: "삭제", id: "seat-02" });
  });
});
