import type { components } from "./generated/openapi";

export type Priority = components["schemas"]["Priority"];
export type MissionPhase = components["schemas"]["MissionPhase"];
export type MissionOutcome = components["schemas"]["MissionOutcome"];
export type Mission = components["schemas"]["MissionResponse"];
export type MissionRequest = components["schemas"]["MissionRequest"];
export type RobotState = components["schemas"]["RobotState"];
export type Robot = components["schemas"]["RobotResponse"];
export type Seat = components["schemas"]["SeatResponse"];

export interface OperationsEvent {
  schema_version: 1;
  event_id: string;
  event_type: string;
  robot_id: string;
  mission_id: string | null;
  sequence: number;
  occurred_at: string;
  payload: Partial<Mission> & Partial<Robot> & Partial<RobotPoseSnapshot>;
}
export type RobotPose = components["schemas"]["RobotPose"];
export type RobotPoseSnapshot = components["schemas"]["PoseSnapshot"];

export interface ListResponse<T> {
  items: T[];
}

export interface ApiErrorPayload {
  error?: string;
  detail?: string | Array<{ msg: string }>;
}
