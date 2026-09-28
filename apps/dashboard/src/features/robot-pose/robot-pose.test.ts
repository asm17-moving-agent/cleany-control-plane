import { describe, expect, it } from "vitest";
import { interpolatePose, poseDistance, samplePose, validPose, validPoseSnapshot } from "./robot-pose";

describe("robot pose contract", () => {
  it("accepts finite coordinates and a receive timestamp only", () => {
    expect(validPose({ x: 1, y: -2, received_at: "2026-09-18T00:00:00Z" })).toBe(true);
    expect(validPose({ x: Infinity, y: 0, received_at: "2026-09-18T00:00:00Z" })).toBe(false);
    expect(validPose({ x: 1, y: 2 })).toBe(false);
  });
  it("interpolates without extrapolating", () => {
    expect(interpolatePose({ x: 0, y: 0 }, { x: 10, y: 20 }, 2)).toEqual({ x: 10, y: 20 });
    expect(poseDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it("interpolates yaw across the short arc and hides unavailable orientation", () => {
    const result = interpolatePose({ x: 1, y: 2, yaw: 179 * Math.PI / 180 },
      { x: 1, y: 2, yaw: -179 * Math.PI / 180 }, .5);
    expect(result.yaw).toBeCloseTo(Math.PI);
    expect(interpolatePose(result, { x: 1, y: 2, yaw: null }, .5).yaw).toBeUndefined();
    expect(validPose({ x: 1, y: 2, yaw: Infinity, received_at: "2026-09-18T00:00:00Z" })).toBe(false);
  });
  it("uses adjacent samples through a turn and holds endpoints", () => {
    const samples = [
      { pose: { x: 0, y: 0 }, received: 0 },
      { pose: { x: 1, y: 0 }, received: 200 },
      { pose: { x: 1, y: 1 }, received: 400 },
    ];
    expect(samplePose(samples, 100)).toEqual({ x: 0.5, y: 0 });
    expect(samplePose(samples, 300)).toEqual({ x: 1, y: 0.5 });
    expect(samplePose(samples, 1000)).toEqual({ x: 1, y: 1 });
    expect(samplePose(samples, -100)).toEqual({ x: 0, y: 0 });
    expect(samplePose([], 0)).toBeNull();
  });
  it("requires a valid snapshot and never calls a missing pose fresh", () => {
    expect(validPoseSnapshot({ pose: null, stale: true })).toBe(true);
    expect(validPoseSnapshot({ pose: null, stale: false })).toBe(false);
    expect(validPoseSnapshot({ pose: { x: 1, y: 2, received_at: "invalid" }, stale: false })).toBe(false);
  });
});
