import { Details } from "../../components/patterns";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useAuthOptional } from '../../auth/AuthContext';
import { useDemoMode } from '../../operations/DemoModeContext';
import { HeldControl, manualConnection, stickAxes, type ManualState, type Vector } from './held-control';
import './manual-control.css';
import { HeadCamera } from './HeadCamera';

type Stick = 'move' | 'turn';
type Contact = { id: number; vector: Vector; x: number; y: number };
const keys: Record<string, Vector> = {
  ArrowUp: [1, 0, 0], ArrowDown: [-1, 0, 0], ArrowLeft: [0, 1, 0], ArrowRight: [0, -1, 0],
  a: [0, 0, 1], d: [0, 0, -1],
};
const centered = { move: { x: 0, y: 0 }, turn: { x: 0, y: 0 } };

export function ManualControlPanel({ robotId }: { robotId: string }) {
  const auth = useAuthOptional();
  const { isDemo, isRecording } = useDemoMode();
  const disabledMode = isDemo || isRecording;
  const [state, setState] = useState<ManualState | null>(null);
  const [error, setError] = useState('');
  const [held, setHeld] = useState(false);
  const [knobs, setKnobs] = useState(centered);
  const [speed, setSpeed] = useState(0.5);
  const input = useRef<HeldControl | null>(null);
  const contacts = useRef(new Map<Stick, Contact>());
  const heldKeys = useRef(new Set<string>());
  const connection = useMemo(() => manualConnection(robotId, auth?.site?.site_id ?? '', auth?.session?.csrf_token ?? ''),
    [robotId, auth?.site?.site_id, auth?.session?.csrf_token]);
  const live = !disabledMode && !!auth?.session && !!auth.site;
  useEffect(() => {
    setState(null); setError(''); setHeld(false); setKnobs(centered);
    contacts.current.clear(); heldKeys.current.clear();
    if (!live) return;
    let disposed = false, polling = false;
    const controller = new HeldControl(connection.send, active => {
      if (!disposed) {
        setHeld(active);
        if (!active) { contacts.current.clear(); heldKeys.current.clear(); setKnobs(centered); }
      }
    }, message => { if (!disposed) setError(message); });
    input.current = controller;
    const poll = async () => {
      if (polling || disposed) return;
      polling = true;
      try {
        const next = await connection.status();
        if (!disposed) {
          setState(next);
          if (!next.available || !next.connected || next.paused || next.blocked_reason || next.fault_bits) controller.stop();
        }
      } catch {
        if (!disposed) { setState(null); controller.stop(); setError('조종 상태를 불러오지 못했습니다.'); }
      } finally { polling = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 500);
    const stop = () => controller.stop();
    const visibility = () => { if (document.hidden) stop(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') stop(); };
    window.addEventListener('blur', stop); window.addEventListener('pagehide', stop);
    window.addEventListener('keydown', escape); document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true; clearInterval(timer); controller.dispose(); input.current = null;
      window.removeEventListener('blur', stop); window.removeEventListener('pagehide', stop);
      window.removeEventListener('keydown', escape); document.removeEventListener('visibilitychange', visibility);
    };
  }, [connection, live]);
  const maximum = state?.web_max_velocity ?? 0.5;
  const allowed = live && !!state?.available && !!state?.connected && !state.blocked_reason && !state.paused && !state.fault_bits;
  const ready = allowed && !!state?.ready;
  function updateIntent() {
    if (!contacts.current.size && !heldKeys.current.size) { input.current?.stop(); return; }
    const vector: Vector = [0, 0, 0];
    const intents = [...contacts.current.values()].map(contact => contact.vector)
      .concat([...heldKeys.current].map(key => keys[key]));
    for (const value of intents) value.forEach((axis, index) => { vector[index] += axis; });
    const bounded = vector.map((axis, index) => state?.forward_only && index === 1 ? 0 : Math.max(-1, Math.min(1, axis))) as Vector;
    input.current?.press(bounded, Math.min(speed, maximum));
  }
  function point(kind: Stick, event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = kind === 'move' ? rect.width * .31 : Math.max(1, (rect.width - 36) / 2 - 8);
    const axes = stickAxes(event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2, radius, kind === 'turn', !!state?.forward_only);
    contacts.current.set(kind, { id: event.pointerId, vector: axes.vector, x: axes.x * radius, y: axes.y * radius });
    setKnobs(previous => ({ ...previous, [kind]: { x: axes.x * radius, y: axes.y * radius } }));
    updateIntent();
  }
  function release(kind: Stick, pointerId: number) {
    if (contacts.current.get(kind)?.id !== pointerId) return;
    contacts.current.delete(kind);
    setKnobs(previous => ({ ...previous, [kind]: { x: 0, y: 0 } }));
    updateIntent();
  }
  function stick(kind: Stick) {
    const rotation = kind === 'turn';
    const disabled = !allowed || (!ready && !held);
    return <div className="manual-stick-wrap">
      <div className={`manual-stick ${rotation ? 'manual-turn' : 'manual-move'}`} role="application"
        tabIndex={0} aria-label={rotation ? '회전 슬라이더' : '이동 조이스틱'} aria-disabled={disabled}
        data-active={contacts.current.has(kind) || undefined}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => {
          if (disabled || event.button !== 0 || contacts.current.has(kind) || heldKeys.current.size) return;
          event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
          setError(''); point(kind, event);
        }}
        onPointerMove={event => {
          if (contacts.current.get(kind)?.id !== event.pointerId) return;
          if (event.pointerType === 'mouse' && event.buttons === 0) input.current?.stop();
          else point(kind, event);
        }}
        onPointerUp={event => release(kind, event.pointerId)}
        onPointerCancel={() => input.current?.stop()}
        onLostPointerCapture={event => {
          if (contacts.current.get(kind)?.id === event.pointerId) input.current?.stop();
        }}>
        {!rotation && <><span className="manual-axis north">↑</span><span className="manual-axis south">↓</span></>}
        {(!state?.forward_only || rotation) && <><span className="manual-axis west">{rotation ? '↶' : '←'}</span><span className="manual-axis east">{rotation ? '↷' : '→'}</span></>}
        <div className="manual-knob" style={{ transform: `translate(calc(-50% + ${knobs[kind].x}px), calc(-50% + ${knobs[kind].y}px))` }} />
      </div>
      <span>{rotation ? '회전' : state?.forward_only ? '이동 · 전후진' : '이동'}</span>
    </div>;
  }
  return <section className="manual-control" aria-label="수동 조종" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) input.current?.stop();
  }} onKeyDown={event => {
    if (event.key === ' ') { event.preventDefault(); input.current?.stop(true); return; }
    if ((event.target as HTMLElement).tagName === 'INPUT' || event.ctrlKey || event.altKey || event.metaKey || contacts.current.size) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!keys[key] || (!ready && !held) || !allowed || (event.repeat && !heldKeys.current.has(key))) return;
    if (state?.forward_only && (key === 'ArrowLeft' || key === 'ArrowRight')) return;
    event.preventDefault(); heldKeys.current.add(key); setError(''); updateIntent();
  }} onKeyUp={event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (heldKeys.current.delete(key)) { event.preventDefault(); updateIntent(); }
  }}>
    <header><h4>수동 조종</h4>
      <span className="manual-badge" data-ready={ready || undefined}>{disabledMode ? '예시 · 조종 불가' : state?.mock ? '모의 조종' : held ? '입력 전송 중' : ready ? '조종 가능' : '조종 대기'}</span></header>
    <HeadCamera robotId={robotId} />
    <div className="manual-body"><div className="manual-inputs">
      <div className="manual-sticks">{stick('move')}{stick('turn')}</div>
      <button type="button" className="manual-stop" disabled={!live || !state?.available} onClick={() => { setError(''); input.current?.stop(true); }}>■ 정지</button>
      <p className="manual-key-hint">입력 종료 시 정지 요청 · 물리 비상정지 아님</p>
    </div><div className="manual-feedback">
      <label className="manual-speed">바퀴 속도 상한 <output>{Math.min(speed, maximum).toFixed(1)} <small>rad/s</small></output>
        <input aria-label="바퀴 속도 상한" type="range" min="0.1" max={maximum} step="0.1" value={Math.min(speed, maximum)} disabled={!ready || held} onChange={event => setSpeed(Number(event.target.value))} />
      </label>
      <dl className="manual-stop-status" aria-live="polite"><div><dt>정지 확인</dt><dd>{state?.connected && state.stop_confirmed ? state.mock ? '모의 확인' : 'MCU 확인' : '미확인'}</dd></div></dl>
      {!disabledMode && (error || state?.blocked_reason || (!ready && !held)) && <p className="manual-message" role="status">{error || state?.blocked_reason || state?.message || (state ? '조종 불가 · 연결 확인 필요' : '연결 확인 중')}</p>}
      <Details onKeyDown={event => { if (event.key === ' ' && (event.target as HTMLElement).tagName === 'SUMMARY') event.stopPropagation(); }} label="연결 상세">
        <dl><div><dt>조종 서버</dt><dd>{state?.available ? '연결됨' : '연결 안 됨'}</dd></div>
          <div><dt>구동부 응답</dt><dd>{state?.connected ? state.mock ? '모의 응답' : '수신 중' : '대기'}</dd></div>
          <div><dt>이동 범위</dt><dd>{state?.forward_only ? '전후진 · 회전' : '전후좌우 · 회전'}</dd></div></dl>
        {ready && state?.message && <p>{state.message}</p>}
      </Details>
      <Details onKeyDown={event => { if (event.key === ' ' && (event.target as HTMLElement).tagName === 'SUMMARY') event.stopPropagation(); }} label="조작 도움말">
        <p>방향키 이동 · A/D 회전 · Space / Esc 정지 요청</p>
        <p>스틱을 멀리 밀수록 빠르게 이동합니다. 모든 입력을 놓으면 정지를 요청합니다.</p>
      </Details>
    </div></div>
  </section>;
}
