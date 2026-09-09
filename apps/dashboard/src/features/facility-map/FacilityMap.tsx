import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { RobotState, Seat } from "../../api/types";
import robotFaceSoft from "../../assets/brand/robot-face-soft.svg";
import { robotStateLabels } from "../../lib/home-summary";
import { FacilityPlanArtwork } from "./FacilityPlanArtwork";
import { FACILITY_18F, FACILITY_ACTIVE_BOUNDS } from "./facility-18f";
import { fitMapBounds } from "./map-viewport";
import { seatMapSize, seatMapPosition } from "./seat-layout";
import { seatOccupancyLabel, seatDisplayLabel } from "../../lib/operations";
import "./facility-map.css";

interface FacilityMapProps {
  seats: Seat[];
  selectedSeatId: string | null;
  onSelectSeat: (seatId: string) => void;
  robots: FacilityRobotMarker[];
  selectedRobotId: string | null;
  onSelectRobot: (robotId: string) => void;
  robotFocusKey?: number;
  seatSelectionDisabled?: boolean;
  highlightedSeatIds?: ReadonlySet<string>;
  overlayInsetLeft?: number;
}
export interface FacilityRobotMarker {
  robotId: string;
  state: RobotState;
  x: number; y: number;
  positionMode: "live" | "scenario";
}
const width = FACILITY_18F.imageWidth;
const height = FACILITY_18F.imageHeight;
const fullBounds = { x: 0, y: 0, width, height };
type MapView = { mode: "initial" | "active" | "all" } | { mode: "manual"; zoom: number; x: number; y: number };
const initialView: MapView = { mode: "initial" };
const initialZoom = 1.25;
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
export function FacilityMap({ seats, selectedSeatId, onSelectSeat, robots, selectedRobotId, onSelectRobot, robotFocusKey = 0, seatSelectionDisabled = false, highlightedSeatIds, overlayInsetLeft = 0 }: FacilityMapProps) {
  const stage = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 900, height: 650 });
  const [view, setView] = useState<MapView>(initialView);
  const [focusMotion, setFocusMotion] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const fit = fitMapBounds(fullBounds, frame).scale;
  const inset = Math.min(overlayInsetLeft, frame.width * .4);
  const fitted = fitMapBounds(view.mode === "active" ? FACILITY_ACTIVE_BOUNDS : fullBounds, { ...frame, width: frame.width - inset });
  const initialFit = fitMapBounds(FACILITY_ACTIVE_BOUNDS, { ...frame, width: frame.width - inset });
  const camera = view.mode === "manual" ? view : view.mode === "initial"
    // Start centered horizontally with the top of the floor plan in view.
    ? inset > 0
      ? { zoom: initialFit.scale / fit, x: initialFit.x - inset / (2 * initialFit.scale), y: frame.height / (2 * initialFit.scale) - 16 / initialFit.scale + FACILITY_ACTIVE_BOUNDS.y }
      : { zoom: initialZoom, x: width / 2, y: frame.height / (2 * fit * initialZoom) }
    : { zoom: fitted.scale / fit, x: fitted.x - inset / (2 * fitted.scale), y: fitted.y };
  const scale = fit * camera.zoom;
  const visibleWidth = frame.width / scale;
  const visibleHeight = frame.height / scale;
  const centerX = view.mode !== "manual" ? camera.x : visibleWidth >= width ? width / 2 : clamp(camera.x, visibleWidth / 2, width - visibleWidth / 2);
  const centerY = view.mode !== "manual" ? camera.y : visibleHeight >= height ? height / 2 : clamp(camera.y, visibleHeight / 2, height - visibleHeight / 2);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth && element.clientHeight) setFrame({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const robot = robots.find((item) => item.robotId === selectedRobotId);
    if (robot) {
      setFocusMotion(true);
      setView({ mode: "manual", zoom: Math.max(1.5, camera.zoom), x: robot.x, y: robot.y });
    }
  }, [selectedRobotId, robotFocusKey]);
  function zoomBy(factor: number) {
    setFocusMotion(false);
    setView({ mode: "manual", zoom: clamp(camera.zoom * factor, 1, 4), x: centerX, y: centerY });
  }
  function beginPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    setFocusMotion(false);
    drag.current = { clientX: event.clientX, clientY: event.clientY, x: centerX, y: centerY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }
  function pan(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const start = drag.current;
    setView({
      mode: "manual", zoom: camera.zoom, x: clamp(start.x - (event.clientX - start.clientX) / scale, 0, width),
      y: clamp(start.y - (event.clientY - start.clientY) / scale, 0, height),
    });
  }
  function endPan() { drag.current = null; setDragging(false); }
  return (
    <div className="facility-map-shell">
      <div className={"facility-map-stage" + (dragging ? " is-panning" : "")} ref={stage}
        onPointerDown={beginPan} onPointerMove={pan} onPointerUp={endPan} onPointerCancel={endPan}>
        <div className={"facility-plan-canvas" + (focusMotion ? " is-focusing" : "")}
          onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === "transform") setFocusMotion(false); }} style={{
          width, height, "--map-scale": scale,
          transform: "translate(" + (frame.width / 2 - centerX * scale) + "px, " + (frame.height / 2 - centerY * scale) + "px) scale(" + scale + ")",
        } as CSSProperties}>
          <FacilityPlanArtwork />
          <div className="facility-seat-overlay" aria-label="18층 좌석">
            {seats.map((seat) => {
              const point = seatMapPosition(seat);
              if (!point) return null;
              const size = seatMapSize(seat);
              const label = seatDisplayLabel(seat);
              const isRoomSeat = !!seat.zone_id && seat.zone_id !== "d-hub";
              const selected = selectedSeatId === seat.seat_id;
              return <button type="button" key={seat.seat_id} data-seat-id={seat.seat_id}
                className={"facility-map-seat" + (selected ? " is-selected" : "") + (highlightedSeatIds ? highlightedSeatIds.has(seat.seat_id) ? " is-filter-match" : " is-filter-muted" : "")}
                aria-label={label + "번 좌석 · " + seatOccupancyLabel(seat)}
                aria-pressed={selected} disabled={seatSelectionDisabled}
                data-occupancy={seat.occupancy} data-row={seat.row}
                style={{ left: point.x, top: point.y, ...size, borderRadius: 2 }}
                onClick={() => onSelectSeat(seat.seat_id)}>
                <svg className="facility-workstation" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
                  <text x={size.width / 2} y={size.height / 2}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={isRoomSeat ? Math.min(10, size.width / 3) : Math.max(13, 12 / scale)} fontWeight={selected ? 600 : 500}
                    fill="currentColor">{label}</text>
                </svg>
              </button>;
            })}
          </div>
          <div className="facility-robot-overlay" aria-label="로봇 예시 위치">
            {robots.map((robot) => <button key={robot.robotId} type="button" data-state={robot.state}
              className={"facility-map-robot" + (selectedRobotId === robot.robotId ? " is-selected" : "")}
              aria-label={robot.robotId + " 로봇 · " + robotStateLabels[robot.state] + " · " + (robot.positionMode === "live" ? "실시간 위치" : "예시 위치")}
              aria-pressed={selectedRobotId === robot.robotId} style={{ left: robot.x, top: robot.y }} onClick={() => onSelectRobot(robot.robotId)}>
              <img src={robotFaceSoft} alt="" width="28" height="24" draggable={false} />
              <span className="facility-map-robot-label" aria-hidden="true">{robot.robotId}</span>
            </button>)}
          </div>
        </div>
        <div className="facility-map-controls" aria-label="지도 조작">
          <div className="facility-map-zoom-controls"><button type="button" aria-label="지도 확대" disabled={camera.zoom >= 4} onClick={() => zoomBy(1.25)}>+</button>
            <button type="button" aria-label="지도 축소" disabled={camera.zoom <= 1} onClick={() => zoomBy(1 / 1.25)}>−</button>
          </div>
          <div className="facility-map-fit-controls">
            <button type="button" aria-pressed={view.mode === "active"} onClick={() => setView({ mode: "active" })}>활성 구역</button>
            <button type="button" aria-pressed={view.mode === "all"} onClick={() => setView({ mode: "all" })}>전체 보기</button>
          </div>
        </div>
      </div>
      <div className="facility-map-legend" aria-label="지도 범례">
        <span><i className="legend-working" />작업 중</span><span><i className="legend-idle" />대기</span><span><i className="legend-error" />확인 필요</span>
        <span><i className="legend-seat" />좌석 선택</span><span><i className="legend-inactive" />운영 대상 외</span>
        <output aria-label="지도 확대 비율">{Math.round(camera.zoom * 100)}%</output>
      </div>
    </div>
  );
}
