import type { Seat } from "../api/types";

export type CleaningState = "ready" | "waiting" | "working" | "review" | "unknown";
export type SeatFilter = "occupied" | "vacant" | CleaningState;
export const cleaningLabels: Record<CleaningState, string> = {
  ready: "정리 완료", waiting: "정리 대기", working: "작업 중", review: "확인 필요", unknown: "미확인",
};
export interface SeatSnapshot { seat: Seat; cleaning: CleaningState | null; }
// Demo uses only real mapped seat IDs. Never infer current cleanliness from mission history.
export function seatSnapshots(seats: Seat[], demo: boolean): SeatSnapshot[] {
  const sorted = [...seats].sort((a, b) => a.row - b.row || a.grid_column - b.grid_column);
  const occupiedCount = Math.round(sorted.length * .37);
  const vacantCount = sorted.length - occupiedCount;
  return sorted.map((seat, index) => {
    if (!demo) return { seat, cleaning: null };
    const vacantIndex = index - occupiedCount;
    const occupied = vacantIndex < 0;
    const cleaning: CleaningState = vacantIndex === 0 ? "unknown" : vacantIndex <= 2 ? "review" : vacantIndex === 3 ? "working" : vacantIndex < 4 + Math.round(vacantCount * .25) ? "waiting" : "ready";
    return { seat: { ...seat, occupancy: occupied ? "OCCUPIED" : "AVAILABLE" }, cleaning: occupied ? null : cleaning };
  });
}
export function matchesSeatFilter(row: SeatSnapshot, filter: SeatFilter): boolean {
  if (filter === "occupied") return row.seat.occupancy === "OCCUPIED";
  if (filter === "vacant") return row.seat.occupancy === "AVAILABLE";
  return row.seat.occupancy === "AVAILABLE" && row.cleaning === filter;
}
