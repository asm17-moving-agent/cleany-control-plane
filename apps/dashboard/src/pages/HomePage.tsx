import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";
import type { Mission, Robot, RobotState } from "../api/types";
import { BellIcon, MapPinIcon, RobotIcon, SendIcon } from "../components/Icons";
import {
  FacilityMap,
  type FacilityRobotMarker,
} from "../features/facility-map/FacilityMap";
import {
  FACILITY_ZONES,
  getFacilityZone,
} from "../features/facility-map/facility-18f";
import { formatDateTime, missionProgress, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { useSettings } from "../settings/SettingsContext";
import "./home-dashboard.css";

const missionFormSchema = z.object({
  priority: z.enum(["NORMAL", "HIGH"]),
});

type MissionFormValues = z.infer<typeof missionFormSchema>;
type FleetFilter = "ALL" | "ACTIVE" | "ATTENTION";

const robotStateMeta: Record<RobotState, { label: string }> = {
  OFFLINE: { label: "연결 끊김" },
  IDLE: { label: "대기 중" },
  BUSY: { label: "작업 중" },
  ERROR: { label: "확인 필요" },
};

const facilityFloors = [
  { id: "BUSAN_SOMA_18F", label: "부산 소마 센터 18층", floor: "18F", mapAvailable: true },
  { id: "BUSAN_SOMA_19F", label: "부산 소마 센터 19층", floor: "19F", mapAvailable: false },
] as const;

type FacilityFloorId = typeof facilityFloors[number]["id"];

// Presentation-only fixtures until these telemetry fields are added to RobotResponse.
const robotCardFixtures = [
  { model: "Cleany D1", mode: "자동 운행", coverage: "전체 청소", battery: 89 },
  { model: "Cleany D1", mode: "자동 운행", coverage: "부분 청소", battery: 74 },
  { model: "Cleany S1", mode: "자동 운행", coverage: "전체 청소", battery: 62 },
  { model: "Cleany S1", mode: "수동 대기", coverage: "부분 청소", battery: 48 },
] as const;

function robotCardFixture(index: number) {
  return robotCardFixtures[index % robotCardFixtures.length];
}

const robotMarkerPositions = [
  { x: 820, y: 320 },
  { x: 380, y: 280 },
  { x: 164, y: 160 },
  { x: 1090, y: 290 },
] as const;

const reviewOutcomes = new Set([
  "HUMAN_REVIEW_REQUIRED",
  "PARTIAL_SUCCESS",
  "BLOCKED",
  "FAILED",
  "INTERRUPTED",
]);

function missionForRobot(robot: Robot | null, missions: Mission[]) {
  if (!robot?.active_mission_id) return null;
  return missions.find(({ mission_id }) => mission_id === robot.active_mission_id) ?? null;
}

function destinationForMission(mission: Mission | null) {
  if (!mission) return null;
  const targetText = `${mission.target.label ?? ""} ${mission.target.reference_id}`.toUpperCase();
  return [...FACILITY_ZONES]
    .sort((left, right) => right.shortLabel.length - left.shortLabel.length)
    .find(({ label, shortLabel, id }) => (
      targetText.includes(label.toUpperCase())
      || targetText.includes(shortLabel.toUpperCase())
      || targetText.includes(id.toUpperCase())
    )) ?? null;
}

function routeTo(
  start: { x: number; y: number },
  destination: { x: number; y: number },
) {
  const elbowY = Math.round((start.y + destination.y) / 2);
  return [
    start,
    { x: start.x, y: elbowY },
    { x: destination.x, y: elbowY },
    destination,
  ];
}

function filterRobots(robots: Robot[], filter: FleetFilter) {
  if (filter === "ACTIVE") return robots.filter(({ state }) => state === "BUSY");
  if (filter === "ATTENTION") return robots.filter(({ state }) => ["ERROR", "OFFLINE"].includes(state));
  return robots;
}

function missionStageClass(progress: number, startsAt: number, completesAt: number) {
  if (progress >= completesAt) return "is-done";
  if (progress >= startsAt) return "is-current";
  return "";
}

export function HomePage() {
  const {
    missions,
    robots,
    seats,
    connectionState,
    createMission,
    cancelMission,
    refresh,
    isCreatingMission,
  } = useOperations();
  const { settings } = useSettings();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [selectedFacilityFloorId, setSelectedFacilityFloorId] = useState<FacilityFloorId>("BUSAN_SOMA_18F");
  const [fleetFilter, setFleetFilter] = useState<FleetFilter>("ALL");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { register, handleSubmit } = useForm<MissionFormValues>({
    resolver: zodResolver(missionFormSchema),
    defaultValues: { priority: settings.defaultPriority },
  });

  const selectedZone = getFacilityZone(selectedZoneId);
  const selectedSeat = seats.find(({ seat_id }) => seat_id === selectedSeatId) ?? null;
  const selectedRobot = robots.find(({ robot_id }) => robot_id === selectedRobotId) ?? null;
  const selectedFacilityFloor = facilityFloors.find(({ id }) => id === selectedFacilityFloorId) ?? facilityFloors[0];
  const selectedRobotIndex = selectedRobot ? robots.findIndex(({ robot_id }) => robot_id === selectedRobot.robot_id) : -1;
  const selectedRobotFixture = selectedRobot ? robotCardFixture(Math.max(0, selectedRobotIndex)) : null;
  const selectedRobotMission = missionForRobot(selectedRobot, missions);
  const visibleRobots = filterRobots(robots, fleetFilter);
  const queuedCount = missions.filter(({ phase }) => phase === "QUEUED").length;
  const activeCount = missions.filter(({ phase }) => !["QUEUED", "TERMINAL"].includes(phase)).length;
  const reviewMissions = missions.filter(({ outcome }) => reviewOutcomes.has(outcome ?? ""));
  const robotAlerts = robots.filter(({ state }) => ["ERROR", "OFFLINE"].includes(state));
  const alertCount = reviewMissions.length + robotAlerts.length;

  const mapRobots = useMemo<FacilityRobotMarker[]>(() => robots.map((item, index) => {
    const position = robotMarkerPositions[index % robotMarkerPositions.length];
    const activeMission = missionForRobot(item, missions);
    const destination = destinationForMission(activeMission);
    return {
      robotId: item.robot_id,
      state: item.state,
      x: position.x,
      y: position.y,
      route: item.state === "BUSY" && destination
        ? routeTo(position, destination.center)
        : undefined,
      positionMode: "scenario",
    };
  }), [missions, robots]);

  const selectSeat = (seatId: string) => {
    setSelectedSeatId((current) => current === seatId ? null : seatId);
    setMessage("");
  };

  const returnToZoneOverview = () => {
    setSelectedZoneId(null);
    setSelectedSeatId(null);
    setMessage("");
  };

  const selectFacilityFloor = (floorId: FacilityFloorId) => {
    setSelectedFacilityFloorId(floorId);
    setSelectedZoneId(null);
    setSelectedSeatId(null);
    setMessage("");
  };

  const beginMissionSelection = () => {
    if (!selectedFacilityFloor.mapAvailable) {
      setSelectedFacilityFloorId("BUSAN_SOMA_18F");
    }
    returnToZoneOverview();
    setMessage("지도에서 구역을 선택한 뒤 작업할 좌석을 지정하세요.");
  };

  const submitMission = handleSubmit(async ({ priority }) => {
    if (!selectedZone || !selectedSeat) {
      setMessage("지도에서 구역과 작업 좌석을 차례로 선택해 주세요.");
      return;
    }
    setMessage("Mission을 생성하는 중입니다.");
    try {
      await createMission({
        target: {
          kind: "SEAT",
          reference_id: selectedSeat.seat_id,
          label: `${selectedZone.shortLabel} · ${selectedSeat.label}번 좌석`,
        },
        priority,
        requested_by: "scenario-operator",
        idempotency_key: crypto.randomUUID(),
      });
      setMessage(`${selectedZone.label} ${selectedSeat.label}번 좌석 작업을 Queue에 등록했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mission 생성에 실패했습니다.");
    }
  });

  const requestMissionCancel = async () => {
    if (!selectedRobotMission) return;
    try {
      await cancelMission(selectedRobotMission.mission_id);
      setMessage("활성 Mission의 안전 취소를 요청했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "취소 요청에 실패했습니다.");
    }
  };

  return (
    <section className="home-operations" aria-label={`${selectedFacilityFloor.label} 로봇 관제 홈`}>
      <header className="home-commandbar">
        <div className="home-product-title">
          <strong>Cleany</strong>
        </div>

        <div className="home-command-actions">
          <span className="home-live-state" data-state={connectionState}>
            <i />{connectionState === "connected" ? "Live" : "연결 중"}
          </span>
          <button className="home-alert-button" type="button" aria-expanded={alertsOpen} aria-controls="home-alert-popover" onClick={() => setAlertsOpen((open) => !open)}>
            <BellIcon />
            <span className="visually-hidden">알림</span>
            {alertCount ? <b>{alertCount}</b> : null}
          </button>
          <button className="home-new-mission" type="button" onClick={beginMissionSelection}>
            <span aria-hidden="true">＋</span> 새 Mission
          </button>
          <span className="home-operator"><i>OP</i><strong>운영자</strong></span>
        </div>

        <aside className={`home-alert-popover${alertsOpen ? " is-open" : ""}`} id="home-alert-popover" aria-label="운영 알림" aria-hidden={!alertsOpen}>
          <div className="alert-popover-heading">
            <div><strong>운영 알림</strong><span>{alertCount}건</span></div>
            <button type="button" aria-label="알림 닫기" onClick={() => setAlertsOpen(false)}>×</button>
          </div>
          <div className="alert-popover-list">
            {robotAlerts.map((item) => (
              <button key={item.robot_id} type="button" onClick={() => {
                setSelectedRobotId(item.robot_id);
                setAlertsOpen(false);
              }}>
                <i className="alert-dot danger" />
                <span><strong>{item.robot_id} 상태 확인</strong><small>{robotStateMeta[item.state].label} · {formatDateTime(item.last_seen_at)}</small></span>
                <b aria-hidden="true">›</b>
              </button>
            ))}
            {reviewMissions.map((mission) => (
              <Link key={mission.mission_id} to="/missions" onClick={() => setAlertsOpen(false)}>
                <i className="alert-dot warning" />
                <span><strong>{missionTargetLabel(mission, seats)}</strong><small>{mission.outcome} · 결과 확인 필요</small></span>
                <b aria-hidden="true">›</b>
              </Link>
            ))}
            {!alertCount ? <p>현재 확인이 필요한 알림이 없습니다.</p> : null}
          </div>
        </aside>
      </header>

      <div className="home-focus-layout">
        <aside className="home-fleet-panel" aria-label="로봇 목록 및 상세">
          <div className="fleet-location">
            <h2>로봇 현황</h2>
            <label className="fleet-location-picker">
              <span className="fleet-location-icon" aria-hidden="true"><MapPinIcon /></span>
              <select
                aria-label="운영 층 선택"
                value={selectedFacilityFloorId}
                onChange={(event) => selectFacilityFloor(event.target.value as FacilityFloorId)}
              >
                {facilityFloors.map((floor) => <option key={floor.id} value={floor.id}>{floor.label}</option>)}
              </select>
            </label>
          </div>

          {selectedRobot ? (
            <section className="robot-inspector" aria-label={`${selectedRobot.robot_id} 상세`}>
              <button className="inspector-back" type="button" onClick={() => setSelectedRobotId(null)}>
                <span aria-hidden="true">←</span> 전체 로봇
              </button>
              <div className="inspector-identity">
                <span className="fleet-robot-icon"><RobotIcon /></span>
                <div>
                  <strong>{selectedRobot.robot_id}</strong>
                  <span className="robot-status"><i />{robotStateMeta[selectedRobot.state].label}</span>
                </div>
              </div>
              <dl className="inspector-facts">
                <div><dt>연결</dt><dd>{selectedRobot.state === "OFFLINE" ? "오프라인" : "정상"}</dd></div>
                <div><dt>모델</dt><dd>{selectedRobotFixture?.model}</dd></div>
                <div><dt>운영 모드</dt><dd>{selectedRobotFixture?.mode}</dd></div>
                <div><dt>현재 위치</dt><dd>Pose 연동 전</dd></div>
                <div><dt>배터리</dt><dd>{selectedRobotFixture?.battery}% · Mock</dd></div>
                <div><dt>마지막 응답</dt><dd>{formatDateTime(selectedRobot.last_seen_at)}</dd></div>
              </dl>

              <div className="inspector-mission">
                <span>현재 Mission</span>
                {selectedRobotMission ? (
                  <>
                    <strong>{missionTargetLabel(selectedRobotMission, seats)}</strong>
                    <p>{selectedRobotMission.message}</p>
                    <div className="mission-progress-line"><i style={{ width: `${missionProgress(selectedRobotMission.phase)}%` }} /></div>
                    <ol aria-label="Mission 진행 단계">
                      <li className={missionStageClass(missionProgress(selectedRobotMission.phase), 8, 48)}>요청됨</li>
                      <li className={missionStageClass(missionProgress(selectedRobotMission.phase), 48, 68)}>이동</li>
                      <li className={missionStageClass(missionProgress(selectedRobotMission.phase), 68, 86)}>작업</li>
                      <li className={missionStageClass(missionProgress(selectedRobotMission.phase), 86, 100)}>복귀</li>
                    </ol>
                  </>
                ) : <p className="inspector-empty">할당된 Mission이 없습니다.</p>}
              </div>

              <div className="inspector-actions">
                <Link to="/robots">Robot 상세</Link>
                <button type="button" onClick={() => void refresh()}>상태 갱신</button>
                {selectedRobotMission ? <button className="cancel-mission" type="button" onClick={() => void requestMissionCancel()}>Mission 취소 요청</button> : null}
              </div>
            </section>
          ) : (
            <section className="fleet-overview">
              <div className="fleet-toolbar">
                <div className="fleet-filters" aria-label="로봇 필터">
                  {([
                    ["ALL", `전체 ${robots.length}`],
                    ["ACTIVE", `작업 중 ${robots.filter(({ state }) => state === "BUSY").length}`],
                    ["ATTENTION", `확인 ${robotAlerts.length}`],
                  ] as Array<[FleetFilter, string]>).map(([value, label]) => (
                    <button aria-pressed={fleetFilter === value} key={value} type="button" onClick={() => setFleetFilter(value)}>{label}</button>
                  ))}
                </div>
                <button className="fleet-refresh" type="button" aria-label="로봇 상태 새로고침" onClick={() => void refresh()}>↻</button>
              </div>
              <div className="fleet-list">
                {visibleRobots.map((item) => {
                  const activeMission = missionForRobot(item, missions);
                  const meta = robotStateMeta[item.state];
                  const fixture = robotCardFixture(Math.max(0, robots.findIndex(({ robot_id }) => robot_id === item.robot_id)));
                  return (
                    <button className="fleet-robot-card" type="button" key={item.robot_id} aria-label={`${item.robot_id} 상세 보기`} onClick={() => setSelectedRobotId(item.robot_id)}>
                      <span className="fleet-card-header">
                        <span className="fleet-card-identity"><span className="fleet-robot-icon"><RobotIcon /></span><strong>{item.robot_id}</strong></span>
                        <span className="fleet-card-connectivity" data-state={item.state}><i />{item.state === "OFFLINE" ? "Offline" : "Online"}</span>
                      </span>
                      <span className="fleet-card-facts">
                        <span><small>모델</small><strong>{fixture.model}</strong></span>
                        <span><small>상태</small><strong>{meta.label}</strong></span>
                      </span>
                      {activeMission ? <span className="fleet-card-assignment">
                        <small>현재 Mission</small>
                        <strong>{missionTargetLabel(activeMission, seats)}</strong>
                      </span> : null}
                      <span className="fleet-card-meta">
                        <span><b aria-hidden="true">↻</b>{fixture.mode}</span>
                        <span><b aria-hidden="true">◐</b>{fixture.coverage}</span>
                        <span><b className="fleet-battery" aria-hidden="true"><i /></b>{fixture.battery}%</span>
                      </span>
                    </button>
                  );
                })}
                {!visibleRobots.length ? <p className="fleet-empty">이 조건에 해당하는 로봇이 없습니다.</p> : null}
              </div>
              <Link className="fleet-all-link" to="/robots">모든 로봇 보기 <span aria-hidden="true">›</span></Link>
            </section>
          )}
        </aside>

        <section className="home-map-surface" id="facility-map-focus" aria-label="시설 지도">
          <div className="home-map-canvas">
            {selectedFacilityFloor.mapAvailable ? (
              <FacilityMap
                seats={seats}
                selectedZoneId={selectedZoneId}
                selectedSeatId={selectedSeatId}
                onSelectSeat={selectSeat}
                onBackToZones={returnToZoneOverview}
                robots={mapRobots}
                selectedRobotId={selectedRobotId}
                onSelectRobot={setSelectedRobotId}
                variant="operations"
              />
            ) : (
              <div className="floor-map-empty">
                <span>19F</span>
                <h2>19층 지도 연결 전</h2>
                <p>현재 구역과 좌석 데이터는 18층만 연결되어 있습니다.</p>
                <button type="button" onClick={() => selectFacilityFloor("BUSAN_SOMA_18F")}>18층 지도 보기</button>
              </div>
            )}
          </div>
        </section>

        <aside className={`home-mission-drawer${selectedSeat ? " is-open" : ""}`} aria-hidden={!selectedSeat} aria-label="Mission 요청 패널">
          <form onSubmit={submitMission}>
            <div className="mission-drawer-heading">
              <div><span>MISSION REQUEST</span><h2>좌석 작업 요청</h2></div>
              <button type="button" aria-label="Mission 패널 닫기" onClick={() => selectedSeat && selectSeat(selectedSeat.seat_id)}>×</button>
            </div>

            <div className="mission-target-summary">
              <span className="target-seat-number">{selectedSeat?.label ?? "--"}</span>
              <div><small>{selectedZone?.label ?? "선택한 구역"}</small><strong>{selectedSeat?.label ?? "-"}번 좌석</strong><p>{selectedSeat?.occupancy === "OCCUPIED" ? `${selectedSeat.occupant_name} 사용 중` : "현재 비어 있음"}</p></div>
            </div>

            <label className="mission-drawer-field">작업 유형
              <span>책상 위 물체 확인 및 정리</span>
            </label>
            <label className="mission-drawer-field">우선순위
              <select {...register("priority")}>
                <option value="NORMAL">보통 (NORMAL)</option>
                <option value="HIGH">높음 (HIGH)</option>
              </select>
            </label>

            <dl className="mission-request-facts">
              <div><dt>배차 방식</dt><dd>MVP Robot 순차 할당</dd></div>
              <div><dt>대기 Mission</dt><dd>{queuedCount}건</dd></div>
              <div><dt>예상 시작</dt><dd>{activeCount ? "현재 작업 후" : "즉시"}</dd></div>
            </dl>

            <p className="mission-drawer-note"><span>i</span>새 Mission은 진행 중인 작업을 선점하지 않고 Queue에 등록됩니다.</p>
            <p className="mission-drawer-message" aria-live="polite">{message}</p>
            <button className="mission-submit" type="submit" disabled={!selectedSeat || isCreatingMission}>
              <SendIcon />{isCreatingMission ? "요청 중..." : "Mission 요청"}
            </button>
            <Link className="mission-list-link" to="/missions">전체 Mission 보기 <span aria-hidden="true">›</span></Link>
          </form>
        </aside>
      </div>
    </section>
  );
}
