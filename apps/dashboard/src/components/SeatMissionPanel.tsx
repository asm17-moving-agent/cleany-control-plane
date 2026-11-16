import { MissionPriorityField } from "./MissionPriorityField";
import { Notice } from "./patterns";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { Mission, Priority, Seat } from "../api/types";
import { CloseIcon, ChevronIcon } from "./WorkspaceIcons";
import { SendIcon } from "./Icons";
import { useOperations } from "../operations/OperationsContext";
import { useDemoMode } from "../operations/DemoModeContext";
import { useSettings } from "../settings/SettingsContext";
import { seatZoneLabel, seatOccupancyLabel, seatDisplayLabel } from "../lib/operations";

/** Submit a supported seat target, retaining the same request key for retries of unchanged input. */
export function SeatMissionPanel({ seat, unavailable, onClose, onSubmitted }: {
  seat: Seat; unavailable: boolean; onClose: () => void; onSubmitted?: (mission: Mission) => void;
}) {
  const { createMission, isCreatingMission, robots } = useOperations();
  const { isDemo, isRecording } = useDemoMode();
  const supported = isDemo || seat.mission_supported === true
    || (seat.mission_supported === undefined && robots[0]?.control_mode !== "gateway");
  const { settings } = useSettings();
  const label = seatDisplayLabel(seat);
  const [priority, setPriority] = useState<Priority>(settings.defaultPriority);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const busy = pending || isCreatingMission;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((isDemo && !isRecording) || !supported || submitting.current || busy || unavailable || submittedId) return;
    // Retry unchanged input with the original key so a lost response cannot create a second mission.
    const signature = JSON.stringify([seat.seat_id, priority]);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    submitting.current = true; setPending(true); setFailed(false); setMessage("");
    try {
      const mission = await createMission({
        target: { kind: "SEAT", reference_id: seat.seat_id, label: seatZoneLabel(seat) + " · " + label + "번 좌석" },
        priority, idempotency_key: attempt.current.key,
      });
      // Submission confirms registration; robot assignment is observed separately by the parent.
      setSubmittedId(mission.mission_id);
      setMessage(label + "번 좌석 작업을 대기열에 등록했습니다." + (onSubmitted ? " 로봇이 배정되면 상세 패널이 열립니다." : ""));
      onSubmitted?.(mission);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "요청을 보내지 못했습니다. 다시 시도해 주세요.");
    } finally { submitting.current = false; setPending(false); }
  }
  return (
    <aside className="seat-mission-panel" aria-label="작업 요청 패널" onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); } }}>
      <div className="seat-mission-heading"><h2 tabIndex={-1} ref={heading}>작업 요청</h2>
        <Button variant="ghost" size="icon-compact" className="workspace-icon-button" type="button" aria-label="작업 요청 닫기" onClick={onClose} disabled={busy}><CloseIcon /></Button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="seat-mission-fields">
          <section className="seat-mission-target" aria-label="선택된 좌석">
            <span className="field-caption">선택된 좌석</span><strong className={label.length > 2 ? "is-room-seat" : undefined}>{label}<small>번</small></strong>
            <p>{seatZoneLabel(seat)} <span>·</span> {seatOccupancyLabel(seat)}</p>
          </section>
          <div className="mission-readonly-field"><span className="field-caption" id="dispatch-label">로봇</span>
            <output aria-labelledby="dispatch-label"><span>자동 할당</span></output>
          </div>
          <div className="mission-readonly-field"><span className="field-caption" id="command-label">명령</span>
            <output aria-labelledby="command-label">책상 위 물체 확인 및 정리</output>
          </div>
          <MissionPriorityField id="seat-priority" value={priority} disabled={busy || !!submittedId}
            onChange={value => { setPriority(value); attempt.current = null; setMessage(""); setFailed(false); }} />
          <p className="mission-queue-note">대기열 등록 · 진행 중인 작업 유지</p>
        </div>
        <div className="seat-mission-submit">
          {message && <Notice tone={failed ? "danger" : "success"} role={failed ? "alert" : "status"} className={failed ? "request-feedback is-error" : "request-feedback"}>{message}</Notice>}
          {unavailable && <Notice tone="danger" className="request-feedback is-error">데이터 연결을 확인한 뒤 요청해 주세요.</Notice>}
          {!isDemo && !supported && <Notice tone="danger" className="request-feedback is-error">{seat.mission_supported === false ? "이 좌석은 아직 로봇 작업을 지원하지 않습니다." : "런타임 연결 후 지원 좌석을 확인해 주세요."}</Notice>}
          <Button variant="primary" size="large" type="submit" className="workspace-primary-button" disabled={(isDemo && !isRecording) || !supported || busy || unavailable || !!submittedId}>
            <SendIcon />{busy ? "요청 중…" : submittedId ? "대기열 등록 완료" : failed ? "다시 요청" : "요청 보내기"}
          </Button>
          {submittedId && <Link to={"/missions?mission=" + encodeURIComponent(submittedId)} className="mission-success-link">요청 현황 보기 <ChevronIcon /></Link>}
        </div>
      </form>
    </aside>
  );
}
