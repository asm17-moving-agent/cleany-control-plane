import { useEffect, useState, type CSSProperties } from "react";
import { createSlamDisplayUrl } from "./slam-raster";

export function SlamRaster({ src, width, height, style, onLoad, onError }: {
  src: string; width: number; height: number; style: CSSProperties;
  onLoad: () => void; onError: () => void;
}) {
  const [display, setDisplay] = useState<{ source: string; url: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    void createSlamDisplayUrl(src).then(url => {
      if (cancelled) { URL.revokeObjectURL(url); return; }
      objectUrl = url;
      setDisplay({ source: src, url });
    }).catch(() => { if (!cancelled) onError(); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, onError]);
  const url = display?.source === src ? display.url : undefined;
  return <img className="slam-map-raster" data-map-layer="slam" src={url}
    width={width} height={height} style={{ ...style, visibility: url ? "visible" : "hidden" }}
    alt="SLAM 지도" draggable={false} onLoad={onLoad} onError={onError} />;
}
