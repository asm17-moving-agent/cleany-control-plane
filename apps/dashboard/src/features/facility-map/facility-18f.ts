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

export const PORTRAIT_PLAN_WIDTH = 670;
export const PORTRAIT_PLAN_HEIGHT = 1160;

export function rotatePortraitPoint({ x, y }: FacilityPoint): FacilityPoint {
  return { x: y, y: PORTRAIT_PLAN_WIDTH - x };
}

export const FACILITY_18F = {
  id: "facility-18f",
  name: "18층 운영 공간",
  floor: "18F",
  viewBox: `0 0 ${PORTRAIT_PLAN_HEIGHT} ${PORTRAIT_PLAN_WIDTH}`,
  imageWidth: PORTRAIT_PLAN_HEIGHT,
  imageHeight: PORTRAIT_PLAN_WIDTH,
  orientation: "landscape",
} as const;

// Workspace rooms and their shared access corridor, before the gray areas at
// x=976 (relax zones) and y=454 (lifts, restrooms and storage) in the artwork.
export const FACILITY_ACTIVE_BOUNDS = { x: 8, y: 8, width: 968, height: 446 } as const;

type PortraitFacilityZone = Omit<FacilityZone, "points" | "center"> & {
  points: FacilityPoint[];
  center: FacilityPoint;
};

const PORTRAIT_FACILITY_ZONES: PortraitFacilityZone[] = [
  {
    id: "space-a1",
    label: "SPACE A1",
    shortLabel: "A1",
    category: "WORKSPACE",
    points: [{ x: 258, y: 2 }, { x: 359, y: 2 }, { x: 359, y: 142 }, { x: 258, y: 142 }],
    center: { x: 309, y: 72 },
    selectable: true,
  },
  {
    id: "space-a2",
    label: "SPACE A2",
    shortLabel: "A2",
    category: "WORKSPACE",
    points: [{ x: 359, y: 2 }, { x: 458, y: 2 }, { x: 458, y: 142 }, { x: 359, y: 142 }],
    center: { x: 408, y: 72 },
    selectable: true,
  },
  {
    id: "space-a3",
    label: "SPACE A3",
    shortLabel: "A3",
    category: "WORKSPACE",
    points: [{ x: 458, y: 2 }, { x: 580, y: 2 }, { x: 580, y: 69 }, { x: 512, y: 142 }, { x: 458, y: 142 }],
    center: { x: 514, y: 72 },
    selectable: true,
  },
  {
    id: "space-a4",
    label: "SPACE A4",
    shortLabel: "A4",
    category: "WORKSPACE",
    points: [{ x: 580, y: 69 }, { x: 666, y: 69 }, { x: 666, y: 187 }, { x: 512, y: 187 }, { x: 512, y: 142 }],
    center: { x: 600, y: 145 },
    selectable: true,
  },
  {
    id: "space-m1",
    label: "SPACE M1",
    shortLabel: "M1",
    category: "WORKSPACE",
    points: [{ x: 512, y: 187 }, { x: 666, y: 187 }, { x: 666, y: 313 }, { x: 512, y: 313 }],
    center: { x: 600, y: 250 },
    selectable: true,
  },
  {
    id: "space-m2",
    label: "SPACE M2",
    shortLabel: "M2",
    category: "WORKSPACE",
    points: [{ x: 512, y: 313 }, { x: 666, y: 313 }, { x: 666, y: 442 }, { x: 512, y: 442 }],
    center: { x: 600, y: 378 },
    selectable: true,
  },
  {
    id: "space-m3",
    label: "SPACE M3",
    shortLabel: "M3",
    category: "WORKSPACE",
    points: [{ x: 512, y: 442 }, { x: 666, y: 442 }, { x: 666, y: 569 }, { x: 512, y: 569 }],
    center: { x: 600, y: 506 },
    selectable: true,
  },
  {
    id: "the-grond",
    label: "THE GROND",
    shortLabel: "THE GROND",
    category: "COMMON",
    points: [{ x: 204, y: 142 }, { x: 512, y: 142 }, { x: 512, y: 569 }, { x: 257, y: 569 }, { x: 257, y: 712 }, { x: 204, y: 712 }],
    center: { x: 390, y: 360 },
    selectable: true,
  },
  {
    id: "d-hub",
    label: "D-HUB",
    shortLabel: "D-HUB",
    category: "COMMON",
    points: [{ x: 257, y: 569 }, { x: 666, y: 569 }, { x: 666, y: 969 }, { x: 312, y: 969 }, { x: 278, y: 958 }, { x: 257, y: 935 }],
    center: { x: 462, y: 760 },
    selectable: true,
  },
  {
    id: "relax-zone-w",
    label: "RELAX ZONE (W)",
    shortLabel: "RELAX W",
    category: "COMMON",
    // The photographed plan has a short entrance corridor above the W zone.
    // Keep that corridor outside the selectable polygon instead of extending
    // the zone up to the D-HUB boundary.
    points: [{ x: 278, y: 1025 }, { x: 467, y: 1025 }, { x: 467, y: 1156 }, { x: 278, y: 1156 }],
    center: { x: 380, y: 1091 },
    selectable: true,
  },
  {
    id: "relax-zone-m",
    label: "RELAX ZONE (M)",
    shortLabel: "RELAX M",
    category: "COMMON",
    points: [{ x: 467, y: 969 }, { x: 666, y: 969 }, { x: 666, y: 1156 }, { x: 467, y: 1156 }],
    center: { x: 570, y: 1063 },
    selectable: true,
  },
];

export const FACILITY_ZONES: FacilityZone[] = PORTRAIT_FACILITY_ZONES
  .filter(({ id }) => !id.startsWith("relax-zone-"))
  .map((zone) => ({
  ...zone,
  points: zone.points.map(rotatePortraitPoint),
  center: rotatePortraitPoint(zone.center),
}));

export function pointsToSvg(points: FacilityPoint[]) {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

export function getFacilityZone(zoneId: string | null | undefined) {
  return FACILITY_ZONES.find(({ id }) => id === zoneId) ?? null;
}
