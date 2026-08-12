export interface FacilityPoint {
  x: number;
  y: number;
}

export type FacilityZoneCategory = "WORKSPACE" | "COMMON" | "UTILITY" | "STORAGE";

export interface FacilityZone {
  id: string;
  label: string;
  shortLabel: string;
  category: FacilityZoneCategory;
  points: FacilityPoint[];
  center: FacilityPoint;
  selectable: boolean;
}

export interface FacilityPoi {
  id: string;
  label: string;
  kind: "ELEVATOR" | "RESTROOM" | "STAIRS" | "EXIT" | "CHARGER";
  position: FacilityPoint;
}

export const FACILITY_18F = {
  id: "facility-18f",
  name: "18층 운영 공간",
  floor: "18F",
  viewBox: "0 0 700 780",
} as const;

export const FACILITY_ZONES: FacilityZone[] = [
  {
    id: "space-a1",
    label: "SPACE A1",
    shortLabel: "A1",
    category: "WORKSPACE",
    points: [{ x: 270, y: 38 }, { x: 360, y: 38 }, { x: 360, y: 142 }, { x: 300, y: 142 }, { x: 300, y: 118 }, { x: 270, y: 118 }],
    center: { x: 315, y: 82 },
    selectable: true,
  },
  {
    id: "space-a2",
    label: "SPACE A2",
    shortLabel: "A2",
    category: "WORKSPACE",
    points: [{ x: 365, y: 38 }, { x: 455, y: 38 }, { x: 455, y: 138 }, { x: 425, y: 138 }, { x: 425, y: 115 }, { x: 365, y: 115 }],
    center: { x: 410, y: 82 },
    selectable: true,
  },
  {
    id: "space-a3",
    label: "SPACE A3",
    shortLabel: "A3",
    category: "WORKSPACE",
    points: [{ x: 460, y: 38 }, { x: 550, y: 38 }, { x: 550, y: 112 }, { x: 520, y: 142 }, { x: 460, y: 142 }],
    center: { x: 505, y: 82 },
    selectable: true,
  },
  {
    id: "space-a4",
    label: "SPACE A4",
    shortLabel: "A4",
    category: "WORKSPACE",
    points: [{ x: 550, y: 82 }, { x: 662, y: 82 }, { x: 662, y: 165 }, { x: 532, y: 165 }, { x: 532, y: 140 }, { x: 550, y: 122 }],
    center: { x: 608, y: 123 },
    selectable: true,
  },
  {
    id: "space-m1",
    label: "SPACE M1",
    shortLabel: "M1",
    category: "WORKSPACE",
    points: [{ x: 520, y: 172 }, { x: 662, y: 172 }, { x: 662, y: 252 }, { x: 548, y: 252 }, { x: 548, y: 225 }, { x: 520, y: 225 }],
    center: { x: 602, y: 210 },
    selectable: true,
  },
  {
    id: "space-m2",
    label: "SPACE M2",
    shortLabel: "M2",
    category: "WORKSPACE",
    points: [{ x: 548, y: 258 }, { x: 662, y: 258 }, { x: 662, y: 338 }, { x: 548, y: 338 }],
    center: { x: 605, y: 298 },
    selectable: true,
  },
  {
    id: "space-m3",
    label: "SPACE M3",
    shortLabel: "M3",
    category: "WORKSPACE",
    points: [{ x: 548, y: 344 }, { x: 662, y: 344 }, { x: 662, y: 425 }, { x: 520, y: 425 }, { x: 520, y: 390 }, { x: 548, y: 390 }],
    center: { x: 605, y: 382 },
    selectable: true,
  },
  {
    id: "the-grond",
    label: "THE GROND",
    shortLabel: "THE GROND",
    category: "COMMON",
    points: [{ x: 275, y: 155 }, { x: 510, y: 155 }, { x: 510, y: 425 }, { x: 275, y: 425 }],
    center: { x: 392, y: 290 },
    selectable: true,
  },
  {
    id: "d-hub",
    label: "D-HUB",
    shortLabel: "D-HUB",
    category: "COMMON",
    points: [{ x: 292, y: 435 }, { x: 662, y: 435 }, { x: 662, y: 650 }, { x: 292, y: 650 }],
    center: { x: 477, y: 542 },
    selectable: true,
  },
  {
    id: "relax-zone-w",
    label: "RELAX ZONE (W)",
    shortLabel: "RELAX W",
    category: "COMMON",
    points: [{ x: 350, y: 660 }, { x: 505, y: 660 }, { x: 505, y: 748 }, { x: 350, y: 748 }],
    center: { x: 428, y: 704 },
    selectable: true,
  },
  {
    id: "relax-zone-m",
    label: "RELAX ZONE (M)",
    shortLabel: "RELAX M",
    category: "COMMON",
    points: [{ x: 512, y: 660 }, { x: 662, y: 660 }, { x: 662, y: 748 }, { x: 512, y: 748 }],
    center: { x: 587, y: 704 },
    selectable: true,
  },
  {
    id: "storage-north-west",
    label: "창고",
    shortLabel: "창고",
    category: "STORAGE",
    points: [{ x: 38, y: 38 }, { x: 150, y: 38 }, { x: 150, y: 92 }, { x: 38, y: 92 }],
    center: { x: 94, y: 65 },
    selectable: false,
  },
  {
    id: "storage-north-east",
    label: "창고",
    shortLabel: "창고",
    category: "STORAGE",
    points: [{ x: 550, y: 38 }, { x: 662, y: 38 }, { x: 662, y: 76 }, { x: 550, y: 76 }],
    center: { x: 606, y: 57 },
    selectable: false,
  },
];

export const FACILITY_POIS: FacilityPoi[] = [
  { id: "stairs-north", label: "계단", kind: "STAIRS", position: { x: 74, y: 142 } },
  { id: "elevator-north-1", label: "엘리베이터", kind: "ELEVATOR", position: { x: 76, y: 215 } },
  { id: "elevator-north-2", label: "엘리베이터", kind: "ELEVATOR", position: { x: 170, y: 215 } },
  { id: "elevator-middle-1", label: "엘리베이터", kind: "ELEVATOR", position: { x: 76, y: 330 } },
  { id: "elevator-middle-2", label: "엘리베이터", kind: "ELEVATOR", position: { x: 170, y: 330 } },
  { id: "restroom-w", label: "화장실 (여)", kind: "RESTROOM", position: { x: 170, y: 555 } },
  { id: "restroom-m", label: "화장실 (남)", kind: "RESTROOM", position: { x: 170, y: 680 } },
  { id: "exit-north", label: "비상구", kind: "EXIT", position: { x: 92, y: 170 } },
  { id: "exit-south", label: "비상구", kind: "EXIT", position: { x: 70, y: 626 } },
  { id: "charger", label: "충전 위치", kind: "CHARGER", position: { x: 286, y: 720 } },
];

export function pointsToSvg(points: FacilityPoint[]) {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

export function getFacilityZone(zoneId: string | null | undefined) {
  return FACILITY_ZONES.find(({ id }) => id === zoneId) ?? null;
}
