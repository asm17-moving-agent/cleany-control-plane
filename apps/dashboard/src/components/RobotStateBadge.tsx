import type { RobotState } from "../api/types";
import { robotStateLabels } from "../lib/home-summary";
import "./robot-state-badge.css";

export function RobotStateBadge({ state }: { state: RobotState }) {
  return <span className="workspace-state robot-state-badge" data-state={state}>{robotStateLabels[state]}</span>;
}
