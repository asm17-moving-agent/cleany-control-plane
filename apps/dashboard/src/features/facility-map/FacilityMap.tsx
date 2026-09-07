import type { RobotState, Seat } from "../../api/types";
import { DISPLAY_GRID_COLUMNS, SEAT_COLUMN_LABELS, seatPosition } from "../../lib/operations";
import { FacilityPlanArtwork } from "./FacilityPlanArtwork";
import {
  FACILITY_18F,
  getFacilityZone,
} from "./facility-18f";
import "./facility-map.css";

interface FacilityMapProps {
  seats: Seat[];
  selectedZoneId: string | null;
  selectedSeatId: string | null;
  onSelectSeat: (seatId: string) => void;
  onBackToZones: () => void;
  robotState?: RobotState;
  variant?: "selector" | "operations";
  robots?: FacilityRobotMarker[];
  selectedRobotId?: string | null;
  onSelectRobot?: (robotId: string) => void;
}

export interface FacilityRobotMarker {
  robotId: string;
  state: RobotState;
  x: number;
  y: number;
  route?: Array<{ x: number; y: number }>;
  positionMode?: "live" | "scenario";
}

const robotStateLabel: Record<RobotState, string> = {
  OFFLINE: "연결 끊김",
  IDLE: "대기 중",
  BUSY: "작업 중",
  ERROR: "확인 필요",
};

export function FacilityMap({
  seats,
  selectedZoneId,
  selectedSeatId,
  onSelectSeat,
  onBackToZones,
  robotState,
  variant = "selector",
  robots,
  selectedRobotId,
  onSelectRobot,
}: FacilityMapProps) {
  const selectedZone = getFacilityZone(selectedZoneId);
  const selectedSeat = seats.find(({ seat_id }) => seat_id === selectedSeatId) ?? null;
  const mapRobots: FacilityRobotMarker[] = robots ?? [{
    robotId: "cleany-01",
    state: robotState ?? "OFFLINE",
    x: 820,
    y: 320,
    positionMode: "scenario",
  }];

  return (
    <div className={`facility-map-shell${variant === "operations" ? " is-operations" : ""}`}>
      <div className="facility-map-stage">
        {selectedZone ? (
          <div className="facility-seat-detail" key={selectedZone.id}>
            <header className="seat-detail-heading">
              <div className="seat-detail-breadcrumb" aria-label="지도 탐색 경로">
                <button type="button" onClick={onBackToZones}>18층 전체</button>
                <span aria-hidden="true">/</span>
                <strong>{selectedZone.label}</strong>
              </div>
              <div>
                <span className="seat-detail-kicker">SEAT MAP</span>
                <h3>{selectedZone.label} 좌석 선택</h3>
                <p>좌석을 선택하면 해당 좌석을 Mission 대상으로 지정합니다.</p>
              </div>
              <button className="seat-detail-back" type="button" onClick={onBackToZones}>
                <span aria-hidden="true">←</span> 구역 다시 선택
              </button>
            </header>

            <div className="facility-seat-workspace">
              <div className="facility-seat-plan">
                <div className="facility-seat-grid" aria-label={`${selectedZone.label} 좌석 선택`}>
                  {SEAT_COLUMN_LABELS.map((label, index) => (
                    <span
                      className="facility-seat-column"
                      key={label}
                      style={{ gridColumn: DISPLAY_GRID_COLUMNS[index], gridRow: 1 }}
                    >
                      {label}
                    </span>
                  ))}
                  {seats.map((seat) => {
                    const selected = seat.seat_id === selectedSeatId;
                    const occupied = seat.occupancy === "OCCUPIED";
                    const position = seatPosition(seat);
                    const availability = occupied ? `${seat.occupant_name} 사용 중` : "비어 있음";
                    return (
                      <button
                        aria-label={`${seat.label}번 좌석 · ${availability}${selected ? " · 선택됨" : ""}`}
                        aria-pressed={selected}
                        className={`facility-seat${occupied ? " is-occupied" : ""}${selected ? " is-selected" : ""}`}
                        key={seat.seat_id}
                        onClick={() => onSelectSeat(seat.seat_id)}
                        style={{ gridColumn: position.column, gridRow: position.gridRow }}
                        type="button"
                      >
                        <strong>{seat.label}</strong>
                      </button>
                    );
                  })}
                </div>
                <span className="facility-seat-door door-left" aria-label="왼쪽 출입문" role="img" />
                <span className="facility-seat-door door-right" aria-label="오른쪽 출입문" role="img" />
              </div>

              {variant === "selector" ? <aside className="facility-seat-summary" aria-live="polite">
                <span className="seat-summary-label">선택한 좌석</span>
                {selectedSeat ? (
                  <>
                    <strong>{selectedSeat.label}번</strong>
                    <p>{selectedSeat.occupancy === "OCCUPIED"
                      ? `${selectedSeat.occupant_name} 사용 중`
                      : "현재 비어 있음"}</p>
                    <button type="button" onClick={() => onSelectSeat(selectedSeat.seat_id)}>
                      선택 해제
                    </button>
                  </>
                ) : (
                  <>
                    <strong>미선택</strong>
                    <p>배치도에서 작업할 좌석 하나를 선택하세요.</p>
                  </>
                )}
                <div className="seat-detail-legend">
                  <span><i className="available" />선택 가능</span>
                  <span><i className="occupied" />사용 중</span>
                  <span><i className="selected" />선택됨</span>
                </div>
              </aside> : null}
            </div>
          </div>
        ) : (
          <div className="facility-map-board" key="zone-overview">
            <div className="facility-plan-canvas">
            <FacilityPlanArtwork />

            <svg
              aria-hidden="true"
              className="facility-route-overlay"
              preserveAspectRatio="none"
              viewBox={FACILITY_18F.viewBox}
            >
              {mapRobots.map((mapRobot) => mapRobot.route && mapRobot.route.length > 1 ? (
                <g key={mapRobot.robotId}>
                  <polyline
                    className="facility-robot-route"
                    points={mapRobot.route.map(({ x, y }) => `${x},${y}`).join(" ")}
                  />
                  <circle
                    className="facility-route-destination"
                    cx={mapRobot.route.at(-1)?.x}
                    cy={mapRobot.route.at(-1)?.y}
                    r="18"
                  />
                </g>
              ) : null)}
            </svg>

            {mapRobots.map((mapRobot) => (
              <button
                aria-label={`${mapRobot.robotId} 로봇 · ${robotStateLabel[mapRobot.state]} · ${mapRobot.positionMode === "live" ? "실시간 위치" : "시나리오 위치"}`}
                aria-pressed={mapRobot.robotId === selectedRobotId}
                className={`facility-robot-html${mapRobot.robotId === selectedRobotId ? " is-selected" : ""}`}
                data-state={mapRobot.state}
                key={mapRobot.robotId}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectRobot?.(mapRobot.robotId);
                }}
                style={{
                  left: `${mapRobot.x / FACILITY_18F.imageWidth * 100}%`,
                  top: `${mapRobot.y / FACILITY_18F.imageHeight * 100}%`,
                }}
                type="button"
              >
                <span className="facility-robot-face"><i /><i /></span>
                {mapRobot.robotId === selectedRobotId ? (
                  <span className="facility-robot-name" aria-hidden="true">{mapRobot.robotId}</span>
                ) : null}
              </button>
            ))}
            </div>

          </div>
        )}
      </div>

      <div className="facility-map-note">
        {selectedZone ? (
          <>
            <span><i className="map-note-swatch" />{selectedZone.label} 상세</span>
            <span><i className="map-note-dot seat" />좌석을 선택해 Mission 요청</span>
            <strong>{selectedSeat ? `${selectedSeat.label}번 좌석 선택됨` : "좌석을 선택하세요"}</strong>
          </>
        ) : (
          <>
            <span><i className="map-note-dot robot" />Robot 위치</span>
            <span><i className="map-note-inactive" />회색 영역: 운영 대상 외</span>
            {mapRobots.some(({ route }) => route && route.length > 1) ? <span><i className="map-note-route" />이동 경로</span> : null}
          </>
        )}
      </div>
    </div>
  );
}
