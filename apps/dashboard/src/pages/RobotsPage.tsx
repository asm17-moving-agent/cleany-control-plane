import { Link, useSearchParams } from "react-router";
import { RobotModel } from "../components/RobotModel";
import { RobotStateBadge } from "../components/RobotStateBadge";
import { BatteryStatus } from "../components/BatteryStatus";
import { InfoRow } from "../components/InfoRow";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { MissionProgress } from "../components/MissionProgress";
import { OperationsEmpty, OperationsPage, OperationsTabs } from "../components/OperationsPage";
import { MissionIcon, RobotIcon } from "../components/Icons";
import { ChevronIcon, ShieldIcon, TargetIcon } from "../components/WorkspaceIcons";
import { needsRobotAttention, robotStateLabels } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { executionSource } from "../lib/execution-source";
import "./robots-page.css";

export function RobotsPage() {
  const { robots, missions, seats, isLoading, error, refresh } = useOperations();
  const [params] = useSearchParams();
  const attentionOnly = params.get("filter") === "attention";
  const filtered = attentionOnly ? robots.filter(needsRobotAttention) : robots;
  const selectedId = params.get("robot");
  const selected = selectedId ? filtered.find(robot => robot.robot_id === selectedId) : filtered[0];
  const active = missions.find(mission => mission.mission_id === selected?.active_mission_id);
  return <OperationsPage className="robots-view" title="로봇 관리" description="로봇의 상태와 현재 할당된 작업을 확인하세요."
    action={<Link className="ops-button" to="/"><TargetIcon /> 좌석 지도 보기</Link>}>
    <div className="ops-toolbar"><OperationsTabs label="로봇 필터" tabs={[
      { label: "전체 로봇", href: "/robots", active: !attentionOnly, count: isLoading || error ? "—" : robots.length },
      { label: "즉시 조치", href: "/robots?filter=attention", active: attentionOnly, count: isLoading || error ? "—" : robots.filter(needsRobotAttention).length, attention: true },
    ]} /><button className="ops-button" onClick={() => void refresh()} disabled={isLoading}>새로고침</button></div>
    <div className="ops-body" aria-busy={isLoading}>
      {isLoading || error ? <WorkspaceMessage kind={error ? "error" : "loading"}>{error ? "로봇 정보를 불러오지 못했습니다. 새로고침해 주세요." : "로봇 정보를 불러오는 중입니다."}</WorkspaceMessage>
        : !filtered.length ? <OperationsEmpty icon={<RobotIcon />} title={attentionOnly ? "지금 조치가 필요한 로봇이 없습니다" : "등록된 로봇이 없습니다"}>{attentionOnly ? <Link to="/robots">전체 로봇 보기</Link> : "로봇이 등록되면 상태와 작업 정보를 확인할 수 있습니다."}</OperationsEmpty>
        : <div className="ops-layout fleet-layout">
          <section className="ops-panel fleet-roster"><header className="ops-panel-heading"><h3>로봇 목록 <span>{filtered.length}대</span></h3><RobotIcon aria-hidden="true" /></header>
            <nav className="fleet-roster-list" aria-label="등록 로봇 목록">{filtered.map(robot => <Link className="fleet-roster-card" key={robot.robot_id} data-attention={needsRobotAttention(robot) || undefined} aria-current={robot.robot_id === selected?.robot_id ? "true" : undefined}
              to={"/robots?" + new URLSearchParams({ ...(attentionOnly ? { filter: "attention" } : {}), robot: robot.robot_id })}>
              <span className="fleet-thumbnail"><img src="/models/cleany-exterior-poster.png" alt="" width="72" height="82" /></span>
              <span className="fleet-identity"><strong>{robot.robot_id}</strong><RobotStateBadge state={robot.state} /><BatteryStatus compact /></span><ChevronIcon aria-hidden="true" />
            </Link>)}</nav>
          </section>
          <section className="ops-panel fleet-detail" aria-label="로봇 상세">
            {selected ? <div key={selected.robot_id} className="ops-detail-content">
              <header className="fleet-detail-heading"><div><span className="fleet-eyebrow">로봇 상세</span><h3>{selected.robot_id}</h3></div><RobotStateBadge state={selected.state} /></header>
              {selected.control_mode && <p className="ops-note">{selected.control_mode === "gateway" ? "FSM 런타임 연동" : "Backend 모의 실행"} · {executionSource(selected.execution_profile)}</p>}
              {needsRobotAttention(selected) && <div className="fleet-attention" role="status"><ShieldIcon aria-hidden="true" /><div><strong>{selected.state === "OFFLINE" ? "로봇 연결이 끊겼습니다" : "로봇 상태를 확인해 주세요"}</strong><p>{selected.state === "OFFLINE" ? "마지막 확인 이후의 상태를 알 수 없습니다. 현장 상태와 네트워크를 확인해 주세요." : "로봇에 오류가 있습니다. 현장 상태와 현재 작업을 확인해 주세요."}</p></div></div>}
              <div className="fleet-overview">
                <section className="fleet-preview" aria-label="외형 미리보기"><div><span>외형 미리보기</span><span className="fleet-concept">외장 시안</span></div><RobotModel rotationGuide /><p>실시간 자세 미연동</p><Link to="/robot-model">모델 자세히 보기 <ChevronIcon /></Link></section>
                <div className="fleet-operation">
                  <section className="fleet-state"><h4>상태 정보</h4><dl className="ops-facts"><InfoRow label="현재 상태">{robotStateLabels[selected.state]}</InfoRow><InfoRow label="배터리"><BatteryStatus /></InfoRow><InfoRow label="마지막 확인">{formatDateTime(selected.last_seen_at)}</InfoRow></dl></section>
                  <section className="fleet-assignment"><header><h4>현재 작업</h4><MissionIcon aria-hidden="true" /></header>
                    {active ? <><h3>{missionTargetLabel(active, seats)}</h3><p className="ops-note">책상 위 물체 정리 · 우선순위 {active.priority === "HIGH" ? "높음" : "보통"}</p><MissionProgress mission={active} /><Link className="ops-button" to={"/missions?mission=" + encodeURIComponent(active.mission_id)}>요청 상세 보기 <ChevronIcon /></Link></>
                      : <><p className="fleet-no-assignment">{selected.active_mission_id ? "할당된 작업 정보를 확인할 수 없습니다." : "현재 할당된 작업이 없습니다."}</p><p className="ops-note">{selected.active_mission_id ? "새로고침 후 작업 목록에서 확인해 주세요." : selected.state === "IDLE" ? "새 요청이 배정되면 진행 상황이 여기에 표시됩니다." : "로봇의 상태가 확인되면 작업 배정 정보를 확인할 수 있습니다."}</p><Link className="ops-button" to="/missions">작업 요청 목록 <ChevronIcon /></Link></>}
                  </section>
                </div>
              </div>
            </div> : <OperationsEmpty icon={<RobotIcon />} title="선택한 로봇을 찾을 수 없습니다">왼쪽 목록에서 로봇을 선택하세요.</OperationsEmpty>}
          </section>
        </div>}
    </div>
  </OperationsPage>;
}
