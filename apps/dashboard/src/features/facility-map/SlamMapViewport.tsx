import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { scopedUrl } from "../../api/client";
import type { SlamMapMetadata } from "./slam-map";
import { SlamRaster } from "./SlamRaster";
import { useMapCamera } from "./useMapCamera";
import { Slider } from "../../components/ui/slider";
import "./facility-map.css";
import "./slam-map.css";

export function SlamMapViewport({ map, siteId, overlayInsetLeft = 0, robots = [], selectedRobotId = null, robotFocusKey = 0, children, footer }: {
  map: SlamMapMetadata; siteId: string; overlayInsetLeft?: number;
  robots?: { robotId: string; x: number; y: number }[]; selectedRobotId?: string | null; robotFocusKey?: number;
  children: (view: { scale: number; stage: HTMLDivElement | null }) => ReactNode; footer?: ReactNode;
}) {
  const [imageErrors, setImageErrors] = useState({ floorplan: false, slam: false });
  const onSlamLoad = useCallback(() => setImageErrors(current => ({ ...current, slam: false })), []);
  const onSlamError = useCallback(() => setImageErrors(current => ({ ...current, slam: true })), []);
  const storageKey = `cleany.map-blend:${siteId}:${map.map_id}`;
  const [blend, setBlend] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey) ?? 0);
      return Number.isFinite(saved) ? Math.max(0, Math.min(100, saved)) : 0;
    } catch { return 0; }
  });
  const presentation = map.presentation;
  const layers = presentation?.layers;
  const amount = presentation ? blend / 100 : 1;
  const updateBlend = (value: number) => {
    setBlend(value);
    try { localStorage.setItem(storageKey, String(value)); } catch { /* Storage may be unavailable. */ }
  };
  // Edited exports already use the presentation canvas; older bundles still need the rigid transform.
  const rasterStyle = !layers && presentation ? { transform: `matrix(${presentation.transform.join(",")})` } : {};
  const bounds = { x: 0, y: 0, width: presentation?.width ?? map.width, height: presentation?.height ?? map.height };
  const { stage, camera, dragging, panHandlers, zoomBy, fitView, canZoomIn, canZoomOut } = useMapCamera({
    robots, selectedRobotId, robotFocusKey, fullBounds: bounds, activeBounds: bounds, overlayInsetLeft, initialMode: "all",
  });
  return <div className="facility-map-shell slam-map-shell">
    <div className={"facility-map-stage" + (dragging ? " is-panning" : "")} ref={stage} {...panHandlers}>
      <div className="facility-plan-canvas" style={{ width: bounds.width, height: bounds.height, "--map-scale": camera.scale, transform: camera.transform } as CSSProperties}>
        <div className="slam-map-background">
          {presentation && <img className="slam-map-raster" data-map-layer="floorplan"
            style={{ ...rasterStyle, opacity: 1 - amount }}
            src={scopedUrl(layers?.floorplan_url ?? presentation.image_url ?? "/api/map/presentation")}
            width={layers ? bounds.width : map.width} height={layers ? bounds.height : map.height}
            alt="시설 도면" draggable={false}
            onLoad={() => setImageErrors(current => ({ ...current, floorplan: false }))}
            onError={() => setImageErrors(current => ({ ...current, floorplan: true }))} />}
          <SlamRaster
            style={{ ...rasterStyle, opacity: amount }}
            src={scopedUrl(layers?.slam_url ?? map.image_url ?? "/api/map/image")}
            width={layers ? bounds.width : map.width} height={layers ? bounds.height : map.height}
            onLoad={onSlamLoad} onError={onSlamError} />
        </div>
        {children({ scale: camera.scale, stage: stage.current })}
      </div>
      {presentation && <div className="slam-map-blend" onPointerDown={event => event.stopPropagation()}>
        <span>도면</span>
        <Slider aria-label="도면과 SLAM 혼합 비율" aria-valuetext={`도면 ${100 - blend}%, SLAM ${blend}%`}
          min={0} max={100} step={1} value={blend} onChange={event => updateBlend(Number(event.target.value))} />
        <span>SLAM</span>
      </div>}
      <div className="slam-map-scale" aria-label="지도 축척 2미터"><span style={{ width: 2 / map.resolution * camera.scale }} />2 m</div>
      <div className="facility-map-controls" aria-label="지도 조작"><div className="facility-map-zoom-controls">
        <button aria-label="지도 확대" disabled={!canZoomIn} onClick={() => zoomBy(1.25)}>+</button>
        <button aria-label="지도 축소" disabled={!canZoomOut} onClick={() => zoomBy(0.8)}>−</button>
      </div><button onClick={() => fitView("all")}>전체 보기</button></div>
    </div>
    <div className="facility-map-legend" aria-label="지도 범례"><strong>시설 지도</strong>
      {footer}
      {imageErrors.floorplan && <span role="alert">도면 이미지를 불러오지 못했습니다.</span>}
      {imageErrors.slam && <span role="alert">SLAM 이미지를 불러오지 못했습니다.</span>}
    </div>
  </div>;
}
