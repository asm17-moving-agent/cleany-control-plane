import { Details, PageHeader } from "../components/patterns";
import { phaseLabels } from "../components/OperationsPage";
import { outcomeLabels } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { useDemoMode } from "../operations/DemoModeContext";

/** Derive operational metrics from snapshots and show live activity with a mission-history fallback. */
export function MonitoringPage() {
  const { missions, robot, seats, events } = useOperations();
  const { isDemo } = useDemoMode();
  const terminal = missions.filter(({ phase }) => phase === "TERMINAL");
  const accepted = missions.filter(m => m.accepted_at || (isDemo && m.phase !== "QUEUED"));
  const succeeded = accepted.filter(({ outcome }) => outcome === "SUCCESS").length;
  const unfinished = accepted.filter(m => m.phase !== "TERMINAL").length;
  const mockRuns = accepted.filter(m => m.execution_profile && Object.values(m.execution_profile).includes("mock")).length;
  const activeCount = missions.filter(({ phase }) => !["QUEUED", "TERMINAL"].includes(phase)).length;
  const queuedCount = missions.filter(({ phase }) => phase === "QUEUED").length;
  const successRate = accepted.length ? `${Math.round((succeeded / accepted.length) * 100)}%` : "-";
  const eventLabels: Record<string, string> = {
    "mission.created": "작업 접수", "mission.cancel_requested": "취소 요청",
    "mission.status_changed": "작업 상태 변경", "robot.state_changed": "로봇 상태 변경",
    "robot.pose": "위치 갱신", "robot.pose.stale": "위치 지연",
  };
  const activities = events.length
    ? events.slice(0, 6).map((event) => ({
        id: event.event_id,
        title: eventLabels[event.event_type] ?? "상태 갱신",
        detail: event.event_type,
        description: event.mission_id ? `작업 ${event.mission_id.slice(0, 8)}` : event.robot_id,
        occurredAt: event.occurred_at,
        success: event.payload?.outcome === "SUCCESS",
      }))
    : missions.slice(0, 6).map((mission) => ({
        id: mission.mission_id,
        title: mission.outcome ? outcomeLabels[mission.outcome] : phaseLabels[mission.phase],
        detail: mission.message,
        description: missionTargetLabel(mission, seats),
        occurredAt: mission.created_at,
        success: mission.outcome === "SUCCESS",
      }));

  return (
    <section className="workspace dashboard-view section-view monitoring-view">
      <PageHeader title="운영 모니터링" />
      <div className="metric-grid monitor-metrics">
        <article className="metric-card"><span>처리 중 / 대기</span><strong>{activeCount} / {queuedCount}</strong></article>
        <article className="metric-card"><span>종료 작업</span><strong>{terminal.length}</strong><small>전체 {missions.length}건</small></article>
        <article className="metric-card"><span>수락 대비 성공</span><strong>{successRate}</strong><small>성공 {succeeded} / 수락 {accepted.length}건 · 모의 포함 {mockRuns}건</small><Details label="집계 기준"><p>수락한 작업 기준 · 미종료 {unfinished}건 포함 · 모의는 한 단계 이상 모의 실행한 작업</p></Details></article>
      </div>
      <div className="monitor-grid">
        <article className="panel monitor-panel">
          <div className="panel-heading"><div><h2>연결 및 작업 상태</h2></div></div>
          <div className="health-visual">
            <span className="health-ring"><i /></span>
            <div>
              <strong>{robot?.state === "BUSY" ? "작업 중" : robot?.state === "IDLE" ? "대기 중" : robot?.state === "ERROR" ? "로봇 확인 필요" : "로봇 연결 확인 필요"}</strong>
            </div>
          </div>
          <dl className="detail-list compact-detail-list">
            <div><dt>마지막 수신</dt><dd>{formatDateTime(robot?.last_seen_at)}</dd></div>
            <div><dt>배정 작업</dt><dd>{robot?.active_mission_id?.slice(0, 8) ?? "없음"}</dd></div>
            <div><dt>대기 작업</dt><dd>{queuedCount}개</dd></div>
          </dl>
        </article>
        <article className="panel timeline-panel">
          <div className="panel-heading"><div><h2>최근 활동</h2></div></div>
          <div className="activity-list">
            {activities.length ? activities.map((item) => (
              <div className={`activity-item${item.success ? " success" : ""}`} key={item.id}>
                <i className="activity-dot" />
                <div className="activity-copy"><strong>{item.title}</strong><span>{item.description}</span><time>{formatDateTime(item.occurredAt)}</time>{item.detail && <Details label="기록 상세"><p>{item.detail}</p></Details>}</div>
              </div>
            )) : <p className="empty">최근 활동 없음</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
