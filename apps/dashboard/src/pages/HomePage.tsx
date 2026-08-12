import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { SendIcon } from "../components/Icons";
import { FacilityMap } from "../features/facility-map/FacilityMap";
import {
  FACILITY_18F,
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

const recommendations = [
  {
    zoneId: "the-grond",
    eyebrow: "공용 공간",
    title: "THE GROND 정기 청소",
    description: "중앙 공용 공간을 우선 작업 구역으로 제안합니다.",
  },
  {
    zoneId: "d-hub",
    eyebrow: "업무 지원 공간",
    title: "D-HUB 스팟 청소",
    description: "넓은 개방 구역을 단일 Mission으로 검증합니다.",
  },
  {
    zoneId: "relax-zone-w",
    eyebrow: "휴게 공간",
    title: "RELAX W 저소음 청소",
    description: "휴게 공간을 분리된 작업 구역으로 선택합니다.",
  },
] as const;

export function HomePage() {
  const {
    missions,
    robot,
    seats,
    connectionState,
    createMission,
    cancelMission,
    refresh,
    isCreatingMission,
  } = useOperations();
  const { settings } = useSettings();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const { register, handleSubmit } = useForm<MissionFormValues>({
    resolver: zodResolver(missionFormSchema),
    defaultValues: { priority: settings.defaultPriority },
  });

  const selectedZone = getFacilityZone(selectedZoneId);
  const queuedCount = missions.filter(({ phase }) => phase === "QUEUED").length;
  const completed = missions.filter(({ outcome }) => outcome === "SUCCESS");
  const activeMission = missions.find(({ mission_id }) => mission_id === robot?.active_mission_id)
    ?? missions.find(({ phase }) => !["QUEUED", "TERMINAL"].includes(phase));
  const recentMissions = missions.slice(0, 2);

  const selectZone = (zoneId: string) => {
    setSelectedZoneId((current) => current === zoneId ? null : zoneId);
    setMessage("");
  };

  const submitMission = handleSubmit(async ({ priority }) => {
    if (!selectedZone) {
      setMessage("지도에서 작업 구역을 먼저 선택해 주세요.");
      return;
    }
    setMessage("Mission을 생성하는 중입니다.");
    try {
      await createMission({
        target: {
          kind: "ZONE",
          reference_id: selectedZone.id,
          label: selectedZone.label,
        },
        priority,
        requested_by: "scenario-operator",
        idempotency_key: crypto.randomUUID(),
      });
      setMessage(`${selectedZone.label} 작업을 Queue에 등록했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mission 생성에 실패했습니다.");
    }
  });

  const requestActiveCancel = async () => {
    if (!activeMission) return;
    try {
      await cancelMission(activeMission.mission_id);
      setMessage("활성 Mission의 안전 취소를 요청했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "취소 요청에 실패했습니다.");
    }
  };

  return (
    <section className="facility-dashboard" aria-label="18층 로봇 관제 대시보드">
      <div className="facility-dashboard-grid">
        <aside className="dashboard-rail dashboard-left-rail" aria-label="운영 요약">
          <article className="dashboard-card schedule-card">
            <div className="dashboard-card-heading">
              <h2>예약 청소</h2>
              <button className="compact-action" type="button" disabled title="예약 기능은 후속 범위입니다.">+ 예약</button>
            </div>
            <span className="section-kicker">다음 예약</span>
            <strong className="empty-schedule">등록된 예약 없음</strong>
            <p>현재 MVP는 즉시 구역 Mission을 지원합니다.</p>
          </article>

          <article className="dashboard-card history-card">
            <div className="dashboard-card-heading">
              <h2>최근 미션</h2>
              <button className="text-action" type="button" onClick={() => void refresh()}>새로고침</button>
            </div>
            <div className="compact-mission-list">
              {recentMissions.length ? recentMissions.map((mission) => (
                <div className="compact-mission" key={mission.mission_id}>
                  <span className={`mission-dot tone-${mission.outcome === "SUCCESS" ? "success" : "info"}`}>✓</span>
                  <div>
                    <strong>{missionTargetLabel(mission, seats)}</strong>
                    <small>{mission.outcome ?? mission.phase} · {formatDateTime(mission.created_at)}</small>
                  </div>
                </div>
              )) : <p className="dashboard-empty">아직 생성된 Mission이 없습니다.</p>}
            </div>
          </article>

          <article className="dashboard-card report-card">
            <div className="dashboard-card-heading"><h2>운영 요약</h2><span>이번 세션</span></div>
            <strong>{completed.length}<small>건 완료</small></strong>
            <dl>
              <div><dt>전체 Mission</dt><dd>{missions.length}</dd></div>
              <div><dt>대기 Mission</dt><dd>{queuedCount}</dd></div>
            </dl>
          </article>
        </aside>

        <main className="dashboard-card map-dashboard-card">
          <div className="map-card-heading">
            <div><h2>현재 지도</h2><span className="scenario-status">● 시나리오</span></div>
            <div className="map-card-tools" aria-label="지도 설정">
              <span className="view-mode"><strong>2D</strong><span>3D</span></span>
              <span className="floor-chip">{FACILITY_18F.floor}</span>
            </div>
          </div>

          <FacilityMap
            selectedZoneId={selectedZoneId}
            onSelectZone={selectZone}
            robotState={robot?.state}
          />

          <section className="map-status-strip" aria-label="작업 상태">
            <div className="map-status-primary">
              <span className="status-symbol">◎</span>
              <div><small>{activeMission ? "청소 진행 중" : "Robot 대기 중"}</small><strong>{activeMission ? missionTargetLabel(activeMission, seats) : "새 Mission 대기"}</strong></div>
            </div>
            <dl>
              <div><dt>진행률</dt><dd>{activeMission ? `${missionProgress(activeMission.phase)}%` : "-"}</dd></div>
              <div><dt>선택 구역</dt><dd>{selectedZone?.shortLabel ?? "-"}</dd></div>
              <div><dt>연결</dt><dd>{connectionState === "connected" ? "Mock API" : "연결 중"}</dd></div>
            </dl>
            <button className="pause-action" type="button" disabled={!activeMission} onClick={() => void requestActiveCancel()}>
              Ⅱ 안전 정지
            </button>
          </section>
        </main>

        <aside className="dashboard-rail dashboard-right-rail" aria-label="추천 및 빠른 제어">
          <article className="dashboard-card recommendation-card">
            <div className="dashboard-card-heading"><h2>추천 작업</h2><span>시나리오</span></div>
            <div className="recommendation-list">
              {recommendations.map((item, index) => (
                <div className="recommendation-item" key={item.zoneId}>
                  <span className={`recommendation-icon variant-${index + 1}`}>{index === 0 ? "✦" : "⌖"}</span>
                  <div>
                    <small>{item.eyebrow}</small>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                    <button type="button" onClick={() => setSelectedZoneId(item.zoneId)}>지도에서 선택</button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="dashboard-card quick-control-card">
            <div className="dashboard-card-heading"><h2>빠른 제어</h2></div>
            <div className="quick-control-grid">
              <button type="button" onClick={() => setSelectedZoneId("the-grond")}><span>◎</span>구역 선택</button>
              <button type="button" disabled={!activeMission} onClick={() => void requestActiveCancel()}><span>Ⅱ</span>안전 정지</button>
              <button type="button" disabled title="Robot Edge 연동 후 활성화됩니다."><span>ϟ</span>충전 이동</button>
              <button type="button" onClick={() => void refresh()}><span>↻</span>상태 갱신</button>
              <button type="button" disabled={!selectedZone} onClick={() => setSelectedZoneId(null)}><span>×</span>선택 해제</button>
              <button type="button" disabled title="Robot Edge 연동 후 활성화됩니다."><span>◉</span>음성 안내</button>
            </div>
          </article>
        </aside>
      </div>

      <form className="dashboard-card mission-composer" onSubmit={submitMission}>
        <div className="composer-main">
          <div className="composer-heading">
            <p className="eyebrow">MISSION REQUEST</p>
            <h2>청소 작업 요청</h2>
            <p>지도에서 구역을 선택하고 Mission을 생성합니다.</p>
          </div>
          <div className="composer-fields">
            <fieldset>
              <legend>작업 유형</legend>
              <label className="choice-chip"><input defaultChecked name="jobType" type="radio" />구역 청소</label>
            </fieldset>
            <label className="composer-field">우선순위
              <select {...register("priority")}>
                <option value="NORMAL">보통 (NORMAL)</option>
                <option value="HIGH">높음 (HIGH)</option>
              </select>
            </label>
            <div className="composer-target">
              <span>선택된 구역</span>
              <strong>{selectedZone?.label ?? "지도의 구역을 선택하세요"}</strong>
            </div>
            <button className="submit-mission" type="submit" disabled={!selectedZone || isCreatingMission}>
              <SendIcon />Mission 요청
            </button>
          </div>
          <p className="composer-message" aria-live="polite">{message}</p>
        </div>
        <aside className="composer-result" aria-label="요청 요약">
          <h3>요청 요약</h3>
          <dl>
            <div><dt>작업 대상</dt><dd>{selectedZone?.shortLabel ?? "미선택"}</dd></div>
            <div><dt>예상 시작</dt><dd>즉시</dd></div>
            <div><dt>이동 경로</dt><dd>Edge 연동 후 계산</dd></div>
          </dl>
        </aside>
      </form>
    </section>
  );
}
