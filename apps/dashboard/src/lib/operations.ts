import type { Mission, MissionPhase, Seat } from "../api/types";

export const DISPLAY_GRID_COLUMNS = [1, 2, 3, 5, 6, 8, 9, 10] as const;
export const DISPLAY_GRID_ROWS = [2, 3, 5, 6, 8, 9] as const;
export const SEAT_COLUMN_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export function seatDisplayLabel(seat: Seat) {
  return seat.label.replace(/^([AM][1-4])-0([1-6])$/, "$1$2");
}

export function seatZoneLabel(seat: Seat) {
  return !seat.zone_id || seat.zone_id === "d-hub" ? "D-HUB" : seat.zone_id.replace("space-", "SPACE ").toUpperCase();
}
export function seatOccupancyLabel(seat: Seat) {
  return seat.occupancy === "OCCUPIED" ? "사용 중" : seat.occupancy === "AVAILABLE" ? "비어 있음" : "점유 미확인";
}

export function seatPosition(seat: Seat) {
  if (seat.zone_id && seat.zone_id !== "d-hub") return { column: seat.grid_column, row: seat.row, gridRow: seat.row };
  const index = Number.parseInt(seat.label, 10) - 1;
  return {
    column: DISPLAY_GRID_COLUMNS[index % DISPLAY_GRID_COLUMNS.length],
    row: Math.floor(index / DISPLAY_GRID_COLUMNS.length) + 1,
    gridRow: DISPLAY_GRID_ROWS[Math.floor(index / DISPLAY_GRID_COLUMNS.length)],
  };
}

export function seatLocation(seat: Seat) {
  if (seat.zone_id && seat.zone_id !== "d-hub") return seatDisplayLabel(seat);
  const index = Number.parseInt(seat.label, 10) - 1;
  return `${SEAT_COLUMN_LABELS[index % SEAT_COLUMN_LABELS.length]}-${seatPosition(seat).row}`;
}

export function seatLabel(seats: Seat[], seatId: string | null | undefined) {
  if (!seatId) return "대상 미지정";
  const seat = seats.find((item) => item.seat_id === seatId);
  return seat ? `${seatDisplayLabel(seat)}번 좌석` : seatId;
}

export function missionTargetLabel(mission: Mission, seats: Seat[]) {
  if (mission.target.label) return mission.target.label;
  if (mission.target.kind === "SEAT") return seatLabel(seats, mission.target.reference_id);
  return mission.target.reference_id;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function missionTone(mission: Mission) {
  if (mission.outcome === "SUCCESS") return "success";
  if (["FAILED", "BLOCKED", "REJECTED", "INTERRUPTED"].includes(mission.outcome ?? "")) {
    return "danger";
  }
  if (mission.outcome) return "warning";
  return ["ACCEPTED", "NAVIGATING", "WORKING", "RETURNING"].includes(mission.phase)
    ? "info"
    : "warning";
}

export function missionProgress(phase: MissionPhase) {
  return {
    QUEUED: 8,
    OFFERED: 20,
    ACCEPTED: 30,
    NAVIGATING: 48,
    WORKING: 68,
    RETURNING: 86,
    TERMINAL: 100,
  }[phase];
}
