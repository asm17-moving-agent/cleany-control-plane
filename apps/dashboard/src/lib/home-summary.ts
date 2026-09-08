import type { Mission, MissionOutcome, Robot, RobotState } from "../api/types";

export const robotStateLabels: Record<RobotState, string> = {
  OFFLINE: "연결 끊김", IDLE: "대기", BUSY: "작업 중", ERROR: "확인 필요",
};
export const outcomeLabels: Record<MissionOutcome, string> = {
  SUCCESS: "완료", PARTIAL_SUCCESS: "부분 완료", HUMAN_REVIEW_REQUIRED: "사람 확인 필요",
  BLOCKED: "작업 차단", FAILED: "실패", CANCELLED: "취소", EXPIRED: "만료",
  REJECTED: "거절", INTERRUPTED: "중단",
};
const reviewOutcomes = new Set<MissionOutcome>([
  "HUMAN_REVIEW_REQUIRED", "PARTIAL_SUCCESS", "BLOCKED", "FAILED", "INTERRUPTED",
]);
export function needsRobotAttention(robot: Robot) {
  return robot.state === "ERROR" || robot.state === "OFFLINE";
}
export function needsResultReview(mission: Mission) {
  return mission.phase === "TERMINAL" && mission.outcome !== null && reviewOutcomes.has(mission.outcome);
}
export function isSuccessfulResult(mission: Mission) {
  return mission.phase === "TERMINAL" && mission.outcome === "SUCCESS";
}
export function byNewestRequest(missions: Mission[]) {
  return [...missions].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export function getHomeSummary(robots: Robot[], missions: Mission[]) {
  return {
    attention: robots.filter(needsRobotAttention),
    active: missions.filter(({ phase }) => phase !== "QUEUED" && phase !== "TERMINAL"),
    queued: missions.filter(({ phase }) => phase === "QUEUED"),
    review: byNewestRequest(missions.filter(needsResultReview)),
    successes: byNewestRequest(missions.filter(isSuccessfulResult)),
  };
}
// Observation references may be opaque identifiers (including mock://), not image URLs.
export function observationHref(reference: string | null | undefined) {
  if (!reference) return null;
  if (reference.startsWith("/") && !reference.startsWith("//") && !reference.includes("\\")) return reference;
  try {
    const url = new URL(reference);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
