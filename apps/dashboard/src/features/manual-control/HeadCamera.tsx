import { useEffect, useState } from 'react';
import { useAuthOptional } from '../../auth/AuthContext';
import { useDemoMode } from '../../operations/DemoModeContext';

/** Fetch only fresh frames; leaving the page releases the monitor's camera lease. */
export function HeadCamera({ robotId }: { robotId: string }) {
  const auth = useAuthOptional();
  const { isDemo, isRecording } = useDemoMode();
  const [frame, setFrame] = useState('');
  const [message, setMessage] = useState('연결 중');
  const siteId = auth?.site?.site_id;
  const live = !!siteId && !!auth?.session && !isDemo && !isRecording;
  useEffect(() => {
    let disposed = false, running = false, current = '', timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const clear = () => { if (current) URL.revokeObjectURL(current); current = ''; setFrame(''); };
    clear(); setMessage(live ? '연결 중' : '예시 모드 · 영상 없음');
    if (!live) return;
    async function next() {
      if (disposed || document.hidden || running) return;
      running = true;
      controller = new AbortController();
      const active = controller;
      const timeout = setTimeout(() => active.abort(), 1800);
      let delay = 200;
      try {
        const response = await fetch(`/api/robots/${encodeURIComponent(robotId)}/camera/head?site_id=${encodeURIComponent(siteId!)}`, { signal: controller.signal, cache: 'no-store' });
        if (response.status === 401) window.dispatchEvent(new Event('cleany:auth-expired'));
        if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/jpeg')) throw new Error('unavailable');
        const blob = await response.blob();
        if (disposed || document.hidden) return;
        const previous = current;
        current = URL.createObjectURL(blob); setFrame(current); setMessage('실시간');
        if (previous) URL.revokeObjectURL(previous);
      } catch {
        if (!disposed) { clear(); setMessage('영상 대기'); }
        delay = 1500;
      } finally {
        clearTimeout(timeout); running = false;
        if (!disposed && !document.hidden) timer = setTimeout(() => void next(), delay);
      }
    }
    const visibility = () => {
      clearTimeout(timer);
      if (document.hidden) { controller?.abort(); clear(); setMessage('영상 일시 정지'); }
      else if (!running) { timer = setTimeout(() => void next(), 200); }
    };
    void next(); document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); if (current) URL.revokeObjectURL(current); document.removeEventListener('visibilitychange', visibility); };
  }, [robotId, siteId, live]);
  return <section className="head-camera" aria-label="헤드캠">
    <div className="head-camera-title"><strong>헤드캠</strong>{frame && <span data-live>{message}</span>}</div>
    <div className="head-camera-view">{frame ? <img src={frame} alt="로봇 헤드캠 실시간 영상" onError={() => { setFrame(''); setMessage('영상 오류'); }} /> : <div className="head-camera-empty"><span aria-hidden="true">▣</span><p role="status">{message}</p></div>}</div>
  </section>;
}
