import { RobotLargeIcon } from "../components/Icons";
import { formatDateTime, missionProgress, seatLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";

export function RobotsPage() {
  const { robot, missions, seats } = useOperations();
  const active = missions.find(({ mission_id }) => mission_id === robot?.active_mission_id);

  return (
    <section className="workspace dashboard-view section-view robots-view">
      <div className="view-intro"><p className="eyebrow">ROBOT FLEET</p><h2>로봇 관리</h2><p>등록된 Robot과 현재 할당된 Mission을 확인합니다.</p></div>
      <article className="panel robot-hero">
        <div className="robot-avatar"><RobotLargeIcon /></div>
        <div className="robot-identity"><p className="eyebrow">PRIMARY ROBOT</p><h2>{robot?.robot_id ?? "cleany-01"}</h2><p>단일 Robot MVP · 좌석 작업 시나리오</p></div>
        <span className="robot-state-pill" data-state={robot?.state ?? "LOADING"}>{robot?.state ?? "LOADING"}</span>
      </article>
      <div className="robot-grid">
        <article className="panel detail-panel">
          <div className="panel-heading"><div><p className="eyebrow">CONNECTION</p><h2>연결 정보</h2></div></div>
          <dl className="detail-list compact-detail-list robot-detail-list">
            <div><dt>Robot ID</dt><dd>{robot?.robot_id ?? "-"}</dd></div>
            <div><dt>현재 상태</dt><dd>{robot?.state ?? "-"}</dd></div>
            <div><dt>마지막 확인</dt><dd>{formatDateTime(robot?.last_seen_at)}</dd></div>
            <div><dt>연결 방식</dt><dd>Mock control-plane</dd></div>
          </dl>
        </article>
        <article className="panel detail-panel">
          <div className="panel-heading"><div><p className="eyebrow">ASSIGNMENT</p><h2>현재 작업</h2></div></div>
          {active ? (
            <div className="assignment-card">
              <span>ACTIVE MISSION · {active.mission_id.slice(0, 8)}</span>
              <strong>{seatLabel(seats, active.seat_id)}</strong>
              <div className="progress"><i style={{ width: `${missionProgress(active.phase)}%` }} /></div>
              <p>{active.phase} · {active.message}</p>
            </div>
          ) : <div className="assignment-empty">할당된 Mission이 없습니다.</div>}
        </article>
      </div>
    </section>
  );
}
