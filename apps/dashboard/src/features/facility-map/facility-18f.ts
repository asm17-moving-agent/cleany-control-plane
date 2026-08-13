export interface FacilityPoint {
  x: number;
  y: number;
}

export type FacilityZoneCategory = "WORKSPACE" | "COMMON";

export interface FacilityZone {
  id: string;
  label: string;
  shortLabel: string;
  category: FacilityZoneCategory;
  points: FacilityPoint[];
  center: FacilityPoint;
  selectable: true;
}

export const FACILITY_18F = {
  id: "facility-18f",
  name: "18층 운영 공간",
  floor: "18F",
  viewBox: "0 0 1023 1537",
  imageWidth: 1023,
  imageHeight: 1537,
} as const;

export const FACILITY_ZONES: FacilityZone[] = [
  {
    id: "space-a1",
    label: "SPACE A1",
    shortLabel: "A1",
    category: "WORKSPACE",
    points: [{ x: 368, y: 53 }, { x: 507, y: 53 }, { x: 507, y: 250 }, { x: 368, y: 250 }],
    center: { x: 438, y: 152 },
    selectable: true,
  },
  {
    id: "space-a2",
    label: "SPACE A2",
    shortLabel: "A2",
    category: "WORKSPACE",
    points: [{ x: 507, y: 53 }, { x: 640, y: 53 }, { x: 640, y: 250 }, { x: 507, y: 250 }],
    center: { x: 574, y: 152 },
    selectable: true,
  },
  {
    id: "space-a3",
    label: "SPACE A3",
    shortLabel: "A3",
    category: "WORKSPACE",
    points: [{ x: 640, y: 53 }, { x: 810, y: 53 }, { x: 810, y: 146 }, { x: 724, y: 250 }, { x: 640, y: 250 }],
    center: { x: 716, y: 151 },
    selectable: true,
  },
  {
    id: "space-a4",
    label: "SPACE A4",
    shortLabel: "A4",
    category: "WORKSPACE",
    points: [{ x: 810, y: 146 }, { x: 951, y: 146 }, { x: 951, y: 312 }, { x: 724, y: 312 }, { x: 724, y: 250 }],
    center: { x: 845, y: 230 },
    selectable: true,
  },
  {
    id: "space-m1",
    label: "SPACE M1",
    shortLabel: "M1",
    category: "WORKSPACE",
    points: [{ x: 723, y: 312 }, { x: 951, y: 312 }, { x: 951, y: 485 }, { x: 723, y: 485 }],
    center: { x: 837, y: 398 },
    selectable: true,
  },
  {
    id: "space-m2",
    label: "SPACE M2",
    shortLabel: "M2",
    category: "WORKSPACE",
    points: [{ x: 723, y: 485 }, { x: 951, y: 485 }, { x: 951, y: 651 }, { x: 723, y: 651 }],
    center: { x: 837, y: 568 },
    selectable: true,
  },
  {
    id: "space-m3",
    label: "SPACE M3",
    shortLabel: "M3",
    category: "WORKSPACE",
    points: [{ x: 723, y: 651 }, { x: 951, y: 651 }, { x: 951, y: 823 }, { x: 723, y: 823 }],
    center: { x: 837, y: 737 },
    selectable: true,
  },
  {
    id: "the-grond",
    label: "THE GROND",
    shortLabel: "THE GROND",
    category: "COMMON",
    points: [{ x: 318, y: 251 }, { x: 723, y: 251 }, { x: 723, y: 823 }, { x: 318, y: 823 }],
    center: { x: 520, y: 537 },
    selectable: true,
  },
  {
    id: "d-hub",
    label: "D-HUB",
    shortLabel: "D-HUB",
    category: "COMMON",
    points: [{ x: 382, y: 823 }, { x: 951, y: 823 }, { x: 951, y: 1285 }, { x: 382, y: 1285 }],
    center: { x: 666, y: 1054 },
    selectable: true,
  },
  {
    id: "relax-zone-w",
    label: "RELAX ZONE (W)",
    shortLabel: "RELAX W",
    category: "COMMON",
    points: [{ x: 382, y: 1285 }, { x: 690, y: 1285 }, { x: 690, y: 1493 }, { x: 382, y: 1493 }],
    center: { x: 536, y: 1389 },
    selectable: true,
  },
  {
    id: "relax-zone-m",
    label: "RELAX ZONE (M)",
    shortLabel: "RELAX M",
    category: "COMMON",
    points: [{ x: 690, y: 1285 }, { x: 951, y: 1285 }, { x: 951, y: 1493 }, { x: 690, y: 1493 }],
    center: { x: 821, y: 1389 },
    selectable: true,
  },
];

export function pointsToSvg(points: FacilityPoint[]) {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

export function getFacilityZone(zoneId: string | null | undefined) {
  return FACILITY_ZONES.find(({ id }) => id === zoneId) ?? null;
}
