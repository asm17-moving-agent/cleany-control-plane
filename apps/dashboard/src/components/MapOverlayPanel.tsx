import type { ReactNode } from "react";
import "./map-overlay-panel.css";

/** Callers retain closing content until their exit animation completes. */
export function MapOverlayPanel({ open, className, children }: {
  open: boolean; className: string; children: ReactNode;
}) {
  return <div className={`map-overlay-panel ${className}${open ? " is-open" : ""}`} inert={!open} aria-hidden={!open}>{children}</div>;
}
