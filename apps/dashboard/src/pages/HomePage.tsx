import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import type { FacilityFloor, FacilitySelection } from "../app/AppShell";
import { FacilityMap, type FacilityRobotMarker } from "../features/facility-map/FacilityMap";
import { BatteryIcon, CheckIcon, ChevronIcon, EyeIcon, ShieldIcon } from "../components/WorkspaceIcons";
import { MissionIcon } from "../components/Icons";
import { RobotDetailPanel } from "../components/RobotDetailPanel";
import { RobotModel } from "../components/RobotModel";
import { SeatMissionPanel } from "../components/SeatMissionPanel";
import { getHomeSummary, outcomeLabels, robotStateLabels } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { homeSummaryDemo } from "../lib/home-summary-demo";
import "./home-dashboard.css";

// These are illustration coordinates only. RobotResponse has no pose or battery telemetry.
const examplePositions = [{ x: 805, y: 365 }, { x: 380, y: 280 }, { x: 1040, y: 210 }, { x: 530, y: 400 }];
export function HomePage() {
  const { floor } = useOutletContext<FacilitySelection>();
  return <HomeWorkspace key={floor.id} floor={floor} />;
}
function HomeWorkspace({ floor }: { floor: FacilityFloor }) {
  const { robots, missions, seats, isLoading, error, refresh, isCreatingMission } = useOperations();
  const [closingSeat, setClosingSeat] = useState<null | (typeof seats)[number]>(null);
  useEffect(() => {
    if (!closingSeat) return;
    const timer = window.setTimeout(() => setClosingSeat(null), 220);
    return () => window.clearTimeout(timer);
  }, [closingSeat]);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [closingRobot, setClosingRobot] = useState<null | (typeof robots)[number]>(null);
  useEffect(() => {
    if (!closingRobot) return;
    const timer = window.setTimeout(() => setClosingRobot(null), 220);
    return () => window.clearTimeout(timer);
  }, [closingRobot]);
  const [robotFocusKey, setRobotFocusKey] = useState(0);
  const robotTrigger = useRef<HTMLElement | null>(null);
  const selectedRobot = robots.find((robot) => robot.robot_id === selectedRobotId);
  const displayedRobot = selectedRobot || closingRobot;
  const selectedSeat = seats.find((seat) => seat.seat_id === selectedSeatId) ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const summaryDemo = searchParams.get("summaryDemo") === "1";
  const summary = summaryDemo ? getHomeSummary(homeSummaryDemo.robots, homeSummaryDemo.missions) : getHomeSummary(robots, missions);
  const latestResult = summary.successes[0];
  const mapRobots = useMemo<FacilityRobotMarker[]>(() => robots.map((robot, index) => ({
    robotId: robot.robot_id, state: robot.state, ...examplePositions[index % examplePositions.length], positionMode: "scenario",
  })), [robots]);
  const countsAvailable = summaryDemo || (!isLoading && !error);
  function selectRobot(id: string) {
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest(".home-robot-detail-panel")) robotTrigger.current = document.activeElement;
    if (selectedRobotId === id) { closeRobot(); return; }
    setClosingRobot(null);
    setSelectedRobotId(id); setRobotFocusKey((key) => key + 1);
  }
  function closeRobot() {
    setClosingRobot(selectedRobot ?? null);
    setSelectedRobotId(null);
    requestAnimationFrame(() => robotTrigger.current?.focus({ preventScroll: true }));
  }
  function closeRequest() {
    if (isCreatingMission) return;
    setClosingSeat(selectedSeat);
    const seatButton = document.querySelector<HTMLButtonElement>(".facility-map-seat.is-selected");
    setSelectedSeatId(null);
    requestAnimationFrame(() => seatButton?.focus({ preventScroll: true }));
  }
  return (
    <section className="home-workspace" aria-label="로봇 관제 홈">
      <h1 className="sr-only">{floor.label}</h1>
      <div className={"home-workspace-body" + (selectedSeat ? " has-request" : "")}>
        <aside className="home-robot-panel" aria-label="로봇 현황">
          <div className="home-robot-heading"><h2>로봇</h2><span>{robots.length}대</span></div>
          <p className="home-robot-caption">등록된 로봇</p>
          <div className="home-robot-list" aria-busy={isLoading}>
            {isLoading && !robots.length ? <p className="workspace-empty">로봇 정보를 불러오는 중입니다.</p> : null}
            {!isLoading && !robots.length && <p className="workspace-empty">{error ? "로봇 정보를 가져오지 못했습니다." : "등록된 로봇이 없습니다."}</p>}
            {robots.map((robot) => {
              const active = missions.find((mission) => mission.mission_id === robot.active_mission_id);
              return <article key={robot.robot_id} aria-label={robot.robot_id} data-state={robot.state} className={"home-robot-row" + (robot.robot_id === selectedRobotId ? " is-selected" : "")}>
                <button type="button" className="home-robot-select" aria-label={robot.robot_id + " 상세 열기"} aria-pressed={robot.robot_id === selectedRobotId} onClick={() => selectRobot(robot.robot_id)}>
                  <span className="home-robot-identity"><strong>{robot.robot_id}</strong><span className="home-robot-state">{robotStateLabels[robot.state]}</span>{active && <small>{missionTargetLabel(active, seats)}</small>}
                    <span className="home-battery" aria-label="배터리 미연동"><BatteryIcon /><small>미연동</small></span>
                  </span>
                  <span className="home-robot-chevron" aria-hidden="true"><ChevronIcon /></span>
                </button>
                <RobotModel compact />
              </article>;
            })}
          </div>
          <div className="home-robot-footer"><p>배터리 정보는 아직 연결되지 않았습니다.</p></div>
        </aside>
        <section className="home-map-panel" aria-label="시설 지도">
          <header className="home-map-header"><div><h2>{floor.mapAvailable ? "18층 좌석 지도" : "19층 시설 지도"}</h2><p>{floor.mapAvailable ? "좌석을 선택해 작업을 요청하세요" : "시설 지도를 연결해 주세요"}</p></div>{summaryDemo && <button className="summary-demo-exit" type="button" onClick={() => setSearchParams(current => { const next = new URLSearchParams(current); next.delete("summaryDemo"); return next; })}>업무 요약 데모 · 실제 데이터로 돌아가기</button>}{floor.mapAvailable && <span className="map-example-label">예시 위치 · 실시간 좌표 미연동</span>}</header>
          {error && <div className="home-data-error" role="alert"><span>데이터를 갱신하지 못했습니다. {error.message}</span><button type="button" onClick={() => void refresh()}>새로고침</button></div>}
          <div className="home-map-content">
          <div className={"home-robot-drawer" + (selectedRobot ? " is-open" : "")} inert={!selectedRobot} aria-hidden={!selectedRobot}>
            {displayedRobot && <RobotDetailPanel robot={displayedRobot} mission={missions.find((mission) => mission.mission_id === displayedRobot.active_mission_id)} seats={seats} unavailable={!!error || isLoading} onClose={closeRobot} />}
          </div>
          {floor.mapAvailable ? <FacilityMap seats={seats} robots={mapRobots} selectedSeatId={selectedSeatId}
            onSelectSeat={(id) => {
              if (isCreatingMission) return;
              if (selectedSeatId === id) closeRequest();
              else { setClosingSeat(null); setSelectedSeatId(id); }
            }} selectedRobotId={selectedRobotId}
            onSelectRobot={selectRobot} robotFocusKey={robotFocusKey} seatSelectionDisabled={isLoading || !!error || isCreatingMission}
          /> : <div className="floor-map-empty"><span>19F</span><h2>19층 지도 연결 전</h2><p>상단의 운영 층에서 18층을 선택하면 좌석 지도를 볼 수 있습니다.</p></div>}
        <div className="home-request-drawer" inert={!selectedSeat} aria-hidden={!selectedSeat}>
          {(selectedSeat || closingSeat) && floor.mapAvailable && <SeatMissionPanel key={(selectedSeat || closingSeat)!.seat_id} seat={(selectedSeat || closingSeat)!} unavailable={!!error || isLoading} onClose={closeRequest} />}
        </div>
          </div>
        </section>

      </div>
      <nav className="home-summary-strip" aria-label={summaryDemo ? "업무 요약 · 데모 데이터" : "업무 요약"}>
        <Link to="/robots?filter=attention" className={summary.attention.length ? "has-attention" : ""}>
          <div><ShieldIcon /><strong>즉시 조치</strong><b>{countsAvailable ? summary.attention.length : "—"}</b><ChevronIcon /></div>
          <p>{!countsAvailable ? "상태를 확인하고 있습니다." : summary.attention.length ? "로봇 상태를 확인해 주세요." : "지금 조치가 필요한 로봇이 없습니다."}</p>
          {countsAvailable && summary.attention.length > 0 && <ul className="summary-items">{summary.attention.slice(0, 2).map(robot => <li key={robot.robot_id}><span>{robot.robot_id}</span><em>{robotStateLabels[robot.state]}</em></li>)}</ul>}
        </Link>
        <Link to="/missions"><div><MissionIcon /><strong>요청 현황</strong><ChevronIcon /></div>
          <p className="summary-counts"><span><i className="tone-active" />진행 <b>{countsAvailable ? summary.active.length : "—"}</b></span><span><i className="tone-queued" />대기 <b>{countsAvailable ? summary.queued.length : "—"}</b></span></p>
          {countsAvailable && <ul className="summary-items">{[...summary.active, ...summary.queued].slice(0, 2).map(mission => <li key={mission.mission_id}><span>{missionTargetLabel(mission, seats)}</span><em>{mission.phase === "QUEUED" ? "대기" : "진행 중"}</em></li>)}</ul>}
          {countsAvailable && !summary.active.length && !summary.queued.length && <p className="summary-support">진행하거나 대기 중인 요청이 없습니다.</p>}
        </Link>
        <Link to="/results?filter=review" className={countsAvailable && summary.review.length ? "has-review" : ""}><div><EyeIcon /><strong>결과 검토</strong><b>{countsAvailable ? summary.review.length : "—"}</b><ChevronIcon /></div>
          <p>{!countsAvailable ? "결과를 확인하고 있습니다." : summary.review.length ? "확인이 필요한 작업 결과입니다." : "검토 대상 결과가 없습니다."}</p>
          {countsAvailable && <ul className="summary-items">{summary.review.slice(0, 2).map(mission => <li key={mission.mission_id}><span>{missionTargetLabel(mission, seats)}</span><em>{mission.outcome ? outcomeLabels[mission.outcome] : "검토"}</em></li>)}</ul>}
        </Link>
        <Link to="/results?filter=success"><div><CheckIcon /><strong>최근 완료</strong><ChevronIcon /></div>
          <p>{!countsAvailable ? "결과를 확인하고 있습니다." : latestResult ? missionTargetLabel(latestResult, seats) + " · 완료" : "아직 완료 결과가 없습니다."}</p>{countsAvailable && latestResult && <p className="summary-support">요청 시각 {formatDateTime(latestResult.created_at)}</p>}<small>요청 최신순</small>
        </Link>
      </nav>
    </section>
  );
}
