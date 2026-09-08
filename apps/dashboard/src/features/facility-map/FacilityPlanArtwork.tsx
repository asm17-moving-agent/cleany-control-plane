import facilityFloorplan from "../../assets/facility-18f-floorplan.png";
import elevatorIcon from "../../assets/icons/material-symbols-elevator-outlined.svg";
import { rotatePortraitPoint } from "./facility-18f";
import { D_HUB_TABLES, D_HUB_SEATS, D_HUB_DESK_WIDTH, D_HUB_DESK_HEIGHT, ROOM_TABLES, ROOM_DESK_SCALE, roomDeskPositions } from "./seat-layout";

interface PortraitPosition {
  x: number;
  y: number;
}

interface PlanLabel {
  id: string;
  lines: string[];
  size?: number;
  x: number;
  y: number;
}

// Label positions use the fixed landscape artwork coordinate system directly.
// Keeping these separate from the source portrait coordinates makes visual
// centering against the edited PNG explicit and independently adjustable.
const PLAN_LABELS: PlanLabel[] = [
  { id: "storage-top-left", lines: ["창고"], x: 41, y: 48 },
  { id: "space-a4", lines: ["SPACE A4"], size: 10, x: 150.85, y: 116 },
  { id: "space-m1", lines: ["SPACE M1"], size: 10, x: 262.85, y: 116 },
  { id: "space-m2", lines: ["SPACE M2"], size: 10, x: 391.85, y: 116 },
  { id: "space-m3", lines: ["SPACE M3"], size: 10, x: 519.85, y: 116 },
  { id: "relax-zone-m", lines: ["RELAX ZONE", "(M)"], size: 13, x: 1065, y: 107 },
  { id: "space-a3", lines: ["SPACE A3"], size: 10, x: 68, y: 130 },
  { id: "space-a2", lines: ["SPACE A2"], size: 10, x: 68, y: 225 },
  { id: "the-grond", lines: ["THE GROND"], size: 15, x: 360, y: 307 },
  { id: "d-hub", lines: ["D-HUB"], size: 15, x: 776, y: 35 },
  { id: "relax-zone-w", lines: ["RELAX ZONE", "(W)"], size: 13, x: 1093, y: 297 },
  { id: "space-a1", lines: ["SPACE A1"], size: 10, x: 68, y: 325 },
  { id: "storage-bottom-left", lines: ["창고"], x: 38, y: 593 },
  { id: "restroom-women", lines: ["화장실", "(여)"], x: 856, y: 524 },
  { id: "restroom-men", lines: ["화장실", "(남)"], x: 1019, y: 524 },
  { id: "storage-bottom-right", lines: ["창고"], x: 1124, y: 603 },
];

const ELEVATORS: Array<PortraitPosition & { id: string; emergency?: boolean }> = [
  { id: "elevator-1", x: 50, y: 292 },
  { id: "elevator-2", x: 150, y: 292 },
  { id: "elevator-3", x: 50, y: 470 },
  { id: "elevator-4", x: 150, y: 470 },
  { id: "emergency-elevator", emergency: true, x: 50, y: 555 },
];

function UprightPlanLabel({ id, lines, size = 14, x, y }: PlanLabel) {
  const lineHeight = size * 1.18;
  const firstLineY = y - ((lines.length - 1) * lineHeight / 2);

  return (
    <text
      className="facility-plan-label"
      data-plan-label={id}
      dominantBaseline="middle"
      fontSize={size}
      textAnchor="middle"
      x={x}
      y={firstLineY}
    >
      {lines.map((line, index) => (
        <tspan key={line} x={x} y={firstLineY + index * lineHeight}>{line}</tspan>
      ))}
    </text>
  );
}

function DeskChair({ x, y, rotation = 0 }: { x: number; y: number; rotation?: number }) {
  return (
    <g className="facility-desk-chair" transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <path d="M-6-14V-17Q-6-20-3-20H3Q6-20 6-17V-14Z" />
      <path d="M-5-17.5H5" fill="none" strokeLinecap="round" />
    </g>
  );
}

function RoomFurniture() {
  return (
    <g className="facility-room-furniture">
      {ROOM_TABLES.map((table) => {
        const columns = table.columns;
        const width = (columns - 1) * 40 + D_HUB_DESK_WIDTH;
        const desks = roomDeskPositions(columns);
        return (
        <g key={table.id} data-room-furniture={table.id} transform={`translate(${table.x} ${table.y}) rotate(${table.vertical ? 90 : 0}) scale(${ROOM_DESK_SCALE})`}>
          <rect className="facility-dhub-table" width={width} height="2" x={-width / 2} y="-1" rx="0.5" />
          {desks.map(({ x, y }, index) => (
            <g key={index} data-room-desk={`${table.id}-${index + 1}`}>
              <DeskChair x={x} y={y} rotation={y < 0 ? 0 : 180} />
              <rect className="facility-desk-surface" x={x - D_HUB_DESK_WIDTH / 2}
                y={y - D_HUB_DESK_HEIGHT / 2} width={D_HUB_DESK_WIDTH}
                height={D_HUB_DESK_HEIGHT} rx="2" />
            </g>
          ))}
        </g>
        );
      })}
    </g>
  );
}

/**
 * Fixed architectural base for the 18F map. Labels, facility symbols and all
 * interactive or live state belong to separate SVG/HTML overlay layers.
 */
export function FacilityPlanArtwork() {
  return (
    <>
      <img
        alt=""
        aria-hidden="true"
        className="facility-plan-artwork"
        draggable={false}
        height="953"
        src={facilityFloorplan}
        width="1650"
      />
      <svg
        aria-hidden="true"
        className="facility-plan-static-overlay"
        preserveAspectRatio="none"
        viewBox="0 0 1160 670"
      >
        <defs>
          <filter id="facility-wall-tone" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="linear" slope="0.55" intercept="0.45" />
              <feFuncG type="linear" slope="0.50" intercept="0.50" />
              <feFuncB type="linear" slope="0.46" intercept="0.54" />
            </feComponentTransfer>
          </filter>
        </defs>
        <g className="facility-inactive-areas">
          {/* Keep only the workspace rooms and their shared access corridor active. */}
          <path d="M8 8H74V90H8Z M976 8H1154V662H8V454H976Z" />
        </g>
        <g className="facility-dhub-furniture">
          {D_HUB_TABLES.map((table) => (
            <rect
              className="facility-dhub-table"
              data-table-id={table.id}
              height="2"
              key={table.id}
              rx="0.5"
              width={table.width}
              x={table.x - table.width / 2}
              y={table.y - 1}
            />
          ))}
          {D_HUB_SEATS.map((seat) => <DeskChair key={`chair-${seat.id}`} {...seat} />)}
          {D_HUB_SEATS.map((seat) => (
            <rect className="facility-desk-surface" key={`desk-${seat.id}`} data-desk-id={seat.id}
              x={seat.x - D_HUB_DESK_WIDTH / 2} y={seat.y - D_HUB_DESK_HEIGHT / 2}
              width={D_HUB_DESK_WIDTH} height={D_HUB_DESK_HEIGHT} rx="2" />
          ))}
        </g>
        <RoomFurniture />
        <g className="facility-plan-labels">
          {PLAN_LABELS.map((label) => <UprightPlanLabel key={label.id} {...label} />)}
        </g>
        <g className="facility-plan-elevators">
          {ELEVATORS.map(({ id, emergency = false, x, y }) => {
            const point = rotatePortraitPoint({ x, y });
            return (
              <g className="facility-elevator-symbol" key={id}>
                <image
                  height="38"
                  href={elevatorIcon}
                  width="38"
                  x={point.x - 19}
                  y={point.y - 19}
                />
                {emergency ? (
                  <text className="facility-elevator-caption" textAnchor="middle" x={point.x} y={point.y + 31}>
                    비상용
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </>
  );
}
