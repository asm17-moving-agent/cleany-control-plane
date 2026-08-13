import type { RobotState } from "../../api/types";
import planImageUrl from "../../assets/facility-18f-clean.png";
import {
  FACILITY_18F,
  FACILITY_ZONES,
  getFacilityZone,
  pointsToSvg,
} from "./facility-18f";
import "./facility-map.css";

interface FacilityMapProps {
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  robotState?: RobotState;
}

const categoryLabel = {
  WORKSPACE: "업무 공간",
  COMMON: "공용 공간",
} as const;

export function FacilityMap({ selectedZoneId, onSelectZone, robotState }: FacilityMapProps) {
  const selectedZone = getFacilityZone(selectedZoneId);

  return (
    <div className="facility-map-shell">
      <div className="facility-map-stage">
        <div className="facility-map-board">
          <div className="facility-plan-canvas">
            <img alt="18층 시설 배치도" className="facility-plan-image" src={planImageUrl} />

            <svg
              aria-label={`${FACILITY_18F.name} 구역 선택 레이어`}
              className="facility-zone-overlay"
              role="img"
              viewBox={FACILITY_18F.viewBox}
            >
              {FACILITY_ZONES.map((zone) => {
                const selected = zone.id === selectedZoneId;
                return (
                  <polygon
                    aria-label={`${zone.label} · ${categoryLabel[zone.category]} · 선택 가능`}
                    aria-pressed={selected}
                    className={`facility-zone-hit zone-${zone.category.toLowerCase()}${selected ? " is-selected" : ""}`}
                    key={zone.id}
                    onClick={() => onSelectZone(zone.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectZone(zone.id);
                      }
                    }}
                    points={pointsToSvg(zone.points)}
                    role="button"
                    tabIndex={0}
                  />
                );
              })}
            </svg>

            <div
              aria-label={`cleany-01 · ${robotState ?? "연결 확인 중"} · 시나리오 위치`}
              className="facility-robot-html"
              role="img"
            >
              <span className="facility-robot-face"><i /><i /></span>
            </div>
          </div>

          <aside className="facility-zone-index" aria-label="18층 구역 목록">
            <div className="zone-index-heading">
              <span>18F ZONE MAP</span>
              <strong>{selectedZone?.label ?? "구역을 선택하세요"}</strong>
              <p>도면의 구역 또는 아래 목록을 선택할 수 있습니다.</p>
            </div>
            <div className="zone-index-group">
              <span>업무 공간</span>
              <div>
                {FACILITY_ZONES.filter(({ category }) => category === "WORKSPACE").map((zone) => (
                  <button
                    aria-pressed={zone.id === selectedZoneId}
                    key={zone.id}
                    onClick={() => onSelectZone(zone.id)}
                    type="button"
                  >
                    {zone.shortLabel}
                  </button>
                ))}
              </div>
            </div>
            <div className="zone-index-group">
              <span>공용 공간</span>
              <div>
                {FACILITY_ZONES.filter(({ category }) => category === "COMMON").map((zone) => (
                  <button
                    aria-pressed={zone.id === selectedZoneId}
                    key={zone.id}
                    onClick={() => onSelectZone(zone.id)}
                    type="button"
                  >
                    {zone.shortLabel}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="facility-map-note">
        <span><i className="map-note-dot robot" />Robot 시나리오 위치</span>
        <span><i className="map-note-swatch" />선택 가능한 구역</span>
        {selectedZone ? <strong>{selectedZone.label} 선택됨</strong> : null}
      </div>
    </div>
  );
}
