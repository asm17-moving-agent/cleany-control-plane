import type { Seat } from "../api/types";
import { ROOM_TABLES, seatMapPosition } from "../features/facility-map/seat-layout";

export type RecordingPoint = { x: number; y: number };
export type RecordingPath = { points: RecordingPoint[]; returning: boolean; progress: number };
export const RECORDING_HOME = { x: 805, y: 365 };
export const RECORDING_TIMING = { tick: 50, offered: 500, accepted: 1000, working: 4000, speed: 27.5, turnRate: 40 };

// Hand-authored screen-space aisles for filming, not robot navigation coordinates.
function recordingWaypoints(seat: Seat, start: RecordingPoint): RecordingPoint[] {
  const point = seatMapPosition(seat);
  if (!point) throw new Error("촬영 경로가 없는 좌석입니다.");
  if (seat.zone_id === "d-hub") {
    const aisle = point.x < 750 ? 721 : 834;
    const approach = { x: point.x, y: point.y + (seat.row % 2 ? -30 : 30) };
    return [start, { x: start.x, y: 365 }, { x: aisle, y: 365 }, { x: aisle, y: approach.y }, approach];
  }
  const room = ROOM_TABLES.find(room => room.id === seat.zone_id)!;
  const common = [start, { x: start.x, y: 390 }, { x: 590, y: 390 }, { x: 590, y: 435 }, { x: 400, y: 435 }];
  if (room.vertical) {
    const doorwayY = room.id === "space-a1" ? 340 : room.id === "space-a2" ? 290 : 194;
    const approach = { x: point.x + (seat.row === 1 ? 30 : -30), y: point.y };
    const entryX = seat.row === 1 ? 114 : 30;
    return [...common, { x: 180, y: 435 }, { x: 180, y: doorwayY }, { x: 120, y: doorwayY },
      { x: 120, y: room.y + 45 }, { x: entryX, y: room.y + 45 }, { x: entryX, y: approach.y }, approach];
  }
  const doorX = room.id === "space-a4" ? 142 : room.id === "space-m1" ? 210 : room.id === "space-m2" ? 338 : 468;
  const approach = { x: point.x, y: point.y + (seat.row === 1 ? -28 : 28) };
  const aisleX = room.x - (room.columns === 3 ? 70 : 53);
  return [...common, { x: 400, y: 200 }, { x: doorX, y: 200 }, { x: doorX, y: 130 },
    { x: aisleX, y: 130 }, { x: aisleX, y: approach.y }, approach];
}
export function recordingRoute(seat: Seat, start: RecordingPoint = RECORDING_HOME): RecordingPoint[] {
  const points = recordingWaypoints(seat, start).filter((p, i, all) => !i || Math.hypot(p.x - all[i - 1].x, p.y - all[i - 1].y) > .01);
  const smooth = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / 12));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      // Small deterministic corrections, tapering to zero at aisle corners.
      const offset = Math.min(2.5, length / 40) * Math.sin(Math.PI * t) * Math.sin(3 * Math.PI * t + i);
      smooth.push(j === steps ? b : { x: a.x + (b.x - a.x) * t - (b.y - a.y) / length * offset,
        y: a.y + (b.y - a.y) * t + (b.x - a.x) / length * offset });
    }
  }
  return smooth;
}
const heading = (a: RecordingPoint, b: RecordingPoint) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const angleDelta = (a: number, b: number) => ((b - a + 540) % 360) - 180;
export function routeMotion(points: RecordingPoint[], elapsed = Infinity) {
  let duration = 0, distance = 0;
  let previous = heading(points[0], points[1] ?? points[0]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], direction = heading(a, b);
    const delta = angleDelta(previous, direction);
    const turn = Math.abs(delta) > 35 ? Math.abs(delta) / RECORDING_TIMING.turnRate * 1000 : 0;
    if (elapsed < duration + turn) return { position: a, heading: previous + delta * (elapsed - duration) / turn, duration, progress: distance / routeLength(points) };
    duration += turn;
    const length = Math.hypot(b.x - a.x, b.y - a.y), travel = length / RECORDING_TIMING.speed * 1000;
    if (elapsed < duration + travel) {
      const t = Math.max(0, (elapsed - duration) / travel);
      return { position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, heading: direction, duration,
        progress: (distance + length * t) / routeLength(points) };
    }
    duration += travel; distance += length; previous = direction;
  }
  return { position: points[points.length - 1], heading: previous, duration, progress: 1 };
}
export function routeLength(points: RecordingPoint[]) {
  return points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y), 0);
}
export function pointOnRoute(points: RecordingPoint[], progress: number): RecordingPoint {
  let remaining = routeLength(points) * Math.max(0, Math.min(1, progress));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 0 && remaining <= length) return { x: a.x + (b.x - a.x) * remaining / length, y: a.y + (b.y - a.y) * remaining / length };
    remaining -= length;
  }
  return points[points.length - 1];
}
