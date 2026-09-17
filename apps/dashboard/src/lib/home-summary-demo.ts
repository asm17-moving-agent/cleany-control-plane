import type { Mission, Robot } from "../api/types";

// Display-only fixtures; never sent to the mission API.
const demoRobots: Robot[] = [
  { robot_id: "cleany-02", state: "ERROR", active_mission_id: null, last_seen_at: "2026-09-08T12:00:00Z" },
  { robot_id: "cleany-03", state: "OFFLINE", active_mission_id: null, last_seen_at: "2026-09-08T11:58:00Z" },
];
function mission(seat: string, phase: Mission["phase"], outcome: Mission["outcome"], minutes: number): Mission {
  return { mission_id: `demo-${seat}`, target: { kind: "SEAT", reference_id: `seat-${seat}`, label: `D-HUB · ${seat}번 좌석` },
    seat_id: `seat-${seat}`, phase, outcome, priority: "NORMAL", requested_by: "display-demo",
    idempotency_key: `display-only-${seat}`, sequence: 1, cancel_requested: false,
    created_at: new Date(Date.UTC(2026, 8, 8, 12, minutes)).toISOString(), message: "화면 검토용 데모",
    before_observation: null, after_observation: null };
}
const demoMissions = [
  mission("12", "WORKING", null, 0),
  mission("18", "QUEUED", null, 1), mission("24", "QUEUED", null, 2),
  mission("07", "TERMINAL", "HUMAN_REVIEW_REQUIRED", -2),
  mission("21", "TERMINAL", "PARTIAL_SUCCESS", -4),
  mission("03", "TERMINAL", "SUCCESS", -6), mission("09", "TERMINAL", "SUCCESS", -8),
];
export const homeSummaryDemo = { robots: demoRobots, missions: demoMissions };
