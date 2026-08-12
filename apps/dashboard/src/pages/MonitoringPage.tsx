import { formatDateTime, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";

export function MonitoringPage() {
  const { missions, robot, seats, events } = useOperations();
  const terminal = missions.filter(({ phase }) => phase === "TERMINAL");
  const succeeded = terminal.filter(({ outcome }) => outcome === "SUCCESS").length;
  const activeCount = missions.filter(({ phase }) => !["QUEUED", "TERMINAL"].includes(phase)).length;
  const queuedCount = missions.filter(({ phase }) => phase === "QUEUED").length;
  const successRate = terminal.length ? `${Math.round((succeeded / terminal.length) * 100)}%` : "-";
  const activities = events.length
    ? events.slice(0, 6).map((event) => ({
        id: event.event_id,
        title: event.event_type.replaceAll(".", " · "),
        description: event.mission_id ? `Mission ${event.mission_id.slice(0, 8)}` : event.robot_id,
        occurredAt: event.occurred_at,
        success: event.payload?.outcome === "SUCCESS",
      }))
    : missions.slice(0, 6).map((mission) => ({
        id: mission.mission_id,
        title: mission.outcome ?? mission.phase,
        description: `${missionTargetLabel(mission, seats)} · ${mission.message}`,
        occurredAt: mission.created_at,
        success: mission.outcome === "SUCCESS",
      }));

  return (
    <section className="workspace dashboard-view section-view monitoring-view">
      <div className="view-intro"><p className="eyebrow">LIVE MONITORING</p><h2>운영 모니터링</h2><p>Robot heartbeat와 Mission 처리 흐름을 실시간으로 확인합니다.</p></div>
      <div className="metric-grid monitor-metrics">
        <article className="metric-card"><span>처리 중 / 대기</span><strong>{activeCount} / {queuedCount}</strong><small>현재 Mission</small></article>
        <article className="metric-card"><span>완료 Mission</span><strong>{terminal.length}</strong><small>전체 {missions.length}건</small></article>
        <article className="metric-card"><span>성공률</span><strong>{successRate}</strong><small>종료 Mission 기준</small></article>
      </div>
      <div className="monitor-grid">
        <article className="panel monitor-panel">
          <div className="panel-heading"><div><p className="eyebrow">ROBOT HEALTH</p><h2>연결 및 작업 상태</h2></div></div>
          <div className="health-visual">
            <span className="health-ring"><i /></span>
            <div>
              <strong>{robot?.state === "BUSY" ? "Mission 수행 중" : "Robot 대기 중"}</strong>
              <p>{robot?.state === "BUSY"
                ? "할당된 작업의 상태 변경을 실시간으로 수신하고 있습니다."
                : "새 Mission을 받을 수 있는 상태입니다."}</p>
            </div>
          </div>
          <dl className="detail-list compact-detail-list">
            <div><dt>마지막 heartbeat</dt><dd>{formatDateTime(robot?.last_seen_at)}</dd></div>
            <div><dt>활성 Mission</dt><dd>{robot?.active_mission_id?.slice(0, 8) ?? "없음"}</dd></div>
            <div><dt>대기 Mission</dt><dd>{queuedCount}개</dd></div>
          </dl>
        </article>
        <article className="panel timeline-panel">
          <div className="panel-heading"><div><p className="eyebrow">ACTIVITY</p><h2>최근 활동</h2></div></div>
          <div className="activity-list">
            {activities.length ? activities.map((item) => (
              <div className={`activity-item${item.success ? " success" : ""}`} key={item.id}>
                <i className="activity-dot" />
                <div className="activity-copy"><strong>{item.title}</strong><span>{item.description}</span><time>{formatDateTime(item.occurredAt)}</time></div>
              </div>
            )) : <p className="empty">표시할 활동이 없습니다.</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
