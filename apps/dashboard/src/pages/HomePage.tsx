import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router";
import type { FacilityFloor, FacilitySelection } from "../app/AppShell";
import { FacilityMap, type FacilityRobotMarker } from "../features/facility-map/FacilityMap";
import { BatteryIcon, ChevronIcon } from "../components/WorkspaceIcons";
import { RobotDetailPanel } from "../components/RobotDetailPanel";
import { SeatMissionPanel } from "../components/SeatMissionPanel";
import { robotStateLabels } from "../lib/home-summary";
import { missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { HomeMapHeader } from "../components/HomeMapHeader";
import { seatSnapshots } from "../lib/seat-summary";
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
  const snapshots = useMemo(() => seatSnapshots(seats, summaryDemo), [seats, summaryDemo]);
  const displaySeats = useMemo(() => snapshots.map(row => row.seat), [snapshots]);
  const mapRobots = useMemo<FacilityRobotMarker[]>(() => robots.map((robot, index) => ({
    robotId: robot.robot_id, state: robot.state, ...examplePositions[index % examplePositions.length], positionMode: "scenario",
  })), [robots]);
  function selectRobot(id: string) {
    if (isCreatingMission) return;
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest(".home-robot-detail-panel")) robotTrigger.current = document.activeElement;
    if (selectedRobotId === id) { closeRobot(); return; }
    if (selectedSeat) setClosingSeat(selectedSeat);
    setSelectedSeatId(null);
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
  function selectSeat(id: string) {
    if (isCreatingMission || isLoading || error) return;
    if (selectedSeatId === id) closeRequest();
    else {
      if (selectedRobot) setClosingRobot(selectedRobot);
      setSelectedRobotId(null);
      setClosingSeat(null);
      setSelectedSeatId(id);
    }
  }
  return (
    <section className="home-workspace" aria-label="로봇 관제 홈">
      <h1 className="sr-only">{floor.label}</h1>
      <div className={"home-workspace-body" + (selectedSeat ? " has-request" : "")}>
        <aside className="home-robot-panel" aria-label="로봇 목록">
          <div className="home-robot-heading"><h2>로봇 목록</h2><span>{robots.length}대</span></div>
          <p className="home-robot-caption">등록된 로봇</p>
          <div className="home-robot-list" aria-busy={isLoading}>
            {isLoading && !robots.length ? <p className="workspace-empty">로봇 정보를 불러오는 중입니다.</p> : null}
            {!isLoading && !robots.length && <p className="workspace-empty">{error ? "로봇 정보를 가져오지 못했습니다." : "등록된 로봇이 없습니다."}</p>}
            {robots.map((robot) => {
              const active = missions.find((mission) => mission.mission_id === robot.active_mission_id);
              return <article key={robot.robot_id} aria-label={robot.robot_id} data-state={robot.state} className={"home-robot-row" + (robot.robot_id === selectedRobotId ? " is-selected" : "")}>
                <button type="button" className="home-robot-select" aria-label={robot.robot_id + " 상세 열기"} aria-pressed={robot.robot_id === selectedRobotId} onClick={() => selectRobot(robot.robot_id)}>
                  <span className="home-robot-thumbnail"><img src="/models/cleany-exterior-poster.png" alt="" /></span>
                  <span className="home-robot-identity"><strong>{robot.robot_id}</strong><span className="home-robot-state">{robotStateLabels[robot.state]}</span>{active && <small>{missionTargetLabel(active, seats)}</small>}
                    <span className="home-battery" aria-label="배터리 미연동"><BatteryIcon /><small>배터리 미연동</small></span>
                  </span>
                  <span className="home-robot-chevron" aria-hidden="true"><ChevronIcon /></span>
                </button>
              </article>;
            })}
          </div>
          <div className="home-robot-footer"><p>배터리 정보는 아직 연결되지 않았습니다.</p></div>
        </aside>
        <section className="home-map-panel" aria-label="시설 지도">
          <HomeMapHeader seats={displaySeats} mapAvailable={floor.mapAvailable}
            unavailable={isLoading || !!error}>
              {summaryDemo && <button className="summary-demo-exit" type="button" title="화면용 예시 데이터입니다. 데모에서는 작업 요청이 전송되지 않습니다." onClick={() => setSearchParams(current => { const next = new URLSearchParams(current); next.delete("summaryDemo"); return next; })}>데모 · 해제</button>}
          </HomeMapHeader>
          {error && <div className="home-data-error" role="alert"><span>데이터를 갱신하지 못했습니다. {error.message}</span><button type="button" onClick={() => void refresh()}>새로고침</button></div>}
          <div className="home-map-content">
          <div className={"home-robot-drawer" + (selectedRobot ? " is-open" : "")} inert={!selectedRobot} aria-hidden={!selectedRobot}>
            {displayedRobot && <RobotDetailPanel robot={displayedRobot} mission={missions.find((mission) => mission.mission_id === displayedRobot.active_mission_id)} seats={seats} unavailable={!!error || isLoading} onClose={closeRobot} />}
          </div>
          {floor.mapAvailable ? <FacilityMap seats={displaySeats} robots={mapRobots} selectedSeatId={selectedSeatId}
            onSelectSeat={selectSeat} selectedRobotId={selectedRobotId}
            onSelectRobot={selectRobot} robotFocusKey={robotFocusKey} seatSelectionDisabled={isLoading || !!error || isCreatingMission}
          /> : <div className="floor-map-empty"><span>19F</span><h2>19층 지도 연결 전</h2><p>상단의 운영 층에서 18층을 선택하면 좌석 지도를 볼 수 있습니다.</p></div>}
        <div className="home-request-drawer" inert={!selectedSeat} aria-hidden={!selectedSeat}>
          {(selectedSeat || closingSeat) && floor.mapAvailable && <SeatMissionPanel key={(selectedSeat || closingSeat)!.seat_id} seat={(selectedSeat || closingSeat)!} unavailable={!!error || isLoading || summaryDemo} onClose={closeRequest} />}
        </div>
          </div>
        </section>

      </div>

    </section>
  );
}
