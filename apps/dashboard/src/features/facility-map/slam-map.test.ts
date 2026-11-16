import { describe, expect, it } from "vitest";
import { slamPixelToDisplay, slamToPixel, type SlamMapMetadata } from "./slam-map";
const map = { origin: [10, -5, 0], width: 100, height: 80, resolution: 0.05 } as SlamMapMetadata;
describe("SLAM map coordinate contract", () => {
  it("maps world origin to bottom-left and one metre to 20 pixels", () => {
    expect(slamToPixel(map, 10, -5)).toMatchObject({ x: 0, y: 80 });
    expect(slamToPixel(map, 11, -4, Math.PI / 2)).toMatchObject({ x: 20, y: 60, heading: -90 });
  });
  it("undoes a rotated map origin before flipping raster Y", () => {
    const result = slamToPixel({ ...map, origin: [10, -5, Math.PI / 2] }, 10, -4, Math.PI / 2);
    expect(result.x).toBeCloseTo(20);
    expect(result.y).toBeCloseTo(80);
    expect(result.heading).toBeCloseTo(0);
  });
});

describe("display alignment", () => {
  const aligned = { ...map, presentation: { width: 100, height: 80,
    transform: [0, -1, 1, 0, -10, 100], rotation_degrees: -90,
    image_url: "/api/map/presentation", source_image_sha256: "a".repeat(64),
  } } as SlamMapMetadata;
  it("rotates image points and robot heading together without changing distances", () => {
    const start = slamPixelToDisplay(aligned, slamToPixel(map, 10, -5, 0));
    const end = slamPixelToDisplay(aligned, slamToPixel(map, 11, -5, 0));
    expect(start).toEqual({ x: 70, y: 100, heading: -90 });
    expect(end).toEqual({ x: 70, y: 80, heading: -90 });
    expect(Math.hypot(end.x - start.x, end.y - start.y) * map.resolution).toBe(1);
    expect(map.origin).toEqual([10, -5, 0]);
  });
  it("keeps missing headings unknown and supports maps without presentation", () => {
    const point = slamToPixel(map, 11, -4);
    expect(slamPixelToDisplay(aligned, point).heading).toBeUndefined();
    expect(slamPixelToDisplay(map, point)).toEqual(point);
  });
});
