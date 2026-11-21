import { useAgentPageContext } from "../features/agent/AgentContext";
import { PageHeader, PageShell, Surface } from "../components/patterns";
import { Button } from "../components/ui/button";
import { Link, useSearchParams } from "react-router";
import { RobotSummaryContent } from "../components/RobotSummaryContent";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { OperationsEmpty, OperationsTabs } from "../components/OperationsPage";
import { RobotIcon } from "../components/Icons";
import { ChevronIcon } from "../components/WorkspaceIcons";
import { needsRobotAttention } from "../lib/home-summary";
import { useOperations } from "../operations/OperationsContext";
import "./robots-page.css";
import { RobotDashboard } from "../features/robot-operations/RobotDashboard";

/** Selection and command ownership stay in the existing providers and domain controls. */
export function RobotsPage() {
  const { robots, missions, seats, isLoading, error, refresh } = useOperations();
  const [params] = useSearchParams();
  const attentionOnly = params.get("filter") === "attention";
  const filtered = attentionOnly ? robots.filter(needsRobotAttention) : robots;
  const selectedId = params.get("robot");
  const selected = selectedId ? filtered.find(robot => robot.robot_id === selectedId) : filtered[0];
  useAgentPageContext({ robot_id: selected?.robot_id });
  const active = missions.find(mission => mission.mission_id === selected?.active_mission_id);
  return <PageShell className="robots-view" width="wide" flow="workspace">
    <PageHeader title="로봇 관제" action={<div className="page-actions">
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
              <RobotSummaryContent robot={robot} showBattery={false} />
            </Link>)}
        </nav>
      </Surface>
      <section className="fleet-detail" aria-label="로봇 상세">
        {isLoading || error ? <Surface><WorkspaceMessage kind={error ? "empty" : "loading"}>{error ? "목록 연결을 확인하면 상세가 표시됩니다." : "로봇 상세 불러오는 중"}</WorkspaceMessage></Surface>
          : selected ? <RobotDashboard key={selected.robot_id} robot={selected} active={active} seats={seats} /> : <Surface><OperationsEmpty icon={<RobotIcon />} title="선택한 로봇 없음" /></Surface>}
      </section>
    </div>
  </PageShell>;
}
