import { ChevronIcon, ClockIcon } from "../../components/WorkspaceIcons";
import { useRef, useState } from "react";
import { Link } from "react-router";
import type { Mission } from "../../api/types";
import { api } from "../../api/client";
import { Button } from "../../components/ui/button";
import { Details, Notice, StatusBadge } from "../../components/patterns";
import { MissionProgress } from "../../components/MissionProgress";
import { MissionStatusBadge } from "../../components/OperationsPage";
import { InfoRow } from "../../components/InfoRow";
import { useOperations } from "../../operations/OperationsContext";
import { useDemoMode } from "../../operations/DemoModeContext";
import { formatDateTime, missionTargetLabel, missionMessage } from "../../lib/operations";
import { needsResultReview, outcomeLabels } from "../../lib/home-summary";
import { missionElapsed } from "../../lib/execution-source";
import { MissionObservation } from "./MissionObservation";

export function MissionDetail({ mission, onRetry, onChanged }: { mission: Mission; onRetry: () => void; onChanged: () => Promise<void> }) {
  const { robots, seats, cancelMission, isLoading, error } = useOperations();
  const { isDemo, isRecording } = useDemoMode();
  const terminal = mission.phase === "TERMINAL";
  const assigned = robots.find(r=>r.active_mission_id === mission.mission_id);
  const robotId = mission.robot_id ?? assigned?.robot_id;
  const unsupported = !isDemo && mission.phase !== "QUEUED" && (assigned ?? robots[0])?.can_cancel === false;
  const [pending, setPending] = useState<"cancel" | "review" | null>(null), [failure, setFailure] = useState("");
  const sending = useRef(false);
  const disabled = isLoading || !!error || !!pending;
  const facts = <dl className="task-facts"><InfoRow label="담당 로봇">{robotId ? <Link to={`/robots?robot=${encodeURIComponent(robotId)}`}>{robotId} <ChevronIcon aria-hidden="true" /></Link> : mission.phase === "QUEUED" ? "배정 대기" : "기록 없음"}</InfoRow><InfoRow label="우선순위">{mission.priority === "HIGH" ? "높음" : "보통"}</InfoRow><InfoRow label="요청 시각">{formatDateTime(mission.created_at)}</InfoRow><InfoRow label={terminal ? "완료·종료 시각" : "수락 시각"}>{terminal ? mission.finished_at ? formatDateTime(mission.finished_at) : "기록 없음" : mission.accepted_at ? formatDateTime(mission.accepted_at) : "수락 대기"}</InfoRow></dl>;
  async function act(action: "cancel" | "review") {
    if (sending.current || disabled || (isDemo && (action === "review" || !isRecording))) return;
    if (action === "cancel" && (terminal || unsupported || mission.cancel_requested)) return;
    if (action === "review" && (!terminal || mission.review)) return;
    sending.current = true; setPending(action); setFailure("");
    try { if (action === "cancel") await cancelMission(mission.mission_id); else await api.reviewMission(mission.mission_id); await onChanged(); }
    catch (e) { setFailure(e instanceof Error ? e.message : "처리하지 못했습니다."); }
    finally { sending.current = false; setPending(null); }
  }
  return <>
    <header className="task-detail-heading"><div><span className="task-eyebrow">작업 상세</span><h3>{missionTargetLabel(mission,seats)}</h3></div><MissionStatusBadge mission={mission} /></header>
    <div className="task-detail-scroll">
      <MissionProgress mission={mission} />
      {!terminal && facts}
      {mission.cancel_requested && !terminal && <Notice tone="warning">취소 요청됨 · 종료 확인 대기</Notice>}
      {unsupported && !terminal && <Notice>현재 작업은 원격 취소 미지원</Notice>}
      <section className="task-result" aria-label="작업 결과 상세">
        <div className="task-section-title"><h4>작업 결과</h4>{mission.review && <StatusBadge tone="success">검토 완료</StatusBadge>}</div>
        {terminal ? <>
          {needsResultReview(mission) && <Notice tone="warning">관리자 확인 필요</Notice>}
          <p className="task-result-summary">{missionMessage(mission.message) || outcomeLabels[mission.outcome!]}</p>
          <dl className="task-result-facts">{mission.failure_code && <InfoRow label="실패 이유">{mission.failure_code}</InfoRow>}{!!mission.completed_tasks?.length && <InfoRow label="완료 작업">{mission.completed_tasks.join(", ")}</InfoRow>}{!!mission.skipped_tasks?.length && <InfoRow label="미처리 작업">{mission.skipped_tasks.join(", ")}</InfoRow>}{mission.failed_task && <InfoRow label="실패 작업">{mission.failed_task}</InfoRow>}{mission.needs_human_review && <InfoRow label="로봇 보고">사람 확인 필요</InfoRow>}</dl>
          <div className="result-observations"><MissionObservation key={`before:${mission.before_observation}`} label="작업 전" reference={mission.before_observation} /><MissionObservation key={`after:${mission.after_observation}`} label="작업 후" reference={mission.after_observation} /></div>
          {mission.review && <p className="task-reviewed">{mission.review.reviewer_name} · {formatDateTime(mission.review.reviewed_at)} 확인</p>}
        </> : <div className="task-result-pending"><ClockIcon aria-hidden="true" /><strong>{mission.phase === "QUEUED" ? "작업 대기 중" : "작업 진행 중"}</strong><span>결과 도착 시 이곳에 표시됩니다.</span></div>}
      </section>
      {terminal && facts}
      <Details label="상세 정보"><dl className="task-result-facts"><InfoRow label="요청자">{mission.requested_by}</InfoRow><InfoRow label="요청 ID"><code>{mission.mission_id}</code></InfoRow><InfoRow label="요청부터 결과 수신">{missionElapsed(mission.created_at, mission.finished_at)}</InfoRow></dl></Details>
    </div>
    <footer className="task-detail-footer">
      {failure && <Notice tone="danger" role="alert">{failure}</Notice>}
      <div><span className="task-action-note">{mission.review ? "결과 기록 보존됨" : terminal && needsResultReview(mission) ? "열람만으로 검토 완료되지 않습니다." : ""}</span><div className="task-actions">
        {terminal ? <><Button variant="secondary" disabled={disabled || mission.target.kind!=="SEAT"} onClick={onRetry}>다시 작업 요청</Button>{needsResultReview(mission) && <Button variant="primary" disabled={disabled || isDemo} onClick={()=>void act("review")}>{pending==="review" ? "저장 중…" : "검토 완료"}</Button>}</> : <Button variant="danger-outline" disabled={disabled || (isDemo && !isRecording) || unsupported || mission.cancel_requested} onClick={()=>void act("cancel")}>{pending==="cancel" ? "취소 요청 중…" : mission.cancel_requested ? "취소 요청됨" : "작업 취소 요청"}</Button>}
      </div></div>
    </footer>
  </>;
}
