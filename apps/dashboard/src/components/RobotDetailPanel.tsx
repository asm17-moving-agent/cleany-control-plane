import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { Mission, Robot, Seat } from "../api/types";
import { RobotLargeIcon } from "./Icons";
import { CloseIcon, ChevronIcon } from "./WorkspaceIcons";
import { needsRobotAttention, robotStateLabels } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel } from "../lib/operations";

export function RobotDetailPanel({ robot, mission, seats, unavailable, onClose }: {
  robot: Robot; mission?: Mission; seats: Seat[]; unavailable: boolean; onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [robot.robot_id]);
  return <aside className="home-robot-detail-panel" aria-label="로봇 상세" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
  }}>
    <header><h2 ref={heading} tabIndex={-1}>로봇 상세</h2><button className="workspace-icon-button" type="button" aria-label="로봇 상세 닫기" onClick={onClose}><CloseIcon /></button></header>
    <div className="robot-detail-content">
      <div className="robot-detail-identity"><span className="robot-detail-character"><RobotLargeIcon /></span><div><h3>{robot.robot_id}</h3><span className="workspace-state" data-state={robot.state}>{robotStateLabels[robot.state]}</span></div></div>
      {unavailable && <p role="alert" className="robot-detail-notice">정보를 갱신하지 못했습니다. 마지막으로 받은 정보를 표시합니다.</p>}
      {needsRobotAttention(robot) && <p className="robot-detail-notice">{robot.state === "OFFLINE" ? "연결이 끊겼습니다. 현장 상태와 네트워크를 확인해 주세요." : "오류가 발생했습니다. 현장 상태를 확인해 주세요."}</p>}
      <dl className="robot-detail-metrics"><div><dt>배터리</dt><dd>미연동</dd></div><div><dt>마지막 확인</dt><dd>{formatDateTime(robot.last_seen_at)}</dd></div></dl>
      <section><h3>현재 작업</h3>{mission ? <div className="robot-detail-assignment"><strong>{missionTargetLabel(mission, seats)}</strong><p>{mission.phase}</p>{mission.message && <p>{mission.message}</p>}<Link to={"/missions?mission=" + encodeURIComponent(mission.mission_id)}>작업 상세 보기 <ChevronIcon /></Link></div> : <p className="robot-detail-empty">{robot.active_mission_id ? "할당된 작업 정보를 불러오지 못했습니다." : "현재 할당된 작업이 없습니다."}</p>}</section>
      <section><h3>현재 위치</h3><p>실시간 좌표 미연동</p><small>지도 아이콘은 예시 위치입니다.</small></section>
    </div>
    <footer><Link to={"/robots?robot=" + encodeURIComponent(robot.robot_id)}>로봇 상세 페이지 보기 <ChevronIcon /></Link></footer>
  </aside>;
}
