import type { RobotState } from "../../api/types";
import {
  FACILITY_18F,
  FACILITY_POIS,
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
  UTILITY: "설비 공간",
  STORAGE: "창고",
} as const;

function poiSymbol(kind: (typeof FACILITY_POIS)[number]["kind"]) {
  return {
    ELEVATOR: "↕",
    RESTROOM: "WC",
    STAIRS: "≋",
    EXIT: "↗",
    CHARGER: "⚡",
  }[kind];
}

export function FacilityMap({ selectedZoneId, onSelectZone, robotState }: FacilityMapProps) {
  const selectedZone = getFacilityZone(selectedZoneId);
  const routeEnd = selectedZone?.center ?? { x: 392, y: 290 };
  const route = `286,720 286,635 270,610 270,455 255,425 255,290 ${routeEnd.x},${routeEnd.y}`;

  return (
    <div className="facility-map-stage">
      <svg
        aria-label={`${FACILITY_18F.name} 배치도`}
        className="facility-map-svg"
        role="img"
        viewBox={FACILITY_18F.viewBox}
      >
        <defs>
          <pattern id="facility-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeOpacity=".07" strokeWidth="1" />
          </pattern>
          <filter id="robot-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="5" floodColor="#02264b" floodOpacity=".25" stdDeviation="5" />
          </filter>
        </defs>

        <rect className="facility-map-background" x="16" y="16" width="668" height="748" rx="24" />
        <rect className="facility-map-grid" x="16" y="16" width="668" height="748" rx="24" />

        {FACILITY_ZONES.map((zone) => {
          const selected = zone.id === selectedZoneId;
          return (
            <g
              aria-label={`${zone.label} · ${categoryLabel[zone.category]}${zone.selectable ? " · 선택 가능" : ""}`}
              aria-pressed={zone.selectable ? selected : undefined}
              className={`facility-zone zone-${zone.category.toLowerCase()}${selected ? " is-selected" : ""}${zone.selectable ? " is-selectable" : ""}`}
              key={zone.id}
              onClick={() => zone.selectable && onSelectZone(zone.id)}
              onKeyDown={(event) => {
                if (zone.selectable && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelectZone(zone.id);
                }
              }}
              role={zone.selectable ? "button" : undefined}
              tabIndex={zone.selectable ? 0 : undefined}
            >
              <polygon points={pointsToSvg(zone.points)} />
              <text className="facility-zone-label" textAnchor="middle" x={zone.center.x} y={zone.center.y - 2}>
                {zone.shortLabel}
              </text>
            </g>
          );
        })}

        <g className="facility-service-core" aria-label="공용 설비 구역">
          <path d="M38 100H242V420H265V748H38V100Z" />
          <path d="M38 185H230M38 270H230M38 390H230M38 475H230M38 610H230" />
          <path d="M118 185V390M118 475V748" />
        </g>

        <polyline className={`facility-route${selectedZone ? " is-active" : ""}`} points={route} />
        {selectedZone ? <circle className="facility-target" cx={routeEnd.x} cy={routeEnd.y} r="10" /> : null}

        {FACILITY_POIS.map((poi) => (
          <g className={`facility-poi poi-${poi.kind.toLowerCase()}`} key={poi.id} transform={`translate(${poi.position.x} ${poi.position.y})`}>
            <circle r="15" />
            <text textAnchor="middle" y="4">{poiSymbol(poi.kind)}</text>
            <title>{poi.label}</title>
          </g>
        ))}

        <g className="facility-robot-marker" filter="url(#robot-shadow)" transform="translate(286 635)">
          <circle r="22" />
          <rect x="-11" y="-8" width="22" height="17" rx="7" />
          <circle cx="-5" cy="0" r="1.7" />
          <circle cx="5" cy="0" r="1.7" />
          <path d="M0-15v7" />
          <title>cleany-01 · {robotState ?? "연결 확인 중"} · 시나리오 위치</title>
        </g>

        <path className="facility-outline" d="M26 26H674V758H26V26ZM250 26V150M250 150H520M250 430H674M280 650H674" />
      </svg>

      <div className="facility-map-note">
        <span><i className="map-note-dot robot" />Robot 시나리오 위치</span>
        <span><i className="map-note-line" />예상 이동 경로</span>
        <span><i className="map-note-dot target" />선택 구역</span>
      </div>
    </div>
  );
}
