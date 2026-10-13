import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { Mission, Robot, Seat } from "../api/types";
import { ChevronIcon } from "./WorkspaceIcons";
import { needsRobotAttention } from "../lib/home-summary";
import { RobotStateBadge } from "./RobotStateBadge";
import { BatteryStatus } from "./BatteryStatus";
import { InfoRow } from "./InfoRow";
import { formatDateTime, missionTargetLabel, missionMessage } from "../lib/operations";
import { RobotModel } from "./RobotModel";
import { MissionProgress } from "./MissionProgress";
import { executionSource } from "../lib/execution-source";

export function RobotDetailPanel({ robot, mission, seats, unavailable, onClose, attentionCount = 0 }: {
  robot: Robot; mission?: Mission; seats: Seat[]; unavailable: boolean; onClose: () => void; attentionCount?: number;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [robot.robot_id]);
  return <aside className="home-robot-detail-panel" aria-label="로봇 상세" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
  }}>
    <header><h2 ref={heading} tabIndex={-1} className="sr-only">로봇 상세</h2><button className="robot-list-back" type="button" onClick={onClose}><ChevronIcon />로봇 목록</button>{attentionCount > 0 && <span className="robot-list-attention" role="status">조치 {attentionCount}</span>}</header>
    <div className="robot-detail-content">
      <div className="robot-detail-identity"><h3>{robot.robot_id}</h3><RobotStateBadge state={robot.state} /></div>
      {robot.control_mode && <p className="ops-note">{robot.control_mode === "gateway" ? "FSM 런타임 연동" : "Backend 모의 실행"} · {executionSource(robot.execution_profile)}</p>}
      {unavailable && <p role="alert" className="robot-detail-notice">정보를 갱신하지 못했습니다. 마지막으로 받은 정보를 표시합니다.</p>}
      {needsRobotAttention(robot) && <p className="robot-detail-notice">{robot.state === "OFFLINE" ? "연결이 끊겼습니다. 현장 상태와 네트워크를 확인해 주세요." : "오류가 발생했습니다. 현장 상태를 확인해 주세요."}</p>}
      <dl className="robot-detail-metrics"><InfoRow label="배터리"><BatteryStatus /></InfoRow><InfoRow label="마지막 확인">{formatDateTime(robot.last_seen_at)}</InfoRow></dl>
      <section><h3>현재 작업</h3>{mission ? <div className="robot-detail-assignment"><strong>{missionTargetLabel(mission, seats)}</strong><MissionProgress mission={mission} />{mission.message && <p>{missionMessage(mission.message)}</p>}<Link to={"/missions?mission=" + encodeURIComponent(mission.mission_id)}>작업 상세 보기 <ChevronIcon /></Link></div> : <p className="robot-detail-empty">{robot.active_mission_id ? "할당된 작업 정보를 불러오지 못했습니다." : "현재 할당된 작업이 없습니다."}</p>}</section>
      <div className="robot-detail-preview"><RobotModel key={robot.robot_id} rotationGuide /></div>
    </div>
    <footer><Link to={"/robots?robot=" + encodeURIComponent(robot.robot_id)}>로봇 상세 페이지 보기 <ChevronIcon /></Link></footer>
  </aside>;
}
