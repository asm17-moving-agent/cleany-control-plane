import { BatteryIcon } from "./WorkspaceIcons";
import "./battery-status.css";

// RobotResponse does not provide battery telemetry yet.
export function BatteryStatus({ compact = false }: { compact?: boolean }) {
  return compact
    ? <span className="battery-status" aria-label="배터리 미연동"><BatteryIcon /><small>배터리 미연동</small></span>
    : <span>미연동</span>;
}
