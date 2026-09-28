// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRobotPose } from "./useRobotPose";

let frame: FrameRequestCallback;
let now = 0;
const pose = { x: 1, y: 2, received_at: "2020-01-01T00:00:00Z" };
beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("has no fake position and can initialize a stale last-known position", () => {
  const { result, rerender } = renderHook(
    ({ point, stale }) => useRobotPose(point, stale, true),
    { initialProps: { point: null as typeof pose | null, stale: true } },
  );
  expect(result.current.pose).toBeNull();
  rerender({ point: pose, stale: true });
  expect(result.current.pose).toEqual({ x: 1, y: 2 });
  expect(result.current.stale).toBe(true);
});

it("interpolates, freezes on stale, and snaps large resets", () => {
  const { result, rerender } = renderHook(
    ({ point, stale }) => useRobotPose(point, stale, true),
    { initialProps: { point: pose, stale: false } },
  );
  now = 200;
  rerender({ point: { ...pose, x: 2 }, stale: false });
  now = 300;
  act(() => frame(now));
  expect(result.current.pose?.x).toBe(1.5);
  rerender({ point: { ...pose, x: 2 }, stale: true });
  now = 1000;
  act(() => frame(now));
  expect(result.current.pose?.x).toBe(1.5);
  rerender({ point: { ...pose, x: -5 }, stale: false });
  expect(result.current.pose?.x).toBe(-5);
});
