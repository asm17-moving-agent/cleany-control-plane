import { StatusBadge } from "./patterns";
import type { RobotState } from "../api/types";
import { robotStateLabels } from "../lib/home-summary";
import "./robot-state-badge.css";

export function RobotStateBadge({ state }: { state: RobotState }) {
  return <StatusBadge tone={state === "ERROR" || state === "OFFLINE" ? "danger" : state === "BUSY" ? "info" : "neutral"} className="robot-state-badge" data-state={state}>{robotStateLabels[state]}</StatusBadge>;
}
