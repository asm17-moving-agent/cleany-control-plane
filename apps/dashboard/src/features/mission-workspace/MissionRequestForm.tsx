import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Mission, Priority } from "../../api/types";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { Field, Notice } from "../../components/patterns";
import { useOperations } from "../../operations/OperationsContext";
import { useDemoMode } from "../../operations/DemoModeContext";
import { useSettings } from "../../settings/SettingsContext";
import { seatDisplayLabel, seatZoneLabel } from "../../lib/operations";

export function MissionRequestForm({ retry, onClose, onCreated }: { retry?: Mission; onClose: () => void; onCreated: (mission: Mission) => void }) {
  const { seats, robots, createMission, isCreatingMission, isLoading, error } = useOperations();
  const { isDemo, isRecording } = useDemoMode();
  const { settings } = useSettings();
  const [seatId, setSeatId] = useState(retry?.target.kind === "SEAT" ? retry.target.reference_id : "");
  const [priority, setPriority] = useState<Priority>(retry?.priority ?? settings.defaultPriority);
  const [pending, setPending] = useState(false), [failure, setFailure] = useState("");
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const supported = (seat: typeof seats[number]) => isDemo || seat.mission_supported === true || (seat.mission_supported === undefined && robots[0]?.control_mode !== "gateway");
  const seat = seats.find(s => s.seat_id === seatId);
  const blocked = isLoading || !!error || !seat || !supported(seat) || (isDemo && !isRecording);
  const busy = pending || isCreatingMission;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (blocked || busy || sending.current || !seat) return;
    const signature = JSON.stringify([seatId, priority]);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    sending.current = true; setPending(true); setFailure("");
    try {
      const mission = await createMission({ target: { kind: "SEAT", reference_id: seatId, label: `${seatZoneLabel(seat)} · ${seatDisplayLabel(seat)}번 좌석` }, priority, idempotency_key: attempt.current.key });
      if (mounted.current) onCreated(mission);
    } catch (e) { setFailure(e instanceof Error ? e.message : "요청을 보내지 못했습니다."); }
    finally { sending.current = false; setPending(false); }
  }
  return <form className="task-create" aria-label={retry ? "재작업 요청" : "새 작업 요청"} onSubmit={event => void submit(event)}>
    <header className="task-detail-heading"><div><span className="task-eyebrow">작업 등록</span><h3>{retry ? "다시 작업 요청" : "새 작업 요청"}</h3></div><Button type="button" variant="ghost" size="compact" onClick={onClose} disabled={busy}>닫기</Button></header>
    <div className="task-create-body">
      {retry && <Notice>이전 결과는 보존하고 새 작업을 등록합니다.</Notice>}
      <Field label="작업 좌석" htmlFor="task-seat"><NativeSelect id="task-seat" value={seatId} disabled={busy} required onChange={e => setSeatId(e.target.value)}><option value="">좌석 선택</option>{seats.map(s=><option key={s.seat_id} value={s.seat_id} disabled={!supported(s)}>{seatZoneLabel(s)} · {seatDisplayLabel(s)}번 좌석{!supported(s) ? " · 작업 미지원" : ""}</option>)}</NativeSelect></Field>
      <p className="task-request-description">정리 작업 · 오늘 등록 · 로봇 자동 할당</p>
      <Field label="우선순위" htmlFor="task-priority"><NativeSelect id="task-priority" value={priority} disabled={busy} onChange={e=>setPriority(e.target.value as Priority)}><option value="NORMAL">보통</option><option value="HIGH">높음</option></NativeSelect></Field>
      {seat?.occupancy === "OCCUPIED" && <Notice tone="warning">사용 중인 좌석입니다. 정리 가능한 상태인지 확인해 주세요.</Notice>}
      {!isDemo && seat && !supported(seat) && <Notice tone="warning">현재 로봇이 지원하지 않는 좌석입니다.</Notice>}
      {isDemo && !isRecording && <Notice>예시 모드 · 실제 작업은 등록되지 않습니다.</Notice>}
      {error && <Notice tone="danger">데이터 연결을 확인한 뒤 요청해 주세요.</Notice>}
      {failure && <Notice tone="danger" role="alert">{failure}</Notice>}
    </div>
    <footer className="task-detail-footer"><Button variant="primary" size="large" type="submit" disabled={blocked || busy}>{busy ? "요청 중…" : "요청 보내기"}</Button></footer>
  </form>;
}
