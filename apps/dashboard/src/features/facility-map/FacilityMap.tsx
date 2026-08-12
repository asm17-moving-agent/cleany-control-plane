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

  return (
    <div className="facility-map-shell">
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

        <rect className="facility-map-background" x="26" y="24" width="648" height="732" />
        <rect className="facility-map-grid" x="26" y="24" width="648" height="732" />

        <g className="facility-service-core" aria-label="공용 설비 구역">
          <path d="M38 100H230V180H38ZM38 190H104V260H38ZM120 190H186V260H120ZM38 278H104V348H38ZM120 278H186V348H120ZM38 368H230V468H38ZM38 482H186V600H38ZM38 614H186V748H38Z" />
          <path className="service-stairs" d="M50 112H105M50 122H105M50 132H105M50 142H105M50 152H105M50 162H105" />
          <path className="service-detail" d="M70 190V260M152 190V260M70 278V348M152 278V348M120 482V600M120 614V748" />
          <text x="155" y="142">계단·공용부</text>
          <text x="71" y="229">EV</text>
          <text x="153" y="229">EV</text>
          <text x="71" y="317">EV</text>
          <text x="153" y="317">EV</text>
          <text x="112" y="421">비상 EV</text>
          <text x="112" y="544">화장실 (여)</text>
          <text x="112" y="681">화장실 (남)</text>
        </g>

        <path className="facility-main-corridor" d="M236 24H270V145H520V168H512V427H275V435H292V650H350V748H236V615H216V355H236Z" />
        <path className="facility-corridor-edge" d="M250 24V150H520M250 150V355H216V475H250V615H280V650H350" />

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

        {FACILITY_POIS.filter(({ kind }) => ["EXIT", "CHARGER"].includes(kind)).map((poi) => (
          <g className={`facility-poi poi-${poi.kind.toLowerCase()}`} key={poi.id} transform={`translate(${poi.position.x} ${poi.position.y})`}>
            <circle r="15" />
            <text textAnchor="middle" y="4">{poiSymbol(poi.kind)}</text>
            <title>{poi.label}</title>
          </g>
        ))}

        <g className="facility-robot-marker" filter="url(#robot-shadow)" transform="translate(272 615)">
          <circle r="22" />
          <rect x="-11" y="-8" width="22" height="17" rx="7" />
          <circle cx="-5" cy="0" r="1.7" />
          <circle cx="5" cy="0" r="1.7" />
          <path d="M0-15v7" />
          <title>cleany-01 · {robotState ?? "연결 확인 중"} · 시나리오 위치</title>
        </g>

        <path className="facility-outline" d="M26 24H674V756H26V24ZM250 430H674M280 650H674" />
        </svg>
      </div>
      <div className="facility-map-note">
        <span><i className="map-note-dot robot" />Robot 시나리오 위치</span>
        <span><i className="map-note-swatch" />선택 가능한 구역</span>
        {selectedZone ? <strong>{selectedZone.label} 선택됨</strong> : null}
      </div>
    </div>
  );
}
