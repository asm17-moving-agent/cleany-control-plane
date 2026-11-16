import type { components } from "../../api/generated/openapi";
export type SlamMapMetadata = components["schemas"]["SlamMap"];

/** ROS map coordinates to raster edges; image rows run opposite to map Y. */
export function slamToPixel(map: SlamMapMetadata, x: number, y: number, yaw?: number | null) {
  const [ox, oy, angle] = map.origin;
  const dx = x - ox, dy = y - oy;
  return {
    x: (Math.cos(angle) * dx + Math.sin(angle) * dy) / map.resolution,
    y: map.height - (-Math.sin(angle) * dx + Math.cos(angle) * dy) / map.resolution,
    heading: yaw == null ? undefined : -(yaw - angle) * 180 / Math.PI,
  };
}

/** Apply the same rigid viewport transform to both raster and robot pose. */
export function slamPixelToDisplay(map: SlamMapMetadata, point: ReturnType<typeof slamToPixel>) {
  if (!map.presentation) return point;
  const [a, b, c, d, e, f] = map.presentation.transform;
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
    heading: point.heading === undefined ? undefined : point.heading + map.presentation.rotation_degrees,
  };
}

/** Invert presentation and ROS origin transforms; artwork changes do not move saved seats. */
export function displayToSlam(map: SlamMapMetadata, x: number, y: number) {
  if (map.presentation) {
    const [a, b, c, d, e, f] = map.presentation.transform;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-10) throw new Error("지도 변환을 역산할 수 없습니다.");
    [x, y] = [(d * (x - e) - c * (y - f)) / determinant, (-b * (x - e) + a * (y - f)) / determinant];
  }
  const [ox, oy, yaw] = map.origin;
  const mx = x * map.resolution, my = (map.height - y) * map.resolution;
  return { x: ox + Math.cos(yaw) * mx - Math.sin(yaw) * my, y: oy + Math.sin(yaw) * mx + Math.cos(yaw) * my };
}
