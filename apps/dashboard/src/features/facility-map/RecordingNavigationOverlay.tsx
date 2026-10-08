import type { RecordingPath } from "../../operations/recording-route";
import { FACILITY_18F } from "./facility-18f";

export function RecordingNavigationOverlay({ path }: { path: RecordingPath; scale: number }) {
  return <svg className="facility-movement-path" viewBox={`0 0 ${FACILITY_18F.imageWidth} ${FACILITY_18F.imageHeight}`}
    role="img" aria-label="촬영용 이동 경로">
    <polyline points={path.points.map(p => `${p.x},${p.y}`).join(" ")}
      stroke="var(--color-border-strong)" strokeOpacity=".48" strokeWidth="2" vectorEffect="non-scaling-stroke" />
  </svg>;
}
