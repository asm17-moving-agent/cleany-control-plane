import type { Mission } from "../../api/types";
import { dayKey } from "./mission-day";

/** Date-relative, display-only examples. Never substitute these values into the live provider. */
export function workspaceDemo(missions: Mission[], now: Date): Mission[] {
  const start = Date.parse(`${dayKey(now)}T00:00:00+09:00`);
  const samples = missions.map((mission, index) => {
    const created = Math.max(start, now.getTime() - (20 + index * 4) * 60_000);
    const terminal = mission.phase === "TERMINAL";
    return { ...mission, created_at: new Date(created).toISOString(),
      accepted_at: mission.phase === "QUEUED" ? null : new Date(Math.min(now.getTime(), created + 60_000)).toISOString(),
      finished_at: terminal ? new Date(Math.min(now.getTime(), created + 10 * 60_000)).toISOString() : null,
      robot_id: mission.phase === "QUEUED" ? null : "cleany-01", review: null,
      completed_tasks: terminal ? ["쓰레기 수거"] : [],
      skipped_tasks: mission.outcome === "PARTIAL_SUCCESS" ? ["소지품 확인"] : [],
      needs_human_review: ["HUMAN_REVIEW_REQUIRED", "PARTIAL_SUCCESS"].includes(mission.outcome ?? ""),
    };
  });
  const source = samples.find(m => m.phase === "TERMINAL");
  if (!source) return samples;
  return [...samples, { ...source, mission_id: "sample-yesterday-failed", outcome: "FAILED", failure_code: "NAVIGATION_BLOCKED",
    message: "좌석으로 이동하는 경로가 막혀 작업을 종료했습니다.", completed_tasks: [], skipped_tasks: ["책상 정리"],
    before_observation: null, after_observation: null,
    created_at: new Date(start - 60 * 60_000).toISOString(), accepted_at: new Date(start - 59 * 60_000).toISOString(),
    finished_at: new Date(start - 50 * 60_000).toISOString() }];
}
