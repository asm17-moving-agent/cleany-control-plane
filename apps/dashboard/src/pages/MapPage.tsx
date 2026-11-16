import { RobotSummaryContent } from "../components/RobotSummaryContent";
import { Button } from "@/components/ui/button";
import { SlamMap } from "../features/facility-map/SlamMap";
import { useMemo } from "react";
import { useHomePanelState } from "./useHomePanelState";
import { panelMotionStyle } from "../components/panel-motion";
import { useOutletContext, useSearchParams } from "react-router";
import type { FacilityFloor, FacilitySelection } from "../app/AppShell";
import { FacilityMap, type FacilityRobotMarker } from "../features/facility-map/FacilityMap";
import { worldToMap } from "../features/facility-map/seat-layout";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { MapOverlayPanel } from "../components/MapOverlayPanel";
import { RobotDetailPanel } from "../components/RobotDetailPanel";
import { SeatMissionPanel } from "../components/SeatMissionPanel";
import { needsRobotAttention } from "../lib/home-summary";
import { missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { HomeMapHeader } from "../components/HomeMapHeader";
import { seatSnapshots, type SeatCleaningStates } from "../lib/seat-summary";
import { useRobotPose } from "../features/robot-pose/useRobotPose";
import { useDemoMode } from "../operations/DemoModeContext";
import "./home-dashboard.css";

/** Coordinate facility-scoped seat selection, robot details, and mission panels across runtime modes. */
export function MapPage() {
  const { floor } = useOutletContext<FacilitySelection>();
  return <HomeWorkspace key={floor.id} floor={floor} />;
}
function HomeWorkspace({ floor }: { floor: FacilityFloor }) {
  const { robots, missions, seats, seatCleaning, recordingPosition, recordingHeading, recordingPath, events = [], isLoading, error, refresh, isCreatingMission, pose, poseStale, connectionState } = useOperations();
  const { isDemo, isRecording } = useDemoMode();
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
  const livePose = useRobotPose(pose ?? null, poseStale ?? true, connectionState === "connected");
  const mapRobots = useMemo<FacilityRobotMarker[]>(() => {
    if (isDemo) {
      const examples = [worldToMap(-1.865, -4.705), { x: 380, y: 280 }, { x: 1040, y: 210 }];
      return robots.map((robot, index) => ({
        robotId: robot.robot_id, state: robot.state,
        ...(recordingPosition ?? examples[index % examples.length]),
        heading: recordingHeading, positionMode: "scenario",
      }));
    }
    const robot = robots[0];
    if (!robot || !livePose.pose) return [];
    return [{ robotId: robot.robot_id, state: robot.state, ...worldToMap(livePose.pose.x, livePose.pose.y),
      heading: livePose.pose.yaw == null ? undefined : -livePose.pose.yaw * 180 / Math.PI,
      positionMode: "live", poseStale: livePose.stale }];
  }, [isDemo, recordingPosition, recordingHeading, livePose.pose, livePose.stale, robots]);
  return (
    <section className="home-workspace" aria-label="시설 지도 화면" style={panelMotionStyle}>
      <h1 className="sr-only">{floor.label}</h1>
      <div className={"home-workspace-body" + (selectedSeat ? " has-request" : "")}>
        <section className="home-map-panel" aria-label="시설 지도">
          <HomeMapHeader slam={!isDemo && !!floor.mapRef && floor.mapRef !== "facility-18f"} seats={displaySeats} mapAvailable={floor.mapAvailable}
            unavailable={isLoading || !!error}>
              {isDemo ? <span className="home-telemetry-status" role="status">{isRecording ? "촬영 위치" : "예시 위치"}</span> : <span className={"home-telemetry-status " + (livePose.connected ? "is-connected" : "is-disconnected")} role="status">
                대시보드 {livePose.connected ? "연결됨" : "연결 끊김"} · 위치 {livePose.pose ? (livePose.stale ? "지연" : "최신") : "대기 중"}
                {robots[0]?.control_mode && <> · {robots[0].control_mode === "mock" ? "모의 실행" : robots[0].state === "OFFLINE" ? "로봇 연결 끊김" : "로봇 연결됨"}</>}
              </span>}
              {summaryDemo && <Button variant="secondary" size="default" className="summary-demo-exit" type="button" title="화면용 예시 데이터입니다. 데모에서는 작업 요청이 전송되지 않습니다." onClick={() => setSearchParams(current => { const next = new URLSearchParams(current); next.delete("summaryDemo"); return next; })}>데모 · 해제</Button>}
          </HomeMapHeader>
          {error && <div className="home-data-error" role="alert"><span>갱신 실패 · {error.message}</span><Button variant="secondary" size="default" type="button" onClick={() => void refresh()}>새로고침</Button></div>}
          <div className="home-map-content">
        <aside className={"home-robot-panel" + (selectedRobot ? " is-hidden" : "")} aria-label="로봇 목록" inert={!!selectedRobot} aria-hidden={!!selectedRobot}>
          <div className="home-robot-heading"><h2>로봇 목록</h2><span>{robots.length}대</span></div>
          <div className="home-robot-list" aria-busy={isLoading}>
            {isLoading && !robots.length ? <WorkspaceMessage kind="loading">로봇 정보를 불러오는 중입니다.</WorkspaceMessage> : null}
            {!isLoading && !robots.length && <WorkspaceMessage kind={error ? "error" : "empty"}>{error ? "로봇 정보를 가져오지 못했습니다." : "등록된 로봇이 없습니다."}</WorkspaceMessage>}
            {robots.map((robot) => {
              const active = missions.find((mission) => mission.mission_id === robot.active_mission_id);
              return <article key={robot.robot_id} aria-label={robot.robot_id} data-state={robot.state} className={"home-robot-row" + (robot.robot_id === selectedRobotId ? " is-selected" : "")}>
                <button type="button" className="home-robot-select robot-summary" data-attention={needsRobotAttention(robot) || undefined} aria-label={robot.robot_id + " 상세 열기"} aria-pressed={robot.robot_id === selectedRobotId} onClick={() => selectRobot(robot.robot_id)}>
                  <RobotSummaryContent robot={robot} assignment={active ? missionTargetLabel(active, seats) : undefined} />
                </button>
              </article>;
            })}
          </div>
        </aside>
          <MapOverlayPanel className="home-robot-drawer" open={!!selectedRobot}>
            {displayedRobot && <RobotDetailPanel robot={displayedRobot} mission={missions.find((mission) => mission.mission_id === displayedMissionId)} seats={seats} unavailable={!!error || isLoading} onClose={closeRobot} attentionCount={robots.filter(needsRobotAttention).length} />}
          </MapOverlayPanel>
          {!isDemo && floor.mapRef && floor.mapRef !== "facility-18f" && floor.mapAvailable ? <SlamMap
            onSelectSeat={selectSeat} selectedSeatId={selectedSeatId}
            siteId={floor.id} robot={robots[0]} pose={livePose.pose} sourcePose={pose} stale={livePose.stale}
            selectedRobotId={selectedRobotId} robotFocusKey={robotFocusKey} onSelectRobot={selectRobot}
          /> : floor.mapAvailable ? <FacilityMap seats={displaySeats} seatCleaning={displayCleaning} robots={mapRobots} selectedSeatId={selectedSeatId}
            focusRobotOnSelect={!recordingPosition}
            movementPath={recordingPath}
            overlayInsetLeft={320}
            onSelectSeat={selectSeat} selectedRobotId={selectedRobotId}
            onSelectRobot={selectRobot} robotFocusKey={robotFocusKey} seatSelectionDisabled={isLoading || !!error || isCreatingMission}
          /> : <div className="floor-map-empty"><span>19F</span><h2>19층 지도 연결 전</h2></div>}
        <MapOverlayPanel className="home-request-drawer" open={!!selectedSeat}>
          {(selectedSeat || closingSeat) && floor.mapAvailable && <SeatMissionPanel key={(selectedSeat || closingSeat)!.seat_id} seat={(selectedSeat || closingSeat)!} unavailable={!!error || isLoading || summaryDemo} onClose={closeRequest} onSubmitted={mission => onMissionSubmitted(mission.mission_id)} />}
        </MapOverlayPanel>
          </div>
        </section>

      </div>

    </section>
  );
}
