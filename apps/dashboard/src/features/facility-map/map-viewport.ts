export interface MapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fitMapBounds(bounds: MapBounds, frame: { width: number; height: number }) {
  const padding = 16;
  return {
    scale: Math.max(0.01, Math.min((frame.width - padding * 2) / bounds.width, (frame.height - padding * 2) / bounds.height)),
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}
