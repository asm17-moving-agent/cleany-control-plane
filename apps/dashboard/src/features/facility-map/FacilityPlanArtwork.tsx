import facilityFloorplan from "../../assets/facility-18f-floorplan.png";
import elevatorIcon from "../../assets/icons/material-symbols-elevator-outlined.svg";
import { rotatePortraitPoint } from "./facility-18f";

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

interface DHubTable {
  id: string;
  x: number;
  y: number;
  width: number;
}

// Label positions use the fixed landscape artwork coordinate system directly.
// Keeping these separate from the source portrait coordinates makes visual
// centering against the edited PNG explicit and independently adjustable.
const PLAN_LABELS: PlanLabel[] = [
  { id: "storage-top-left", lines: ["창고"], x: 41, y: 48 },
  { id: "space-a4", lines: ["SPACE A4"], size: 12, x: 154, y: 125 },
  { id: "space-m1", lines: ["SPACE M1"], size: 12, x: 282, y: 125 },
  { id: "space-m2", lines: ["SPACE M2"], size: 12, x: 412, y: 125 },
  { id: "space-m3", lines: ["SPACE M3"], size: 12, x: 540, y: 125 },
  { id: "relax-zone-m", lines: ["RELAX ZONE", "(M)"], size: 13, x: 1065, y: 107 },
  { id: "space-a3", lines: ["SPACE A3"], size: 12, x: 68, y: 134 },
  { id: "space-a2", lines: ["SPACE A2"], size: 12, x: 68, y: 291 },
  { id: "the-grond", lines: ["THE GROND"], size: 15, x: 360, y: 307 },
  { id: "d-hub", lines: ["D-HUB"], size: 15, x: 776, y: 35 },
  { id: "relax-zone-w", lines: ["RELAX ZONE", "(W)"], size: 13, x: 1093, y: 297 },
  { id: "space-a1", lines: ["SPACE A1"], size: 12, x: 68, y: 330 },
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

// Each row has three shared tables with 3 / 2 / 3 opposing seat pairs.
const D_HUB_TABLE_COLUMNS = [620, 650, 680, 760, 790, 870, 900, 930] as const;
const D_HUB_SEAT_PAIRS = [105, 205, 305].flatMap((y, row) =>
  D_HUB_TABLE_COLUMNS.map((x, column) => ({
    id: `table-${String(row * D_HUB_TABLE_COLUMNS.length + column + 1).padStart(2, "0")}`,
    x,
    y,
  })),
);
const D_HUB_TABLES: DHubTable[] = [105, 205, 305].flatMap((y, row) =>
  [{ x: 650, width: 88 }, { x: 775, width: 58 }, { x: 900, width: 88 }].map((table, column) => ({
    ...table,
    id: `table-${row * 3 + column + 1}`,
    y,
  })),
);

const D_HUB_SEAT_WIDTH = 20 * 1.3;
const D_HUB_SEAT_HEIGHT = 22 * 1.3;
const D_HUB_SEATS = D_HUB_SEAT_PAIRS.flatMap((table, tableIndex) => [
  {
    id: `seat-${String(tableIndex * 2 + 1).padStart(2, "0")}`,
    rotation: 0,
    x: table.x,
    y: table.y - 30,
  },
  {
    id: `seat-${String(tableIndex * 2 + 2).padStart(2, "0")}`,
    rotation: 180,
    x: table.x,
    y: table.y + 30,
  },
]);

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

const ROOM_TABLES = [
  { id: "space-a4", x: 154, y: 66, vertical: false },
  { id: "space-m1", x: 282, y: 66, vertical: false },
  { id: "space-m2", x: 412, y: 66, vertical: false },
  { id: "space-m3", x: 540, y: 66, vertical: false },
  { id: "space-a3", x: 68, y: 175, vertical: true },
  { id: "space-a2", x: 68, y: 251, vertical: true },
  { id: "space-a1", x: 68, y: 370, vertical: true },
];

function RoomFurniture() {
  return (
    <g className="facility-room-furniture">
      {ROOM_TABLES.map((table) => (
        <g key={table.id} data-room-furniture={table.id} transform={`translate(${table.x} ${table.y}) rotate(${table.vertical ? 90 : 0})`}>
          <rect className="facility-room-table" width="58" height="30" x="-29" y="-15" rx="3" />
          {[-15, 15].flatMap((x) => [-30, 30].map((y) => (
            <use
              key={`${x}-${y}`}
              className="facility-static-seat"
              href="#facility-seat-symbol"
              width={D_HUB_SEAT_WIDTH}
              height={D_HUB_SEAT_HEIGHT}
              x={x - D_HUB_SEAT_WIDTH / 2}
              y={y - D_HUB_SEAT_HEIGHT / 2}
              transform={`rotate(${y < 0 ? 0 : 180} ${x} ${y})`}
            />
          )))}
        </g>
      ))}
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
          <symbol id="facility-seat-symbol" viewBox="0 0 20 22">
            <rect className="facility-seat-back" height="4" rx="1" width="9" x="5.5" y="1" />
            <rect className="facility-seat-cushion" height="14" rx="1.5" width="12" x="4" y="5" />
            <path className="facility-seat-frame" d="M4 7H2.5Q1 7 1 8.5V15.5Q1 17 2.5 17H4M16 7H17.5Q19 7 19 8.5V15.5Q19 17 17.5 17H16" />
          </symbol>
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
              height="30"
              key={table.id}
              rx="3"
              width={table.width}
              x={table.x - table.width / 2}
              y={table.y - 15}
            />
          ))}
          {D_HUB_SEATS.map((seat) => (
            <use
              className="facility-static-seat"
              data-seat-id={seat.id}
              height={D_HUB_SEAT_HEIGHT}
              href="#facility-seat-symbol"
              key={seat.id}
              transform={`rotate(${seat.rotation} ${seat.x} ${seat.y})`}
              width={D_HUB_SEAT_WIDTH}
              x={seat.x - D_HUB_SEAT_WIDTH / 2}
              y={seat.y - D_HUB_SEAT_HEIGHT / 2}
            />
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
