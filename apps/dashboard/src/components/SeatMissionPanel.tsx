import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { Mission, Priority, Seat } from "../api/types";
import { CloseIcon, ChevronIcon } from "./WorkspaceIcons";
import { SendIcon } from "./Icons";
import { useOperations } from "../operations/OperationsContext";
import { useDemoMode } from "../operations/DemoModeContext";
import { useSettings } from "../settings/SettingsContext";
import { seatZoneLabel, seatOccupancyLabel, seatDisplayLabel } from "../lib/operations";

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
    const signature = JSON.stringify([seat.seat_id, priority]);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    submitting.current = true; setPending(true); setFailed(false); setMessage("");
    try {
      const mission = await createMission({
        target: { kind: "SEAT", reference_id: seat.seat_id, label: seatZoneLabel(seat) + " · " + label + "번 좌석" },
        priority, idempotency_key: attempt.current.key,
      });
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
        <button className="workspace-icon-button" type="button" aria-label="작업 요청 닫기" onClick={onClose} disabled={busy}><CloseIcon /></button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="seat-mission-fields">
          <section className="seat-mission-target" aria-label="선택된 좌석">
            <span className="field-caption">선택된 좌석</span><strong className={label.length > 2 ? "is-room-seat" : undefined}>{label}<small>번</small></strong>
            <p>{seatZoneLabel(seat)} <span>·</span> {seatOccupancyLabel(seat)}</p>
          </section>
          <div className="mission-readonly-field"><span className="field-caption" id="dispatch-label">로봇</span>
            <output aria-labelledby="dispatch-label"><span>자동 할당</span><small>등록 {robots.length}대</small></output>
          </div>
          <div className="mission-readonly-field"><span className="field-caption" id="command-label">명령</span>
            <output aria-labelledby="command-label">책상 위 물체 확인 및 정리</output>
          </div>
          <fieldset className="mission-priority" disabled={busy || !!submittedId}>
            <legend>우선순위</legend>
            <div>{([{ value: "NORMAL", label: "보통" }, { value: "HIGH", label: "높음" }] as const).map((option) => (
              <label key={option.value}><input type="radio" name="priority" value={option.value} checked={priority === option.value}
                onChange={() => { setPriority(option.value); attempt.current = null; setMessage(""); setFailed(false); }} /><span>{option.label}</span></label>
            ))}</div>
          </fieldset>
          <p className="mission-queue-note">요청은 대기열에 등록됩니다.<br />진행 중인 작업을 중단하지 않습니다.</p>
        </div>
        <div className="seat-mission-submit">
          {message && <p role={failed ? "alert" : "status"} className={failed ? "request-feedback is-error" : "request-feedback"}>{message}</p>}
          {unavailable && <p className="request-feedback is-error">데이터 연결을 확인한 뒤 요청해 주세요.</p>}
          {!isDemo && !supported && <p className="request-feedback is-error">{seat.mission_supported === false ? "이 좌석은 아직 로봇 작업을 지원하지 않습니다." : "런타임 연결 후 지원 좌석을 확인해 주세요."}</p>}
          <button type="submit" className="workspace-primary-button" disabled={(isDemo && !isRecording) || !supported || busy || unavailable || !!submittedId}>
            <SendIcon />{busy ? "요청 중…" : submittedId ? "대기열 등록 완료" : failed ? "다시 요청" : "요청 보내기"}
          </button>
          {submittedId && <Link to={"/missions?mission=" + encodeURIComponent(submittedId)} className="mission-success-link">요청 현황 보기 <ChevronIcon /></Link>}
        </div>
      </form>
    </aside>
  );
}
