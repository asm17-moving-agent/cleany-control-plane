import { fitMapBounds, type MapBounds } from "./map-viewport";

export type MapView = { mode: "initial" | "active" | "all" } | { mode: "manual"; zoom: number; x: number; y: number };
export type MapFrame = { width: number; height: number };
export const INITIAL_MAP_ZOOM = 1.25;
export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 4;
export function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

export function resolveMapCamera(view: MapView, frame: MapFrame, fullBounds: MapBounds, activeBounds: MapBounds, overlayInsetLeft = 0) {
  const { width, height } = fullBounds;
  const fit = fitMapBounds(fullBounds, frame).scale;
  const inset = Math.min(overlayInsetLeft, frame.width * .4);
  const available = { ...frame, width: frame.width - inset };
  const fitted = fitMapBounds(view.mode === "active" ? activeBounds : fullBounds, available);
  const initialFit = fitMapBounds(activeBounds, available);
  let camera: { zoom: number; x: number; y: number };
  if (view.mode === "manual") camera = view;
  else if (view.mode === "initial") {
    camera = inset > 0
      ? { zoom: initialFit.scale / fit, x: initialFit.x - inset / (2 * initialFit.scale), y: frame.height / (2 * initialFit.scale) - 16 / initialFit.scale + activeBounds.y }
      : { zoom: INITIAL_MAP_ZOOM, x: width / 2, y: frame.height / (2 * fit * INITIAL_MAP_ZOOM) };
  } else camera = { zoom: fitted.scale / fit, x: fitted.x - inset / (2 * fitted.scale), y: fitted.y };
  const scale = fit * camera.zoom;
  const visibleWidth = frame.width / scale;
  const visibleHeight = frame.height / scale;
  const centerX = view.mode !== "manual" ? camera.x : visibleWidth >= width ? width / 2 : clamp(camera.x, visibleWidth / 2, width - visibleWidth / 2);
  const centerY = view.mode !== "manual" ? camera.y : visibleHeight >= height ? height / 2 : clamp(camera.y, visibleHeight / 2, height - visibleHeight / 2);
  return { zoom: camera.zoom, scale, centerX, centerY,
    transform: `translate(${frame.width / 2 - centerX * scale}px, ${frame.height / 2 - centerY * scale}px) scale(${scale})` };
}

export type MapCamera = ReturnType<typeof resolveMapCamera>;
export function zoomMapCamera(camera: MapCamera, factor: number): MapView {
  return { mode: "manual", zoom: clamp(camera.zoom * factor, MIN_MAP_ZOOM, MAX_MAP_ZOOM), x: camera.centerX, y: camera.centerY };
}
export function panMapCamera(camera: MapCamera, start: { x: number; y: number }, delta: { x: number; y: number }, bounds: MapBounds): MapView {
  return { mode: "manual", zoom: camera.zoom, x: clamp(start.x - delta.x / camera.scale, 0, bounds.width), y: clamp(start.y - delta.y / camera.scale, 0, bounds.height) };
}
