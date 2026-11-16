/** Display-only café snapshot. Never merge these values into OperationsContext or command payloads. */
export type HomeScenario = "normal" | "attention";
export interface OccupancyInterval { startMinute: number; endMinute: number; occupied: number; capacity: number; }
export const workTypes = ["쓰레기 수거", "의자 정리", "책상 정리"] as const;
export interface WorkCompletion { minute: number; type: typeof workTypes[number]; }
export interface HomeSnapshot {
  source: "mock"; siteId: string; day: string; asOfMinute: number; capacity: number;
  cleaning: { complete: number; working: number; needed: number };
  occupancy: OccupancyInterval[]; completions: WorkCompletion[];
  robot: { battery: number; connected: boolean; currentTask: string | null };
  reviewCount: number;
}
export function averageOccupancy(intervals: OccupancyInterval[]): number | null {
  const minutes = intervals.reduce((sum, item) => sum + Math.max(0, item.endMinute - item.startMinute), 0);
  if (!minutes) return null;
  return intervals.reduce((sum, item) => sum + (item.capacity ? item.occupied / item.capacity : 0) * Math.max(0, item.endMinute - item.startMinute), 0) / minutes * 100;
}
export function completedByType(completions: WorkCompletion[], asOfMinute: number) {
  return workTypes.map(type => ({ type, count: completions.filter(item => item.type === type && item.minute >= 0 && item.minute <= asOfMinute).length }));
}
export function minuteLabel(minute: number) { return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(Math.floor(minute % 60)).padStart(2, "0")}`; }
const occupiedByHour = [24, 18, 12, 8, 6, 7, 12, 20, 29, 38, 46, 52, 44, 48, 56, 61, 65, 69, 63, 58, 52, 46, 39, 31];
export function getHomeSnapshot(siteId: string, now: Date, scenario: HomeScenario): HomeSnapshot | null {
  if (siteId !== "BUSAN_SOMA_18F") return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  const asOfMinute = Number(parts.hour) * 60 + Number(parts.minute);
  const occupancy = occupiedByHour.flatMap((occupied, hour) => hour * 60 < asOfMinute ? [{ startMinute: hour * 60, endMinute: Math.min((hour + 1) * 60, asOfMinute), occupied, capacity: 82 }] : []);
  const completions = Array.from({ length: 72 }, (_, index) => ({ minute: 10 + index * 20, type: workTypes[([0, 1, 0, 2, 0, 1] as const)[index % 6]] })).filter(item => item.minute <= asOfMinute);
  return { source: "mock", siteId, day: `${parts.year}-${parts.month}-${parts.day}`, asOfMinute, capacity: 82,
    cleaning: scenario === "attention" ? { complete: 64, working: 0, needed: 18 } : { complete: 64, working: 1, needed: 17 },
    occupancy, completions, robot: { battery: scenario === "attention" ? 18 : 76, connected: scenario !== "attention", currentTask: scenario === "attention" ? null : "12번 좌석 · 쓰레기 수거" }, reviewCount: scenario === "attention" ? 2 : 0 };
}
