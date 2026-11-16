import type { Robot } from "../api/types";
import { ROBOT_MODEL } from "./robot-model-asset";
import { RobotStateBadge } from "./RobotStateBadge";
import { BatteryStatus } from "./BatteryStatus";
import { ChevronIcon } from "./WorkspaceIcons";
import "./robot-summary.css";

/** Shared presentation; the caller retains button selection or link navigation semantics. */
export function RobotSummaryContent({ robot, assignment, showBattery = true }: { robot: Robot; assignment?: string; showBattery?: boolean }) {
  return <><span className="robot-summary-thumbnail"><img src={ROBOT_MODEL.poster} alt="" width="56" height="64" /></span>
    <span className="robot-summary-copy"><strong>{robot.robot_id}</strong><RobotStateBadge state={robot.state} />{assignment && <small>{assignment}</small>}{showBattery && <BatteryStatus compact />}</span>
    <ChevronIcon aria-hidden="true" /></>;
}
