import { describe, expect, it } from "vitest";
import { panMapCamera, resolveMapCamera, zoomMapCamera } from "./map-camera";

const full = { x: 0, y: 0, width: 1600, height: 900 };
const active = { x: 20, y: 10, width: 1200, height: 600 };
describe("map camera geometry", () => {
  it.each([{ width: 1600, height: 900 }, { width: 900, height: 600 }])("fits active seats outside the left overlay in %o", frame => {
    const camera = resolveMapCamera({ mode: "initial" }, frame, full, active, 320);
    const left = frame.width / 2 + (active.x - camera.centerX) * camera.scale;
    const top = frame.height / 2 + (active.y - camera.centerY) * camera.scale;
    expect(left).toBeGreaterThanOrEqual(320 + 16 - .00001);
    expect(left + active.width * camera.scale).toBeLessThanOrEqual(frame.width - 16 + .00001);
    expect(top).toBeCloseTo(16);
    expect(top + active.height * camera.scale).toBeLessThanOrEqual(frame.height - 16 + .00001);
  });
  it("limits manual zoom and prevents panning past the map edge", () => {
    const frame = { width: 1000, height: 600 };
    const camera = resolveMapCamera({ mode: "manual", zoom: 2, x: -1000, y: 5000 }, frame, full, active);
    expect(camera.centerX * camera.scale).toBeCloseTo(frame.width / 2);
    expect((full.height - camera.centerY) * camera.scale).toBeCloseTo(frame.height / 2);
    expect(zoomMapCamera(camera, 100)).toMatchObject({ zoom: 4 });
    expect(zoomMapCamera(camera, .01)).toMatchObject({ zoom: 1 });
    const panned = panMapCamera(camera, { x: 800, y: 450 }, { x: camera.scale * 100, y: camera.scale * -50 }, full);
    expect(panned).toMatchObject({ x: 700, y: 500, zoom: 2 });
  });
});
