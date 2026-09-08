import { describe, expect, it } from "vitest";
import { HOME_POSE, RobotModelMotion } from "./robot-model-motion";

function settle(motion: RobotModelMotion, fps = 60) {
  for (let frame = 0; frame < fps * 3 && motion.animating; frame++) motion.step(1 / fps);
  expect(motion.animating).toBe(false);
}

describe("robot model interaction", () => {
  it("makes a small hover turn, settles, and returns without changing the chosen angle", () => {
    const motion = new RobotModelMotion();
    motion.setHovered(true);
    motion.step(1 / 60);
    expect(motion.pose.yaw).toBeGreaterThan(HOME_POSE.yaw);
    settle(motion);
    expect(motion.pose.yaw - HOME_POSE.yaw).toBeLessThan(Math.PI / 12);
    expect(motion.adjusted).toBe(false);
    motion.setHovered(false);
    settle(motion);
    expect(motion.pose).toEqual(HOME_POSE);
  });

  it("starts a drag from an unfinished hover and preserves the manual angle on release and leave", () => {
    const motion = new RobotModelMotion();
    motion.setHovered(true);
    motion.step(.1);
    const displayed = { ...motion.pose };
    motion.beginDrag();
    expect(motion.pose).toEqual(displayed);
    motion.dragBy(-.6, .12);
    expect(motion.pose.yaw).toBeCloseTo(displayed.yaw - .6);
    const chosen = { ...motion.pose };
    motion.endDrag();
    settle(motion);
    expect(motion.pose).toEqual(chosen);
    motion.setHovered(false);
    settle(motion);
    expect(motion.pose).toEqual(chosen);
    motion.setHovered(true);
    settle(motion);
    motion.setHovered(false);
    settle(motion);
    expect(motion.pose).toEqual(chosen);
  });

  it("does not save a hover angle when a click has no drag", () => {
    const motion = new RobotModelMotion();
    motion.setHovered(true);
    settle(motion);
    motion.beginDrag();
    motion.endDrag();
    motion.setHovered(false);
    settle(motion);
    expect(motion.adjusted).toBe(false);
    expect(motion.pose).toEqual(HOME_POSE);
  });

  it("keeps automatic motion off with reduced motion while allowing direct rotation", () => {
    const motion = new RobotModelMotion();
    motion.setReducedMotion(true);
    motion.setHovered(true);
    expect(motion.pose).toEqual(HOME_POSE);
    expect(motion.animating).toBe(false);
    motion.beginDrag();
    motion.dragBy(.4, .1);
    motion.endDrag();
    expect(motion.adjusted).toBe(true);
    expect(motion.animating).toBe(false);
    motion.reset();
    expect(motion.pose).toEqual(HOME_POSE);
  });

  it("stops an automatic turn when the motion preference changes", () => {
    const motion = new RobotModelMotion();
    motion.setHovered(true);
    motion.step(.1);
    motion.setReducedMotion(true);
    expect(motion.pose).toEqual(HOME_POSE);
    expect(motion.animating).toBe(false);
  });

  it("limits vertical dragging and takes the short way home after full rotations", () => {
    const motion = new RobotModelMotion();
    motion.beginDrag();
    motion.dragBy(8 * Math.PI + .3, 100);
    motion.endDrag();
    expect(motion.pose.elevation).toBeLessThan(Math.PI / 2);
    motion.reset();
    expect(Math.abs(motion.pose.yaw - HOME_POSE.yaw)).toBeLessThan(Math.PI);
    settle(motion);
    expect(motion.pose).toEqual(HOME_POSE);
    motion.rotateBy(0, -100);
    expect(motion.pose.elevation).toBeGreaterThan(0);
  });

  it("uses elapsed time so a hover has the same pace at different refresh rates", () => {
    const slow = new RobotModelMotion(), fast = new RobotModelMotion();
    slow.setHovered(true);
    fast.setHovered(true);
    for (let i = 0; i < 15; i++) slow.step(1 / 30);
    for (let i = 0; i < 60; i++) fast.step(1 / 120);
    expect(slow.pose.yaw).toBeCloseTo(fast.pose.yaw, 8);
    expect(slow.pose.elevation).toBeCloseTo(fast.pose.elevation, 8);
  });
});
