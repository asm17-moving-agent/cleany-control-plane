import { Details } from "../components/patterns";
import { Button } from "@/components/ui/button";
import { ROBOT_MODEL } from "../components/robot-model-asset";
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
import { needsRobotAttention } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { executionSource } from "../lib/execution-source";
import "./robots-page.css";
import { ManualControlPanel } from "../features/manual-control/ManualControlPanel";

/** Filter visible robots and resolve their current assignments from mission snapshots. */
export function RobotsPage() {
  const { robots, missions, seats, isLoading, error, refresh } = useOperations();
  const [params] = useSearchParams();
  const attentionOnly = params.get("filter") === "attention";
  const filtered = attentionOnly ? robots.filter(needsRobotAttention) : robots;
  const selectedId = params.get("robot");
  const selected = selectedId ? filtered.find(robot => robot.robot_id === selectedId) : filtered[0];
  const active = missions.find(mission => mission.mission_id === selected?.active_mission_id);
  return <OperationsPage className="robots-view" title="로봇 관리"
    action={<Button asChild variant="secondary"><Link className="ops-button" to="/map"><TargetIcon /> 좌석 지도 보기</Link></Button>}>
    <div className="ops-toolbar"><OperationsTabs label="로봇 필터" tabs={[
      { label: "전체 로봇", href: "/robots", active: !attentionOnly, count: isLoading || error ? "—" : robots.length },
      { label: "즉시 조치", href: "/robots?filter=attention", active: attentionOnly, count: isLoading || error ? "—" : robots.filter(needsRobotAttention).length, attention: true },
    ]} /><Button variant="secondary" size="default" className="ops-button" onClick={() => void refresh()} disabled={isLoading}>새로고침</Button></div>
    <div className="ops-body" aria-busy={isLoading}>
      {isLoading || error ? <WorkspaceMessage kind={error ? "error" : "loading"} onRetry={() => void refresh()}>{error ? "로봇 정보를 불러올 수 없음" : "로봇 정보 불러오는 중"}</WorkspaceMessage>
        : !filtered.length ? <OperationsEmpty icon={<RobotIcon />} title={attentionOnly ? "조치할 로봇 없음" : "등록된 로봇 없음"}>{attentionOnly ? <Link to="/robots">전체 로봇</Link> : undefined}</OperationsEmpty>
        : <div className="ops-layout fleet-layout">
          <section className="ops-panel fleet-roster"><header className="ops-panel-heading"><h3>로봇 목록 <span>{filtered.length}대</span></h3><RobotIcon aria-hidden="true" /></header>
            <nav className="fleet-roster-list" aria-label="등록 로봇 목록">{filtered.map(robot => <Link className="fleet-roster-card" key={robot.robot_id} data-attention={needsRobotAttention(robot) || undefined} aria-current={robot.robot_id === selected?.robot_id ? "true" : undefined}
              to={"/robots?" + new URLSearchParams({ ...(attentionOnly ? { filter: "attention" } : {}), robot: robot.robot_id })}>
              <span className="fleet-thumbnail"><img src={ROBOT_MODEL.poster} alt="" width="72" height="82" /></span>
              <span className="fleet-identity"><strong>{robot.robot_id}</strong><RobotStateBadge state={robot.state} /><BatteryStatus compact /></span><ChevronIcon aria-hidden="true" />
            </Link>)}</nav>
          </section>
          <section className="ops-panel fleet-detail" aria-label="로봇 상세">
            {selected ? <div key={selected.robot_id} className="ops-detail-content">
              <header className="fleet-detail-heading"><div><h3>{selected.robot_id}</h3></div><RobotStateBadge state={selected.state} /></header>
              {selected.control_mode && !active?.execution_profile && <p className="ops-note">{executionSource(selected.execution_profile)}</p>}
              {needsRobotAttention(selected) && <div className="fleet-attention" role="status"><ShieldIcon aria-hidden="true" /><div><strong>{selected.state === "OFFLINE" ? "연결 끊김 · 마지막 수신 정보" : "로봇 오류 · 현장 확인 필요"}</strong></div></div>}
              {selected.control_mode && <Details label="연결 상세"><p>{selected.control_mode === "gateway" ? "FSM 런타임 연동" : "Backend 모의 실행"} · {executionSource(selected.execution_profile)}</p></Details>}
              <div className="fleet-overview">
                <section className="fleet-preview" aria-label="외형 미리보기"><div><span>외형 미리보기</span><span className="fleet-concept">CAD 모델</span></div><RobotModel rotationGuide /><p>실시간 자세 미연동</p><Link to="/robot-model">모델 자세히 보기 <ChevronIcon /></Link></section>
                <div className="fleet-operation">
                  <section className="fleet-state"><h4>상태 정보</h4><dl className="ops-facts"><InfoRow label="배터리"><BatteryStatus /></InfoRow><InfoRow label="마지막 확인">{formatDateTime(selected.last_seen_at)}</InfoRow></dl></section>
                  <section className="fleet-assignment"><header><h4>현재 작업</h4><MissionIcon aria-hidden="true" /></header>
                    {active ? <><h3>{missionTargetLabel(active, seats)}</h3>{active.priority === "HIGH" && <p className="ops-note">우선순위 높음</p>}<MissionProgress mission={active} /><Button asChild variant="secondary"><Link className="ops-button" to={"/missions?mission=" + encodeURIComponent(active.mission_id)}>요청 상세 보기 <ChevronIcon /></Link></Button></>
                      : <><p className="fleet-no-assignment">{selected.active_mission_id ? "배정 정보 조회 실패" : "배정된 작업 없음"}</p><Button asChild variant="secondary"><Link className="ops-button" to="/missions">작업 요청 목록 <ChevronIcon /></Link></Button></>}
                  </section>
                </div>
              </div>
              <ManualControlPanel robotId={selected.robot_id} />
            </div> : <OperationsEmpty icon={<RobotIcon />} title="선택한 로봇 없음" />}
          </section>
        </div>}
    </div>
  </OperationsPage>;
}
