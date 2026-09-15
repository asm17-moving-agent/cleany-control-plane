import type { Mission, Robot, Seat } from "../api/types";
import { homeSummaryDemo } from "../lib/home-summary-demo";
import type { CleaningState, SeatCleaningStates } from "../lib/seat-summary";

// Fixed, display-only inventory matching the known 18F map. No occupant identities.
const columns = [1, 2, 3, 5, 6, 8, 9, 10] as const;
const seats: Seat[] = Array.from({ length: 48 }, (_, index) => ({
  seat_id: `seat-${String(index + 1).padStart(2, "0")}`,
  label: String(index + 1).padStart(2, "0"), zone_id: "d-hub",
  row: Math.floor(index / 8) + 1, grid_column: columns[index % 8],
  occupancy: "AVAILABLE", occupant_name: null,
}));
for (const [room, width] of [["a1", 2], ["a2", 2], ["a3", 2], ["a4", 2], ["m1", 3], ["m2", 3], ["m3", 3]] as const) {
  for (let number = 1; number <= width * 2; number++) {
    const suffix = String(number).padStart(2, "0");
    seats.push({ seat_id: `seat-${room}-${suffix}`, label: `${room.toUpperCase()}-${suffix}`,
      zone_id: `space-${room}`, row: Math.floor((number - 1) / width) + 1,
      grid_column: columns[(number - 1) % width], occupancy: "AVAILABLE", occupant_name: null });
  }
}

// Current display-only snapshot, separate from historical mission outcomes.
const occupiedSeatIds = new Set([
  "seat-01", "seat-04", "seat-10", "seat-13", "seat-16", "seat-19", "seat-22",
  "seat-25", "seat-28", "seat-31", "seat-34", "seat-37", "seat-40", "seat-43", "seat-46",
  "seat-a2-02", "seat-a4-03", "seat-m1-02", "seat-m3-05",
]);
const scheduledSeatIds = new Set([
  "seat-07", "seat-08", "seat-14", "seat-18", "seat-21", "seat-24", "seat-26",
  "seat-32", "seat-38", "seat-44", "seat-a1-01", "seat-a1-04", "seat-a3-02",
  "seat-m1-05", "seat-m2-04", "seat-m3-02",
]);
const cleaningSnapshot: Record<string, CleaningState> = {};
for (const seat of seats) {
  if (occupiedSeatIds.has(seat.seat_id)) {
    seat.occupancy = "OCCUPIED";
  } else {
    cleaningSnapshot[seat.seat_id] = seat.seat_id === "seat-12" ? "working"
      : scheduledSeatIds.has(seat.seat_id) ? "waiting" : "ready";
  }
}
const seatCleaning: SeatCleaningStates = cleaningSnapshot;

const photos = "/demo/observations/desk";
const missions: Mission[] = homeSummaryDemo.missions.map((mission, index) => ({
  ...mission, requested_by: "운영자 (예시)",
  priority: mission.seat_id === "seat-18" ? "HIGH" : "NORMAL",
  created_at: new Date(Date.UTC(2026, 8, 10, 5, 32 - index * 4)).toISOString(),
  before_observation: mission.phase === "TERMINAL" ? `${photos}-before.png` : null,
  after_observation: mission.phase === "TERMINAL" ? `${photos}-after-${mission.outcome === "SUCCESS" ? "complete" : "review"}.png` : null,
  message: mission.phase !== "TERMINAL" ? "화면 확인용 예시 요청입니다."
    : mission.outcome === "SUCCESS" ? "예시: 책상 위 물체 정리가 완료되었습니다."
    : "예시: 컵과 휴지는 처리했으며, 남은 수첩은 사람이 확인해야 합니다.",
}));
// Include room seats so cross-page targets can be checked as well as D-HUB seats.
for (const [id, seatId, label] of [["demo-24", "seat-a1-01", "SPACE A1 · A11번 좌석"], ["demo-09", "seat-m2-01", "SPACE M2 · M21번 좌석"]]) {
  const mission = missions.find(item => item.mission_id === id)!;
  mission.seat_id = seatId;
  mission.target = { kind: "SEAT", reference_id: seatId, label };
}
const robots: Robot[] = [
  { robot_id: "cleany-01", state: "BUSY", active_mission_id: "demo-12", last_seen_at: "2026-09-10T05:32:00Z" },
  { robot_id: "cleany-02", state: "ERROR", active_mission_id: null, last_seen_at: "2026-09-10T05:32:00Z" },
  { robot_id: "cleany-03", state: "OFFLINE", active_mission_id: null, last_seen_at: "2026-09-10T05:27:00Z" },
];

export const operationsDemo = { seats, seatCleaning, missions, robots };
