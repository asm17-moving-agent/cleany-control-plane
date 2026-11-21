import type { components } from "../../api/generated/openapi";
import { displayToSlam, slamPixelToDisplay, slamToPixel, type SlamMapMetadata } from "./slam-map";

export type Layout = components["schemas"]["SeatLayout"];
export type LayoutSeat = components["schemas"]["LayoutSeat"];
export type Pose = components["schemas"]["MetricPose"];
export type EditorMode = "seats" | "approaches" | "home";
export type Point = { x: number; y: number };
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
export const projectPose = (map: SlamMapMetadata, pose: Pose) => slamPixelToDisplay(map, slamToPixel(map, pose.x, pose.y, pose.yaw));
export const displayRotation = (map: SlamMapMetadata, pose: Pose) => wrapAngle(((projectPose(map, pose).heading ?? 0) - 90) * Math.PI / 180) * 180 / Math.PI;
export const invalidateLayout = (layout: Layout): Layout => ({ ...layout, home_verified: false, verification_evidence: null });

export function moveLayoutSeats(layout: Layout, ids: string[], dx: number, dy: number): Layout {
  return invalidateLayout({ ...layout, seats: layout.seats.map(seat => ids.includes(seat.seat_id) ? {
    ...seat, verification: "draft", pose: { ...seat.pose, x: seat.pose.x + dx, y: seat.pose.y + dy },
    approach: { ...seat.approach, x: seat.approach.x + dx, y: seat.approach.y + dy },
  } : seat) });
}
export function rotateLayoutSeats(layout: Layout, ids: string[], radians: number, pivot?: Point): Layout {
  const entries = layout.seats.filter(seat => ids.includes(seat.seat_id));
  if (!entries.length) return layout;
  const center = pivot ?? entries.reduce((p, s) => ({ x: p.x + s.pose.x / entries.length, y: p.y + s.pose.y / entries.length }), { x: 0, y: 0 });
  const rotate = (pose: Pose) => ({ x: center.x + Math.cos(radians) * (pose.x - center.x) - Math.sin(radians) * (pose.y - center.y),
    y: center.y + Math.sin(radians) * (pose.x - center.x) + Math.cos(radians) * (pose.y - center.y), yaw: wrapAngle(pose.yaw + radians) });
  return invalidateLayout({ ...layout, seats: layout.seats.map(seat => ids.includes(seat.seat_id) ?
    { ...seat, pose: rotate(seat.pose), approach: rotate(seat.approach), verification: "draft" } : seat) });
}
export function updateApproaches(layout: Layout, ids: string[], delta: Partial<Pose>): Layout {
  return invalidateLayout({ ...layout, seats: layout.seats.map(seat => ids.includes(seat.seat_id) ? {
    ...seat, verification: "draft", approach: { x: seat.approach.x + (delta.x ?? 0), y: seat.approach.y + (delta.y ?? 0), yaw: wrapAngle(seat.approach.yaw + (delta.yaw ?? 0)) },
  } : seat) });
}
export function selectedSeats(layout: Layout, id: string, current: string[], additive: boolean, grouped: boolean) {
  const seat = layout.seats.find(s => s.seat_id === id);
  const ids = grouped && seat ? layout.seats.filter(s => s.table_id === seat.table_id).map(s => s.seat_id) : [id];
  if (!additive) return current.includes(id) ? current : ids;
  return ids.every(key => current.includes(key)) ? current.filter(key => !ids.includes(key)) : [...new Set([...current, ...ids])];
}
export function seatBounds(map: SlamMapMetadata, seat: LayoutSeat) {
  const p = projectPose(map, seat.pose), angle = (p.heading ?? 0) * Math.PI / 180;
  const width = (Math.abs(Math.cos(angle)) * seat.depth + Math.abs(Math.sin(angle)) * seat.width) / map.resolution;
  const height = (Math.abs(Math.sin(angle)) * seat.depth + Math.abs(Math.cos(angle)) * seat.width) / map.resolution;
  return { x: p.x - width / 2, y: p.y - height / 2, width, height };
}
export function selectionBounds(map: SlamMapMetadata, layout: Layout, ids: string[]) {
  const boxes = layout.seats.filter(s => ids.includes(s.seat_id)).map(s => seatBounds(map, s));
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
}
export type Alignment = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
export function alignLayoutSeats(layout: Layout, map: SlamMapMetadata, ids: string[], alignment: Alignment): Layout {
  const bounds = selectionBounds(map, layout, ids);
  if (!bounds || ids.length < 2) return layout;
  let next = layout;
  for (const seat of layout.seats.filter(s => ids.includes(s.seat_id))) {
    const box = seatBounds(map, seat), center = projectPose(map, seat.pose);
    const dx = alignment === "left" ? bounds.x - box.x : alignment === "right" ? bounds.x + bounds.width - box.x - box.width : alignment === "center-x" ? bounds.x + bounds.width / 2 - center.x : 0;
    const dy = alignment === "top" ? bounds.y - box.y : alignment === "bottom" ? bounds.y + bounds.height - box.y - box.height : alignment === "center-y" ? bounds.y + bounds.height / 2 - center.y : 0;
    const target = displayToSlam(map, center.x + dx, center.y + dy);
    next = moveLayoutSeats(next, [seat.seat_id], target.x - seat.pose.x, target.y - seat.pose.y);
  }
  return next;
}
/** Snap in the displayed map axes; convert once back to ROS map meters. */
export function snappedPoint(map: SlamMapMetadata, point: Point, meters: number): Point {
  if (!meters) return point;
  const grid = meters / map.resolution;
  return { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid };
}
export function cloneLayoutSeats(layout: Layout, ids: string[], suffix: string) {
  const labels = new Set(layout.seats.map(s => s.label));
  const tables = new Map<string, string>();
  const copies = moveLayoutSeats(layout, ids, 1.2, 0).seats.filter(s => ids.includes(s.seat_id)).map((s, index) => {
    const base = s.label.slice(0, 16); let label = `${base} 복사`, n = 2;
    while (labels.has(label)) label = `${base} 복사 ${n++}`;
    labels.add(label);
    if (!tables.has(s.table_id)) tables.set(s.table_id, `table-${suffix}-${tables.size}`);
    return { ...s, seat_id: `seat-${suffix}-${index + 1}`, label, table_id: tables.get(s.table_id)! };
  });
  return { layout: invalidateLayout({ ...layout, seats: [...layout.seats, ...copies] }), ids: copies.map(s => s.seat_id) };
}
export function layoutChanges(before: Layout, after: Layout) {
  const old = new Map(before.seats.map(s => [s.seat_id, s]));
  const current = new Set(after.seats.map(s => s.seat_id));
  const rows: { id: string; label: string; action: string; details: string }[] = [];
  for (const seat of after.seats) {
    const prev = old.get(seat.seat_id);
    if (!prev) { rows.push({ id: seat.seat_id, label: seat.label, action: "추가", details: `${seat.width} × ${seat.depth} m` }); continue; }
    const fields: string[] = [];
    if (seat.label !== prev.label) fields.push(`번호 ${prev.label} → ${seat.label}`);
    if (seat.width !== prev.width || seat.depth !== prev.depth) fields.push(`크기 ${prev.width}×${prev.depth} → ${seat.width}×${seat.depth} m`);
    const moved = Math.hypot(seat.pose.x - prev.pose.x, seat.pose.y - prev.pose.y);
    if (moved > 1e-8) fields.push(`이동 ${moved.toFixed(2)} m`);
    if (Math.abs(wrapAngle(seat.pose.yaw - prev.pose.yaw)) > 1e-8) fields.push(`회전 ${(wrapAngle(prev.pose.yaw - seat.pose.yaw) * 180 / Math.PI).toFixed(1)}°`);
    if (JSON.stringify(seat.approach) !== JSON.stringify(prev.approach)) fields.push("접근점 변경");
    if (fields.length) rows.push({ id: seat.seat_id, label: seat.label, action: "수정", details: fields.join(" · ") });
  }
  for (const seat of before.seats) if (!current.has(seat.seat_id)) rows.push({ id: seat.seat_id, label: seat.label, action: "삭제", details: "좌석 삭제" });
  if (JSON.stringify(before.home) !== JSON.stringify(after.home)) rows.push({ id: "home", label: "복귀점", action: after.home ? "수정" : "삭제", details: "복귀 위치·방향 변경" });
  return rows;
}
export type EditorHistory = { past: Layout[]; present: Layout; future: Layout[] };
export type HistoryAction = { type: "apply"; layout: Layout } | { type: "reset"; layout: Layout } | { type: "undo" | "redo" };
export function historyReducer(state: EditorHistory, action: HistoryAction): EditorHistory {
  if (action.type === "reset") return { past: [], present: action.layout, future: [] };
  if (action.type === "apply") return JSON.stringify(state.present) === JSON.stringify(action.layout) ? state : { past: [...state.past.slice(-79), state.present], present: action.layout, future: [] };
  if (action.type === "undo" && state.past.length) return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] };
  if (action.type === "redo" && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  return state;
}
