import { useMemo } from "react";
import { useHomePanelState } from "./useHomePanelState";
import { panelMotionStyle } from "../components/panel-motion";
import { useOutletContext, useSearchParams } from "react-router";
import type { FacilityFloor, FacilitySelection } from "../app/AppShell";
import { FacilityMap, type FacilityRobotMarker } from "../features/facility-map/FacilityMap";
import { ChevronIcon } from "../components/WorkspaceIcons";
import { BatteryStatus } from "../components/BatteryStatus";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { MapOverlayPanel } from "../components/MapOverlayPanel";
import { RobotDetailPanel } from "../components/RobotDetailPanel";
import { SeatMissionPanel } from "../components/SeatMissionPanel";
import { needsRobotAttention } from "../lib/home-summary";
import { RobotStateBadge } from "../components/RobotStateBadge";
import { missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { HomeMapHeader } from "../components/HomeMapHeader";
import { seatSnapshots, type SeatCleaningStates } from "../lib/seat-summary";
import "./home-dashboard.css";

// These are illustration coordinates only. RobotResponse has no pose or battery telemetry.
const examplePositions = [{ x: 805, y: 365 }, { x: 380, y: 280 }, { x: 1040, y: 210 }, { x: 530, y: 400 }];
export function HomePage() {
  const { floor } = useOutletContext<FacilitySelection>();
  return <HomeWorkspace key={floor.id} floor={floor} />;
}
function HomeWorkspace({ floor }: { floor: FacilityFloor }) {
  const { robots, missions, seats, seatCleaning, events = [], isLoading, error, refresh, isCreatingMission } = useOperations();
  const { selectedSeatId, selectedRobotId, selectedSeat, selectedRobot, closingSeat,
    displayedRobot, displayedMissionId, robotFocusKey, selectSeat, selectRobot,
    closeRequest, closeRobot, onMissionSubmitted } = useHomePanelState({
      robots, seats, events, isCreatingMission, unavailable: isLoading || !!error,
    });
  const [searchParams, setSearchParams] = useSearchParams();
  const summaryDemo = searchParams.get("summaryDemo") === "1";
  const snapshots = useMemo(() => seatSnapshots(seats, summaryDemo), [seats, summaryDemo]);
  const displaySeats = useMemo(() => snapshots.map(row => row.seat), [snapshots]);
  const displayCleaning = useMemo<SeatCleaningStates | undefined>(() => summaryDemo
    ? Object.fromEntries(snapshots.flatMap(row => row.cleaning ? [[row.seat.seat_id, row.cleaning]] : []))
    : seatCleaning, [snapshots, summaryDemo, seatCleaning]);
  const mapRobots = useMemo<FacilityRobotMarker[]>(() => robots.map((robot, index) => ({
    robotId: robot.robot_id, state: robot.state, ...examplePositions[index % examplePositions.length], positionMode: "scenario",
  })), [robots]);
  return (
    <section className="home-workspace" aria-label="로봇 관제 홈" style={panelMotionStyle}>
      <h1 className="sr-only">{floor.label}</h1>
      <div className={"home-workspace-body" + (selectedSeat ? " has-request" : "")}>
        <section className="home-map-panel" aria-label="시설 지도">
          <HomeMapHeader seats={displaySeats} mapAvailable={floor.mapAvailable}
            unavailable={isLoading || !!error}>
              {summaryDemo && <button className="summary-demo-exit" type="button" title="화면용 예시 데이터입니다. 데모에서는 작업 요청이 전송되지 않습니다." onClick={() => setSearchParams(current => { const next = new URLSearchParams(current); next.delete("summaryDemo"); return next; })}>데모 · 해제</button>}
          </HomeMapHeader>
          {error && <div className="home-data-error" role="alert"><span>데이터를 갱신하지 못했습니다. {error.message}</span><button type="button" onClick={() => void refresh()}>새로고침</button></div>}
          <div className="home-map-content">
        <aside className={"home-robot-panel" + (selectedRobot ? " is-hidden" : "")} aria-label="로봇 목록" inert={!!selectedRobot} aria-hidden={!!selectedRobot}>
          <div className="home-robot-heading"><h2>로봇 목록</h2><span>{robots.length}대</span></div>
          <div className="home-robot-list" aria-busy={isLoading}>
            {isLoading && !robots.length ? <WorkspaceMessage kind="loading">로봇 정보를 불러오는 중입니다.</WorkspaceMessage> : null}
            {!isLoading && !robots.length && <WorkspaceMessage kind={error ? "error" : "empty"}>{error ? "로봇 정보를 가져오지 못했습니다." : "등록된 로봇이 없습니다."}</WorkspaceMessage>}
            {robots.map((robot) => {
              const active = missions.find((mission) => mission.mission_id === robot.active_mission_id);
              return <article key={robot.robot_id} aria-label={robot.robot_id} data-state={robot.state} className={"home-robot-row" + (robot.robot_id === selectedRobotId ? " is-selected" : "")}>
                <button type="button" className="home-robot-select" aria-label={robot.robot_id + " 상세 열기"} aria-pressed={robot.robot_id === selectedRobotId} onClick={() => selectRobot(robot.robot_id)}>
                  <span className="home-robot-thumbnail"><img src="/models/cleany-exterior-poster.png" alt="" /></span>
                  <span className="home-robot-identity"><strong>{robot.robot_id}</strong><RobotStateBadge state={robot.state} />{active && <small>{missionTargetLabel(active, seats)}</small>}
                    <BatteryStatus compact />
                  </span>
                  <span className="home-robot-chevron" aria-hidden="true"><ChevronIcon /></span>
                </button>
              </article>;
            })}
          </div>
        </aside>
          <MapOverlayPanel className="home-robot-drawer" open={!!selectedRobot}>
            {displayedRobot && <RobotDetailPanel robot={displayedRobot} mission={missions.find((mission) => mission.mission_id === displayedMissionId)} seats={seats} unavailable={!!error || isLoading} onClose={closeRobot} attentionCount={robots.filter(needsRobotAttention).length} />}
          </MapOverlayPanel>
          {floor.mapAvailable ? <FacilityMap seats={displaySeats} seatCleaning={displayCleaning} robots={mapRobots} selectedSeatId={selectedSeatId}
            overlayInsetLeft={320}
            onSelectSeat={selectSeat} selectedRobotId={selectedRobotId}
            onSelectRobot={selectRobot} robotFocusKey={robotFocusKey} seatSelectionDisabled={isLoading || !!error || isCreatingMission}
          /> : <div className="floor-map-empty"><span>19F</span><h2>19층 지도 연결 전</h2><p>상단의 운영 층에서 18층을 선택하면 좌석 지도를 볼 수 있습니다.</p></div>}
        <MapOverlayPanel className="home-request-drawer" open={!!selectedSeat}>
          {(selectedSeat || closingSeat) && floor.mapAvailable && <SeatMissionPanel key={(selectedSeat || closingSeat)!.seat_id} seat={(selectedSeat || closingSeat)!} unavailable={!!error || isLoading || summaryDemo} onClose={closeRequest} onSubmitted={mission => onMissionSubmitted(mission.mission_id)} />}
        </MapOverlayPanel>
          </div>
        </section>

      </div>

    </section>
  );
}
