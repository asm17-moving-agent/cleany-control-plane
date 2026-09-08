import { Link, useSearchParams } from "react-router";
import { RobotModel } from "../components/RobotModel";
import { RobotStateBadge } from "../components/RobotStateBadge";
import { BatteryStatus } from "../components/BatteryStatus";
import { InfoRow } from "../components/InfoRow";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { MissionProgress } from "../components/MissionProgress";
import { ChevronIcon } from "../components/WorkspaceIcons";
import { needsRobotAttention, robotStateLabels } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";

export function RobotsPage() {
  const { robots, missions, seats, isLoading, error } = useOperations();
  const [params] = useSearchParams();
  const attentionOnly = params.get("filter") === "attention";
  const filtered = attentionOnly ? robots.filter(needsRobotAttention) : robots;
  const selectedId = params.get("robot");
  const selected = selectedId ? filtered.find((robot) => robot.robot_id === selectedId) : filtered[0];
  const active = missions.find((mission) => mission.mission_id === selected?.active_mission_id);
  return <section className="section-view robots-view">
    <header className="workspace-page-heading"><div><h2>로봇 관리</h2><p>로봇의 연결 상태와 할당된 작업을 확인합니다.</p></div><Link to="/">지도에서 보기 <ChevronIcon /></Link></header>
    <nav className="workspace-filter-tabs" aria-label="로봇 필터">
      <Link to="/robots" aria-current={!attentionOnly ? "page" : undefined}>전체 로봇 <b>{isLoading || error ? "—" : robots.length}</b></Link>
      <Link to="/robots?filter=attention" aria-current={attentionOnly ? "page" : undefined}>즉시 조치 <b>{isLoading || error ? "—" : robots.filter(needsRobotAttention).length}</b></Link>
    </nav>
    {isLoading ? <WorkspaceMessage kind="loading">로봇 정보를 불러오는 중입니다.</WorkspaceMessage> : !filtered.length
      ? <WorkspaceMessage kind={error ? "error" : "empty"}>{error ? "로봇 정보를 가져오지 못했습니다." : attentionOnly ? "지금 조치가 필요한 로봇이 없습니다." : "등록된 로봇이 없습니다."}</WorkspaceMessage>
      : <div className="workspace-fleet"><nav className="workspace-fleet-list" aria-label="등록 로봇 목록">
        {filtered.map((robot) => <Link key={robot.robot_id} aria-current={robot.robot_id === selected?.robot_id ? "true" : undefined}
          to={"/robots?" + new URLSearchParams({ ...(attentionOnly ? { filter: "attention" } : {}), robot: robot.robot_id }).toString()}>
          <strong>{robot.robot_id}</strong><RobotStateBadge state={robot.state} />
        </Link>)}
      </nav>{selected ? <article className="workspace-robot-detail">
        <header><h3>{selected.robot_id}</h3><RobotStateBadge state={selected.state} /></header>
        <div className="workspace-robot-overview"><RobotModel key={selected.robot_id} rotationGuide />
        <dl><InfoRow label="현재 상태">{robotStateLabels[selected.state]}</InfoRow><InfoRow label="마지막 확인">{formatDateTime(selected.last_seen_at)}</InfoRow>
          <InfoRow label="배터리"><BatteryStatus /></InfoRow></dl></div>
        {needsRobotAttention(selected) && <p className="workspace-api-error" style={{ marginTop: 24 }}>{selected.state === "OFFLINE" ? "로봇 연결이 끊겼습니다. 현장 상태와 네트워크를 확인해 주세요." : "로봇에 오류가 있습니다. 현장 상태를 확인해 주세요."}</p>}
        <section className="workspace-robot-assignment"><h4>현재 작업</h4>{active
          ? <><p><strong>{missionTargetLabel(active, seats)}</strong></p><MissionProgress mission={active} /><p>{active.message}</p><Link to={"/missions?mission=" + encodeURIComponent(active.mission_id)}>요청 상세 보기 →</Link></>
          : <p>할당된 작업이 없습니다.</p>}</section>
      </article> : <WorkspaceMessage>선택한 로봇을 찾을 수 없습니다.</WorkspaceMessage>}</div>}
  </section>;
}
