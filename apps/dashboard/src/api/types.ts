export type Priority = "NORMAL" | "HIGH";

export type MissionPhase =
  | "QUEUED"
  | "OFFERED"
  | "ACCEPTED"
  | "NAVIGATING"
  | "WORKING"
  | "RETURNING"
  | "TERMINAL";

export type MissionOutcome =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "HUMAN_REVIEW_REQUIRED"
  | "BLOCKED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REJECTED"
  | "INTERRUPTED";

export interface Mission {
  mission_id: string;
  seat_id: string;
  priority: Priority;
  requested_by: string;
  idempotency_key: string;
  created_at: string;
  phase: MissionPhase;
  outcome: MissionOutcome | null;
  message: string;
  sequence: number;
  cancel_requested: boolean;
  before_observation: string | null;
  after_observation: string | null;
}

export interface MissionRequest {
  seat_id: string;
  priority: Priority;
  requested_by: string;
  idempotency_key: string;
}

export type RobotState = "OFFLINE" | "IDLE" | "BUSY" | "ERROR";

export interface Robot {
  robot_id: string;
  state: RobotState;
  active_mission_id: string | null;
  last_seen_at: string;
}

export interface Seat {
  seat_id: string;
  label: string;
  row: number;
  grid_column: 1 | 2 | 3 | 5 | 6 | 8 | 9 | 10;
  occupancy: "AVAILABLE" | "OCCUPIED";
  occupant_name: string | null;
}

export interface OperationsEvent {
  schema_version: 1;
  event_id: string;
  event_type: string;
  robot_id: string;
  mission_id: string | null;
  sequence: number;
  occurred_at: string;
  payload: Partial<Mission> & Partial<Robot>;
}

export interface ListResponse<T> {
  items: T[];
}

export interface ApiErrorPayload {
  error?: string;
  detail?: string | Array<{ msg: string }>;
}
