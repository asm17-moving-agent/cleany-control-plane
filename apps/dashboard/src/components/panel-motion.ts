import type { CSSProperties } from "react";

export const PANEL_TRANSITION_MS = 200;
export const panelMotionStyle = {
  "--panel-transition-duration": `${PANEL_TRANSITION_MS}ms`,
} as CSSProperties;
