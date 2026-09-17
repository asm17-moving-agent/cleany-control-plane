import type { RobotPose, RobotPoseSnapshot } from "../../api/types";

export interface MapPose {
  x: number;
  y: number;
}

function positiveSetting(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
export const POSE_INTERPOLATION_MS = positiveSetting(import.meta.env.VITE_POSE_INTERPOLATION_MS, 200);
export const POSE_STALE_TIMEOUT_MS = positiveSetting(import.meta.env.VITE_POSE_STALE_TIMEOUT_MS, 1500);
export const POSE_SNAP_DISTANCE = positiveSetting(import.meta.env.VITE_POSE_SNAP_DISTANCE, 2);

export function validPose(value: unknown): value is RobotPose {
  if (!value || typeof value !== "object") return false;
  const pose = value as Record<string, unknown>;
  return Number.isFinite(pose.x) && Number.isFinite(pose.y)
    && typeof pose.received_at === "string" && Number.isFinite(Date.parse(pose.received_at));
}

export function validPoseSnapshot(value: unknown): value is RobotPoseSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.stale === "boolean"
    && (validPose(snapshot.pose) || (snapshot.pose === null && snapshot.stale));
}

export interface PoseSample { pose: MapPose; received: number; }

export function samplePose(samples: PoseSample[], time: number): MapPose | null {
  if (!samples.length) return null;
  const before = [...samples].reverse().find(sample => sample.received <= time);
  const after = samples.find(sample => sample.received > time);
  return before && after
    ? interpolatePose(before.pose, after.pose, (time - before.received) / (after.received - before.received))
    : before?.pose ?? samples[0].pose;
}

export function interpolatePose(from: MapPose, to: MapPose, amount: number): MapPose {
  const t = Math.max(0, Math.min(1, amount));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function poseDistance(from: MapPose, to: MapPose): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
