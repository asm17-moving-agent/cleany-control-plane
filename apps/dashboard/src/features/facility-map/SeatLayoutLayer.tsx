import { useId, type PointerEvent, type Ref, type SVGProps, type ReactNode } from "react";
import type { Seat } from "../../api/types";
import { seatMapStatus, seatMapStatusLabels, type SeatCleaningStates } from "../../lib/seat-summary";
import type { SlamMapMetadata } from "./slam-map";
import { projectPose, type Layout, type LayoutSeat, type EditorMode } from "./seat-layout-editor";
import geometry from "./seat-geometry.json";
import "./seat-layout.css";

export interface SeatOverlayEditing {
  mode: EditorMode; opacity: number; scale: number;
  surface: SVGProps<SVGSVGElement> & { "data-tool"?: string }; svgRef: Ref<SVGSVGElement>;
  onSeatPointerDown: (event: PointerEvent<SVGGElement>, seat: LayoutSeat) => void;
  onMarkerPointerDown: (event: PointerEvent<SVGGElement>, seat: LayoutSeat | null, rotate: boolean) => void;
  children?: ReactNode;
}
/** Shared geometry-only overlay. Editing state and API writes belong to the editor page. */
export function SeatLayoutLayer({ map, layout, selectedIds, onSelectSeat, editing, seats, seatCleaning }: {
  map: SlamMapMetadata; layout: Layout; selectedIds: string[];
  onSelectSeat: (id: string, additive: boolean) => void;
  editing?: SeatOverlayEditing; seats?: Seat[]; seatCleaning?: SeatCleaningStates;
}) {
  const arrowId = useId();
  const project = (pose: LayoutSeat["pose"]) => projectPose(map, pose);
  function marker(seat: LayoutSeat | null) {
    const pose = seat?.approach ?? layout.home;
    if (!pose) return null;
    const p = project(pose), active = seat ? selectedIds.includes(seat.seat_id) : editing?.mode === "home";
    const scale = editing?.scale ?? 1, length = 30 / scale;
    const angle = (p.heading ?? 0) * Math.PI / 180;
    const tip = { x: p.x + Math.cos(angle) * length, y: p.y + Math.sin(angle) * length };
    const label = seat ? `${seat.label}번 접근점` : "복귀점";
    return <g key={seat?.seat_id ?? "home"} className={"slam-editor-marker" + (active ? " is-selected" : "")}>
      {seat && active && <path className="slam-approach-link" d={`M${p.x} ${p.y} L${project(seat.pose).x} ${project(seat.pose).y}`} />}
      <g role="button" tabIndex={0} aria-label={label} data-marker-id={seat?.seat_id ?? "home"}
        onPointerDown={event => editing?.onMarkerPointerDown(event, seat, false)}
        onKeyDown={event => { if (seat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectSeat(seat.seat_id, event.shiftKey || event.ctrlKey || event.metaKey); } }}>
        <circle cx={p.x} cy={p.y} r={(active ? 8 : 5) / scale} />
        <path d={`M${p.x} ${p.y} L${tip.x} ${tip.y}`} markerEnd={`url(#${arrowId})`} />
        <text x={p.x} y={p.y - 13 / scale} style={{ fontSize: 11 / scale }} textAnchor="middle">{seat?.label.replace(/^[AM][1-4]-/, "") ?? "H"}</text>
      </g>
      {active && <g role="button" tabIndex={0} aria-label={`${label} 방향 조절`} className="slam-rotation-handle"
        onPointerDown={event => editing?.onMarkerPointerDown(event, seat, true)}>
        <circle cx={tip.x} cy={tip.y} r={6 / scale} />
      </g>}
    </g>;
  }
  return <svg ref={editing?.svgRef} className={"slam-seat-layer" + (editing ? " is-editing" : "")}
    width={map.presentation?.width ?? map.width} height={map.presentation?.height ?? map.height}
    {...editing?.surface}>
    {editing && <rect width="100%" height="100%" fill="transparent" pointerEvents="all" />}
    <defs><marker id={arrowId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5" fill="currentColor" /></marker></defs>
    {layout.seats.map(seat => {
      const point = project(seat.pose), active = selectedIds.includes(seat.seat_id);
      const width = seat.width / map.resolution, depth = seat.depth / map.resolution;
      const chairWidth = (seat.zone_id === "d-hub" ? geometry.dhub.chair_width_m : seat.width * 12 / 38) / map.resolution;
      const chairDepth = (seat.zone_id === "d-hub" ? geometry.dhub.chair_depth_m / 2 : seat.depth * 6 / 28) / map.resolution;
      const liveSeat = seats?.find(s => s.seat_id === seat.seat_id);
      const status = editing ? undefined : liveSeat ? seatMapStatus(liveSeat, seatCleaning?.[seat.seat_id]) : "unknown";
      return <g className={"slam-seat" + (active ? " is-selected" : "")} key={seat.seat_id}
        role="button" tabIndex={0} aria-label={`좌석 ${seat.label}${status ? ` · ${seatMapStatusLabels[status]}` : ""}`}
        aria-pressed={active} data-seat-id={seat.seat_id} data-seat-status={status}
        onPointerDown={event => { if (editing) editing.onSeatPointerDown(event, seat); else event.stopPropagation(); }}
        onClick={event => { event.stopPropagation(); if (!editing) onSelectSeat(seat.seat_id, false); }}
        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectSeat(seat.seat_id, event.shiftKey || event.ctrlKey || event.metaKey); } }}>
        <title>{seat.label}{status ? ` · ${seatMapStatusLabels[status]}` : ""}</title>
        <g transform={`translate(${point.x} ${point.y}) rotate(${point.heading ?? 0})`} style={{ opacity: editing && active ? editing.opacity / 100 : 1 }}>
          <rect className="slam-chair" x={-depth / 2 - chairDepth} y={-chairWidth / 2} width={chairDepth} height={chairWidth} rx="1.8" />
          <rect className="slam-desk" x={-depth / 2} y={-width / 2} width={depth} height={width} rx="1.3" />
        </g>
        <text style={{ fontSize: seat.zone_id === "d-hub" ? 8 : 6.2 }} x={point.x} y={point.y} dominantBaseline="central" textAnchor="middle">{seat.label.replace(/^[AM][1-4]-/, "")}</text>
      </g>;
    })}
    {editing?.children}
    {editing?.mode === "approaches" && layout.seats.map(seat => marker(seat))}
    {editing?.mode === "home" && marker(null)}
  </svg>;
}
