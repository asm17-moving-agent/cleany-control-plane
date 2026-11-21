import { describe, expect, it } from "vitest";
import { clearUnknownPixels } from "./slam-raster";

describe("SLAM display unknown cells", () => {
  it("hides unknown gray, including partly transparent rotated edges", () => {
    const pixels = new Uint8ClampedArray([
      205, 205, 205, 255, 205, 205, 205, 64, 204, 204, 204, 128, 206, 206, 206, 128,
      255, 255, 255, 1,
    ]);
    clearUnknownPixels(pixels);
    expect([...pixels]).toEqual([
      205, 205, 205, 0, 205, 205, 205, 0, 204, 204, 204, 0, 206, 206, 206, 0,
      255, 255, 255, 0,
    ]);
  });

  it("preserves occupied, free, uncertain, colored and already transparent pixels", () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255, 43, 43, 43, 255, 130, 130, 130, 255,
      204, 204, 204, 255, 206, 206, 206, 255, 254, 254, 254, 255,
      205, 180, 205, 255, 0, 0, 0, 0, 130, 130, 130, 64,
    ]);
    const original = pixels.slice();
    clearUnknownPixels(pixels);
    expect(pixels).toEqual(original);
  });
});
