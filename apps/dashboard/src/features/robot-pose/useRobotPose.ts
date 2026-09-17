import { useEffect, useRef, useState } from "react";
import type { RobotPose } from "../../api/types";
import { samplePose, poseDistance, POSE_INTERPOLATION_MS, POSE_SNAP_DISTANCE, type MapPose, type PoseSample } from "./robot-pose";

interface PoseState { pose: MapPose | null; stale: boolean; connected: boolean; }

/** Interpolates on local receipt time; server timestamps are ordering metadata only. */
export function useRobotPose(pose: RobotPose | null, poseStale: boolean, connected: boolean): PoseState {
  const samples = useRef<PoseSample[]>([]);
  const rendered = useRef<MapPose | null>(null);
  const [current, setCurrent] = useState<MapPose | null>(null);
  useEffect(() => {
    if (!pose) return;
    const next = { x: pose.x, y: pose.y };
    if (!rendered.current || poseStale || poseDistance(rendered.current, next) > POSE_SNAP_DISTANCE) {
      samples.current = [{ pose: next, received: performance.now() }];
      // A stale snapshot can initialize a reload, but cannot move an existing marker.
      if (!rendered.current || !poseStale) {
        rendered.current = next;
        setCurrent(next);
      }
      return;
    }
    samples.current = [...samples.current, { pose: next, received: performance.now() }].slice(-3);
  }, [pose, poseStale]);
  useEffect(() => {
    let frame = 0;
    const render = () => {
      if (poseStale) {
        frame = requestAnimationFrame(render);
        return;
      }
      const now = performance.now() - POSE_INTERPOLATION_MS;
      const next = samplePose(samples.current, now);
      if (next && (next.x !== rendered.current?.x || next.y !== rendered.current?.y)) {
        rendered.current = next;
        setCurrent(next);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [poseStale]);
  return { pose: current, stale: poseStale, connected };
}
