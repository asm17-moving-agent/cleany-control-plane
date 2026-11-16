import { Details, Notice } from "./patterns";
import { Button } from "@/components/ui/button";
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

/** Show retained robot/assignment snapshots and move focus to the heading when selection changes. */
export function RobotDetailPanel({ robot, mission, seats, unavailable, onClose, attentionCount = 0 }: {
  robot: Robot; mission?: Mission; seats: Seat[]; unavailable: boolean; onClose: () => void; attentionCount?: number;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [robot.robot_id]);
  return <aside className="home-robot-detail-panel" aria-label="로봇 상세" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
  }}>
    <header><h2 ref={heading} tabIndex={-1} className="sr-only">로봇 상세</h2><Button variant="ghost" size="default" className="robot-list-back" type="button" onClick={onClose}><ChevronIcon />로봇 목록</Button>{attentionCount > 0 && <span className="robot-list-attention" role="status">조치 {attentionCount}</span>}</header>
    <div className="robot-detail-content">
      <div className="robot-detail-identity"><h3>{robot.robot_id}</h3><RobotStateBadge state={robot.state} /></div>
      {robot.control_mode && !mission?.execution_profile && <p className="ops-note">{executionSource(robot.execution_profile)}</p>}
      {unavailable && <Notice tone="danger" role="alert" className="robot-detail-notice">갱신 실패 · 마지막 수신 정보</Notice>}
      {needsRobotAttention(robot) && <Notice tone="danger" className="robot-detail-notice">{robot.state === "OFFLINE" ? "연결 끊김 · 마지막 수신 정보" : "로봇 오류 · 현장 확인 필요"}</Notice>}
      {robot.control_mode && <Details label="연결 상세"><p>{robot.control_mode === "gateway" ? "FSM 런타임 연동" : "Backend 모의 실행"} · {executionSource(robot.execution_profile)}</p></Details>}
      <dl className="robot-detail-metrics"><InfoRow label="배터리"><BatteryStatus /></InfoRow><InfoRow label="마지막 확인">{formatDateTime(robot.last_seen_at)}</InfoRow></dl>
      <section><h3>현재 작업</h3>{mission ? <div className="robot-detail-assignment"><strong>{missionTargetLabel(mission, seats)}</strong><MissionProgress mission={mission} />{mission.message && <Details label="작업 메시지"><p>{missionMessage(mission.message)}</p></Details>}<Link to={"/missions?mission=" + encodeURIComponent(mission.mission_id)}>작업 상세 보기 <ChevronIcon /></Link></div> : <p className="robot-detail-empty">{robot.active_mission_id ? "배정 정보 조회 실패" : "배정된 작업 없음"}</p>}</section>
      <div className="robot-detail-preview"><RobotModel key={robot.robot_id} rotationGuide /></div>
    </div>
    <footer><Link to={"/robots?robot=" + encodeURIComponent(robot.robot_id)}>로봇 상세 페이지 보기 <ChevronIcon /></Link></footer>
  </aside>;
}
