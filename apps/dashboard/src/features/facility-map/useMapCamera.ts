import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type TransitionEvent } from "react";
import type { MapBounds } from "./map-viewport";
import { resolveMapCamera, zoomMapCamera, panMapCamera, MIN_MAP_ZOOM, MAX_MAP_ZOOM, type MapView } from "./map-camera";

export function useMapCamera({ robots, selectedRobotId, robotFocusKey, fullBounds, activeBounds, overlayInsetLeft }: {
  robots: { robotId: string; x: number; y: number }[]; selectedRobotId: string | null; robotFocusKey: number;
  fullBounds: MapBounds; activeBounds: MapBounds; overlayInsetLeft: number;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 900, height: 650 });
  const [view, setView] = useState<MapView>({ mode: "initial" });
  const [focusMotion, setFocusMotion] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const camera = resolveMapCamera(view, frame, fullBounds, activeBounds, overlayInsetLeft);
  const { centerX, centerY } = camera;
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth && element.clientHeight) setFrame({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Refreshes move the marker, but only an explicit selection/focus request moves the camera.
  useEffect(() => {
    const robot = robots.find((item) => item.robotId === selectedRobotId);
    if (robot) {
      setFocusMotion(true);
      setView({ mode: "manual", zoom: Math.max(1.5, camera.zoom), x: robot.x, y: robot.y });
    }
  }, [selectedRobotId, robotFocusKey]);
  function zoomBy(factor: number) {
    setFocusMotion(false);
    setView(zoomMapCamera(camera, factor));
  }
  function beginPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    setFocusMotion(false);
    drag.current = { clientX: event.clientX, clientY: event.clientY, x: centerX, y: centerY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }
  function pan(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const start = drag.current;
    setView(panMapCamera(camera, start, { x: event.clientX - start.clientX, y: event.clientY - start.clientY }, fullBounds));
  }
  function endPan() { drag.current = null; setDragging(false); }

  function endFocus(event: TransitionEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && event.propertyName === "transform") setFocusMotion(false);
  }
  return { stage, view, camera, dragging, focusMotion, zoomBy,
    fitView: (mode: "active" | "all") => setView({ mode }),
    canZoomIn: camera.zoom < MAX_MAP_ZOOM, canZoomOut: camera.zoom > MIN_MAP_ZOOM,
    panHandlers: { onPointerDown: beginPan, onPointerMove: pan, onPointerUp: endPan, onPointerCancel: endPan }, endFocus };
}
