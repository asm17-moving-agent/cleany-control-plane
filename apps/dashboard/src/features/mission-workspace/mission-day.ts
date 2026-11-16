import type { Mission } from "../../api/types";
import { needsResultReview } from "../../lib/home-summary";

export function dayKey(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function validDay(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayKey(`${value}T12:00:00+09:00`) === value;
}
export function shiftDay(day: string, count: number) {
  const date = new Date(`${day}T12:00:00+09:00`); date.setUTCDate(date.getUTCDate() + count); return dayKey(date);
}
export function missionDay(mission: Mission) { return dayKey(mission.finished_at || mission.created_at); }
export function onMissionDay(mission: Mission, day: string, today: string) {
  return dayKey(mission.created_at) === day || (!!mission.finished_at && dayKey(mission.finished_at) === day)
    || (day === today && mission.phase !== "TERMINAL" && dayKey(mission.created_at) < day);
}
export const taskFilters = [
  ["ALL", "전체"], ["ACTIVE", "진행 중"], ["QUEUED", "대기"], ["SUCCESS", "완료"],
  ["FAILED", "실패"], ["REVIEW", "확인 필요"], ["TERMINAL", "종료 전체"],
] as const;
export type TaskFilter = typeof taskFilters[number][0];
export function matchesTask(mission: Mission, filter: TaskFilter) {
  switch (filter) {
    case "ALL": return true;
    case "ACTIVE": return !["QUEUED", "TERMINAL"].includes(mission.phase);
    case "QUEUED": return mission.phase === "QUEUED";
    case "SUCCESS": return mission.phase === "TERMINAL" && mission.outcome === "SUCCESS";
    case "FAILED": return mission.phase === "TERMINAL" && ["FAILED", "BLOCKED", "REJECTED", "EXPIRED", "INTERRUPTED"].includes(mission.outcome ?? "");
    case "REVIEW": return needsResultReview(mission);
    case "TERMINAL": return mission.phase === "TERMINAL";
  }
}
export function sortTasks(missions: Mission[]) {
  const rank = (m: Mission) => matchesTask(m, "ACTIVE") ? 0 : needsResultReview(m) ? 1 : m.phase === "QUEUED" ? 2 : 3;
  return [...missions].sort((a,b) => rank(a)-rank(b) || b.created_at.localeCompare(a.created_at) || b.mission_id.localeCompare(a.mission_id));
}
export function clockLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
