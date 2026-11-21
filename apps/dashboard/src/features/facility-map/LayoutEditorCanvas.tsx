import { useRef, useState, type PointerEvent } from "react";
import { SeatLayoutLayer } from "./SeatLayoutLayer";
import { displayToSlam, type SlamMapMetadata } from "./slam-map";
import { invalidateLayout, moveLayoutSeats, projectPose, rotateLayoutSeats, seatBounds, selectedSeats, selectionBounds, snappedPoint, updateApproaches, wrapAngle, type Layout, type LayoutSeat, type EditorMode, type Point } from "./seat-layout-editor";

type Drag = { kind: "seats" | "approaches" | "home" | "rotate-seats" | "rotate-approaches" | "rotate-home" | "marquee";
  start: Point; pivot: Point; layout: Layout; ids: string[]; originalIds: string[]; additive: boolean; next?: Layout; moved: boolean };
export function LayoutEditorCanvas({ map, layout, scale, selected, onSelect, onCommit, mode, tool, grouped, snap, opacity, disabled }: {
  map: SlamMapMetadata; layout: Layout; scale: number; selected: string[]; onSelect: (ids: string[]) => void;
  onCommit: (layout: Layout) => void; mode: EditorMode; tool: "select" | "pan"; grouped: boolean; snap: number; opacity: number; disabled: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Layout | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const displayed = preview ?? layout;
  const bounds = selectionBounds(map, displayed, selected);
  const location = (event: PointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };
  function begin(event: PointerEvent, kind: Drag["kind"], ids: string[], pivot?: Point) {
    if (disabled || tool === "pan" || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    svg.current!.focus(); svg.current!.setPointerCapture(event.pointerId);
    const start = location(event);
    drag.current = { kind, ids, start, pivot: pivot ?? start, layout, originalIds: selected,
      additive: event.shiftKey || event.ctrlKey || event.metaKey, moved: false };
  }
  function startSeat(event: PointerEvent<SVGGElement>, seat: LayoutSeat) {
    if (tool === "pan" || disabled || event.button !== 0) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const ids = selectedSeats(layout, seat.seat_id, selected, additive, mode === "seats" && grouped);
    onSelect(ids);
    if (mode !== "seats" || !ids.includes(seat.seat_id)) { event.stopPropagation(); return; }
    const b = selectionBounds(map, layout, ids)!;
    begin(event, "seats", ids, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
  }
  function startMarker(event: PointerEvent<SVGGElement>, seat: LayoutSeat | null, rotate: boolean) {
    if (tool === "pan" || disabled || event.button !== 0) return;
    const ids = seat ? selectedSeats(layout, seat.seat_id, selected, event.shiftKey || event.ctrlKey || event.metaKey, false) : [];
    if (seat) onSelect(ids);
    const pose = seat?.approach ?? layout.home;
    if (pose) begin(event, rotate ? seat ? "rotate-approaches" : "rotate-home" : seat ? "approaches" : "home", ids, projectPose(map, pose));
  }
  function startSurface(event: PointerEvent<SVGSVGElement>) {
    if (tool === "pan" || disabled || event.button !== 0) return;
    if (mode === "home") {
      event.stopPropagation();
      const p = snappedPoint(map, location(event), snap);
      onCommit(invalidateLayout({ ...layout, home: { ...displayToSlam(map, p.x, p.y), yaw: layout.home?.yaw ?? 0 } }));
      return;
    }
    begin(event, "marquee", []);
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) onSelect([]);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current) return;
    event.stopPropagation();
    const p = location(event), { start, pivot } = current;
    if (Math.hypot(p.x - start.x, p.y - start.y) * scale < 3 && !current.moved) return;
    current.moved = true;
    if (current.kind === "marquee") {
      const box = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) };
      setMarquee(box);
      const ids = layout.seats.filter(s => {
        const b = seatBounds(map, s);
        return b.x < box.x + box.width && b.x + b.width > box.x && b.y < box.y + box.height && b.y + b.height > box.y;
      }).map(s => s.seat_id);
      onSelect(current.additive ? [...new Set([...current.originalIds, ...ids])] : ids);
      return;
    }
    let next = current.layout;
    if (current.kind.startsWith("rotate")) {
      let radians = wrapAngle(Math.atan2(start.y - pivot.y, start.x - pivot.x) - Math.atan2(p.y - pivot.y, p.x - pivot.x));
      if (snap && !event.altKey) radians = Math.round(radians / (Math.PI / 12)) * Math.PI / 12;
      if (current.kind === "rotate-seats") next = rotateLayoutSeats(next, current.ids, radians, displayToSlam(map, pivot.x, pivot.y));
      else if (current.kind === "rotate-approaches") next = updateApproaches(next, current.ids, { yaw: radians });
      else if (next.home) next = invalidateLayout({ ...next, home: { ...next.home, yaw: wrapAngle(next.home.yaw + radians) } });
    } else {
      const target = snappedPoint(map, { x: pivot.x + p.x - start.x, y: pivot.y + p.y - start.y }, event.altKey ? 0 : snap);
      const original = displayToSlam(map, pivot.x, pivot.y), world = displayToSlam(map, target.x, target.y);
      const dx = world.x - original.x, dy = world.y - original.y;
      if (current.kind === "seats") next = moveLayoutSeats(next, current.ids, dx, dy);
      else if (current.kind === "approaches") next = updateApproaches(next, current.ids, { x: dx, y: dy });
      else if (next.home) next = invalidateLayout({ ...next, home: { ...next.home, x: next.home.x + dx, y: next.home.y + dy } });
    }
    current.next = next; setPreview(next);
  }
  function end(event: PointerEvent<SVGSVGElement>, cancelled = false) {
    if (!drag.current) return;
    event.stopPropagation();
    if (!cancelled && drag.current.next) onCommit(drag.current.next);
    if (cancelled) onSelect(drag.current.originalIds);
    drag.current = null; setPreview(null); setMarquee(null);
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
  }
  return <SeatLayoutLayer map={map} layout={displayed} selectedIds={selected}
    onSelectSeat={(id, additive) => onSelect(selectedSeats(layout, id, selected, additive, mode === "seats" && grouped))}
    editing={{ mode, opacity, scale, svgRef: svg, onSeatPointerDown: startSeat, onMarkerPointerDown: startMarker,
      surface: { tabIndex: 0, "aria-label": "좌석 편집 캔버스", "data-tool": tool, onPointerDown: startSurface, onPointerMove: move, onPointerUp: event => end(event), onPointerCancel: event => end(event, true) },
      children: <>
        {bounds && mode === "seats" && <g className="editor-selection-box" pointerEvents="none">
          <rect x={bounds.x - 3 / scale} y={bounds.y - 3 / scale} width={bounds.width + 6 / scale} height={bounds.height + 6 / scale} />
          <line x1={bounds.x + bounds.width / 2} y1={bounds.y - 3 / scale} x2={bounds.x + bounds.width / 2} y2={bounds.y - 25 / scale} />
          <g role="button" tabIndex={0} aria-label="선택 좌석 회전" className="slam-rotation-handle"
            onPointerDown={event => begin(event, "rotate-seats", selected, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })}>
            <circle cx={bounds.x + bounds.width / 2} cy={bounds.y - 25 / scale} r={6 / scale} />
          </g>
        </g>}
        {marquee && <rect className="editor-marquee" {...marquee} pointerEvents="none" />}
      </>,
    }} />;
}
