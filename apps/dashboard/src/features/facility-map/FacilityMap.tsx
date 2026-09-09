import type { CSSProperties } from "react";
import type { RobotState, Seat } from "../../api/types";
import robotFaceSoft from "../../assets/brand/robot-face-soft.svg";
import { robotStateLabels } from "../../lib/home-summary";
import { FacilityPlanArtwork } from "./FacilityPlanArtwork";
import { FACILITY_18F, FACILITY_ACTIVE_BOUNDS } from "./facility-18f";
import { useMapCamera } from "./useMapCamera";
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
export function FacilityMap({ seats, selectedSeatId, onSelectSeat, robots, selectedRobotId, onSelectRobot, robotFocusKey = 0, seatSelectionDisabled = false, highlightedSeatIds, overlayInsetLeft = 0 }: FacilityMapProps) {
  const { stage, view, camera, dragging, focusMotion, zoomBy, fitView, canZoomIn, canZoomOut, panHandlers, endFocus } = useMapCamera({
    robots, selectedRobotId, robotFocusKey, fullBounds, activeBounds: FACILITY_ACTIVE_BOUNDS, overlayInsetLeft,
  });
  const { scale } = camera;
  return (
    <div className="facility-map-shell">
      <div className={"facility-map-stage" + (dragging ? " is-panning" : "")} ref={stage}
        {...panHandlers}>
        <div className={"facility-plan-canvas" + (focusMotion ? " is-focusing" : "")}
          onTransitionEnd={endFocus} style={{
          width, height, "--map-scale": scale,
          transform: camera.transform,
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
          <div className="facility-map-zoom-controls"><button type="button" aria-label="지도 확대" disabled={!canZoomIn} onClick={() => zoomBy(1.25)}>+</button>
            <button type="button" aria-label="지도 축소" disabled={!canZoomOut} onClick={() => zoomBy(1 / 1.25)}>−</button>
          </div>
          <div className="facility-map-fit-controls">
            <button type="button" aria-pressed={view.mode === "active"} onClick={() => fitView("active")}>활성 구역</button>
            <button type="button" aria-pressed={view.mode === "all"} onClick={() => fitView("all")}>전체 보기</button>
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
