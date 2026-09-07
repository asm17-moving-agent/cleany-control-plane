import { describe, expect, it } from "vitest";
import { FACILITY_18F, FACILITY_ZONES, getFacilityZone, rotatePortraitPoint } from "./facility-18f";

describe("18F facility map", () => {
  it("keeps stable unique zone identifiers", () => {
    const ids = FACILITY_ZONES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes only selectable mission zones", () => {
    expect(getFacilityZone("the-grond")?.selectable).toBe(true);
    expect(FACILITY_ZONES.every(({ selectable }) => selectable)).toBe(true);
    expect(getFacilityZone("missing-zone")).toBeNull();
  });

  it("uses a landscape coordinate system with every zone inside the plan", () => {
    expect(FACILITY_18F.imageWidth).toBeGreaterThan(FACILITY_18F.imageHeight);
    expect(FACILITY_ZONES.flatMap(({ points }) => points).every(({ x, y }) => (
      x >= 0
      && x <= FACILITY_18F.imageWidth
      && y >= 0
      && y <= FACILITY_18F.imageHeight
    ))).toBe(true);
  });

  it("rotates portrait coordinates counter-clockwise without rotating labels", () => {
    expect(rotatePortraitPoint({ x: 0, y: 0 })).toEqual({ x: 0, y: 670 });
    expect(rotatePortraitPoint({ x: 670, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(rotatePortraitPoint({ x: 0, y: 1160 })).toEqual({ x: 1160, y: 670 });
  });
});
