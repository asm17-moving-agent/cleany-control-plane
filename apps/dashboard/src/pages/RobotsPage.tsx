import { Details, PageHeader, PageShell, Surface, StatusBadge } from "../components/patterns";
import { Button } from "../components/ui/button";
import { Link, useSearchParams } from "react-router";
import { RobotModel } from "../components/RobotModel";
import { RobotSummaryContent } from "../components/RobotSummaryContent";
import { RobotStateBadge } from "../components/RobotStateBadge";
import { BatteryStatus } from "../components/BatteryStatus";
import { InfoRow } from "../components/InfoRow";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { MissionProgress } from "../components/MissionProgress";
import { OperationsEmpty, OperationsTabs } from "../components/OperationsPage";
import { RobotIcon } from "../components/Icons";
import { ChevronIcon, ShieldIcon } from "../components/WorkspaceIcons";
import { needsRobotAttention } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { executionSource } from "../lib/execution-source";
import { ManualControlPanel } from "../features/manual-control/ManualControlPanel";
import "./robots-page.css";

/** Selection and command ownership stay in the existing providers and domain controls. */
export function RobotsPage() {
  const { robots, missions, seats, isLoading, error, refresh } = useOperations();
  const [params] = useSearchParams();
  const attentionOnly = params.get("filter") === "attention";
  const filtered = attentionOnly ? robots.filter(needsRobotAttention) : robots;
  const selectedId = params.get("robot");
  const selected = selectedId ? filtered.find(robot => robot.robot_id === selectedId) : filtered[0];
  const active = missions.find(mission => mission.mission_id === selected?.active_mission_id);
  return <PageShell className="robots-view" width="wide" flow="workspace">
    <PageHeader title="로봇 관리" action={<div className="page-actions">
      <Button asChild variant="ghost"><Link to="/map">지도 보기 <ChevronIcon /></Link></Button>
      <Button onClick={() => void refresh()} disabled={isLoading}>새로고침</Button>
    </div>} />
    <div className="fleet-layout" aria-busy={isLoading}>
      <Surface padding="none" className="fleet-roster" aria-label="로봇 목록">
        <header className="ui-panel-header"><h3>로봇 목록</h3><span>{isLoading || error ? "—" : filtered.length}대</span></header>
        <OperationsTabs label="로봇 필터" tabs={[
          { label: "전체 로봇", href: "/robots", active: !attentionOnly, count: isLoading || error ? "—" : robots.length },
          { label: "즉시 조치", href: "/robots?filter=attention", active: attentionOnly, count: isLoading || error ? "—" : robots.filter(needsRobotAttention).length, attention: true },
        ]} />
        <nav className="fleet-roster-list" aria-label="등록 로봇 목록">
          {isLoading || error ? <WorkspaceMessage kind={error ? "error" : "loading"} onRetry={() => void refresh()}>{error ? "로봇 정보를 불러올 수 없음" : "로봇 정보 불러오는 중"}</WorkspaceMessage>
            : !filtered.length ? <OperationsEmpty icon={<RobotIcon />} title={attentionOnly ? "조치할 로봇 없음" : "등록된 로봇 없음"}>{attentionOnly ? <Link to="/robots">전체 로봇</Link> : undefined}</OperationsEmpty>
            : filtered.map(robot => <Link className="fleet-roster-card robot-summary" key={robot.robot_id} data-attention={needsRobotAttention(robot) || undefined} aria-current={robot.robot_id === selected?.robot_id ? "true" : undefined}
              to={"/robots?" + new URLSearchParams({ ...(attentionOnly ? { filter: "attention" } : {}), robot: robot.robot_id })}>
              <RobotSummaryContent robot={robot} />
            </Link>)}
        </nav>
      </Surface>
      <section className="fleet-detail" aria-label="로봇 상세">
        {isLoading || error ? <Surface><WorkspaceMessage kind={error ? "empty" : "loading"}>{error ? "목록 연결을 확인하면 상세가 표시됩니다." : "로봇 상세 불러오는 중"}</WorkspaceMessage></Surface>
          : selected ? <div key={selected.robot_id} className="fleet-detail-content">
            <Surface className="fleet-summary">
              <header className="fleet-detail-heading"><h3>{selected.robot_id}</h3><RobotStateBadge state={selected.state} /></header>
              {selected.control_mode && !active?.execution_profile && <p className="ops-note">{executionSource(selected.execution_profile)}</p>}
              {needsRobotAttention(selected) && <div className="fleet-attention" role="status"><ShieldIcon aria-hidden="true" /><strong>{selected.state === "OFFLINE" ? "연결 끊김 · 마지막 수신 정보" : "로봇 오류 · 현장 확인 필요"}</strong></div>}
              <div className="fleet-overview">
                <div className="fleet-operation">
                  <dl className="fleet-facts"><InfoRow label="배터리"><BatteryStatus /></InfoRow><InfoRow label="마지막 확인">{formatDateTime(selected.last_seen_at)}</InfoRow></dl>
                  <section className="fleet-assignment" aria-label="현재 작업"><header><h4>현재 작업</h4>
                    <Button asChild variant="ghost" size="compact"><Link to={active ? "/missions?mission=" + encodeURIComponent(active.mission_id) : "/missions"}>{active ? "요청 상세 보기" : "작업 요청 목록"}<ChevronIcon /></Link></Button>
                  </header>
                    {active ? <><h3>{missionTargetLabel(active, seats)}</h3>{active.priority === "HIGH" && <p className="ops-note">우선순위 높음</p>}<MissionProgress mission={active} /></>
                      : <p className="fleet-no-assignment">{selected.active_mission_id ? "배정 정보 조회 실패" : "배정된 작업 없음"}</p>}
                  </section>
                  {selected.control_mode && <Details label="연결 상세"><p>{selected.control_mode === "gateway" ? "FSM 런타임 연동" : "Backend 모의 실행"} · {executionSource(selected.execution_profile)}</p></Details>}
                </div>
                <section className="fleet-preview" aria-label="외형 미리보기"><header><span>외형 미리보기</span><StatusBadge>CAD 모델</StatusBadge></header><RobotModel rotationGuide /><p>실시간 자세 미연동</p><Button asChild variant="ghost" size="compact"><Link to="/robot-model">모델 자세히 보기 <ChevronIcon /></Link></Button></section>
              </div>
            </Surface>
            <ManualControlPanel robotId={selected.robot_id} />
          </div> : <Surface><OperationsEmpty icon={<RobotIcon />} title="선택한 로봇 없음" /></Surface>}
      </section>
    </div>
  </PageShell>;
}
