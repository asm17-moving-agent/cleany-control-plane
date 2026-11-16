import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuthOptional } from '../../auth/AuthContext';
import { useDemoMode } from '../../operations/DemoModeContext';
import { Button } from '../../components/ui/button';
import { PanelHeader, StatusBadge, Surface } from '../../components/patterns';
import { ManualControlPanel } from '../manual-control/ManualControlPanel';
import { manualConnection, type ManualState } from '../manual-control/held-control';
export function ManualMode({ robotId }: { robotId: string }) {
  const auth = useAuthOptional();
  const { isDemo } = useDemoMode();
  const [state, setState] = useState<ManualState>();
  const [error, setError] = useState('');
  const [entered, setEntered] = useState(false);
  const connection = useMemo(() => manualConnection(robotId, auth?.site?.site_id ?? '', auth?.session?.csrf_token ?? ''), [robotId, auth?.site?.site_id, auth?.session?.csrf_token]);
  useEffect(() => {
    if (isDemo || entered) return;
    let cancelled = false, busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try { const next = await connection.status(); if (!cancelled) { setState(next); setError(''); } }
      catch (e) { if (!cancelled) { setState(undefined); setError(e instanceof Error ? e.message : '제어 권한 확인 실패'); } }
      finally { busy = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [connection, entered, isDemo]);
  if (isDemo || entered) return <ManualControlPanel robotId={robotId} />;
  const allowed = !!state?.available && state.connected && state.ready && state.phase === "idle" && !state.enabled && state.stop_confirmed && !state.blocked_reason && !state.paused && !state.fault_bits;
  const reason = error || state?.blocked_reason || (state?.fault_bits ? '로봇 장애 확인 필요' : state?.paused ? '안전 정지 상태' : state && !state.stop_confirmed ? '정지 확인 대기' : state && !allowed ? '조종 연결 또는 안전 상태 확인 필요' : '');
  return <Surface className="robot-manual-entry"><PanelHeader title="조종 모드" action={<StatusBadge tone={allowed ? 'success' : 'warning'}>{allowed ? '진입 가능' : '진입 대기'}</StatusBadge>} />
    <dl className="robot-preflight"><div><dt>제어 연결</dt><dd>{state?.available && state.connected ? '연결됨' : '연결 대기'}</dd></div><div><dt>자동 미션 / 안전 상태</dt><dd>{allowed ? '조종 가능' : '확인 필요'}</dd></div></dl>
    {reason && <p className="robot-inline-alert" role="alert">{reason}</p>}
    <div className="page-actions"><Button variant="primary" disabled={!allowed} onClick={() => setEntered(true)}>조종 시작</Button>
      <Button asChild><Link to={'/robots?' + new URLSearchParams({ demo: '1', recording: '0', mode: 'manual', robot: robotId })}>예시 화면</Link></Button>
      <Button variant="danger-outline" disabled={!state?.available} onClick={() => { void connection.send({ client: crypto.randomUUID(), sequence: 1, action: 'stop' }, true).catch(() => setError('정지 응답 미확인 · 현장 확인 필요')); }}>정지 요청</Button></div>
  </Surface>;
}
