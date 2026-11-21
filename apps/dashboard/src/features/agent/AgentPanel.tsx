import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { NativeSelect } from '../../components/ui/native-select';
import { StatusBadge } from '../../components/patterns';
import { MissionStatusBadge } from '../../components/OperationsPage';
import { useAuthOptional } from '../../auth/AuthContext';
import { useOperations } from '../../operations/OperationsContext';
import { useDemoMode } from '../../operations/DemoModeContext';
import { api } from '../../api/client';
import { agentApi, type AgentPlan } from './api';
import { useAgent } from './AgentContext';
import { AgentResultCard } from './AgentResultCard';
import './agent.css';

export function AgentIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8L12 3ZM20 2v4m-2-2h4" strokeLinejoin="round" /></svg>; }
export function AgentTrigger() {
  const agent = useAgent();
  return <Button className="agent-trigger" variant={agent.open ? 'primary' : 'ghost'} aria-label="Cleany AI 열기" aria-expanded={agent.open} aria-controls="cleany-agent" onClick={() => agent.setOpen(!agent.open)}><AgentIcon /><span>AI</span>{agent.busy && <i className="agent-live-dot" />}</Button>;
}
const pages: Record<string, string> = { '/': '홈', '/map': '지도', '/map/edit': '배치 편집', '/missions': '작업', '/robots': '로봇', '/settings': '설정' };
const suggestions: Record<string, string[]> = {
  '/': ['오늘 완료된 작업은 몇 건이야?', '어제와 오늘 완료 건수 비교해 줘', '지금 확인할 문제가 있어?'],
  '/map': ['여기 정리해 줘', 'D-HUB 작업 가능 좌석 보여줘', '오늘 좌석별 완료 지도 보여줘'],
  '/map/edit': ['이 시설에서 작업 가능한 좌석을 알려 줘', '현재 로봇 상태를 확인해 줘'],
  '/missions': ['이 작업이 왜 실패했어?', '작업 대기열 보여줘', '오늘 미검토 작업 보여줘'],
  '/robots': ['오늘 로봇이 멈춘 원인을 분석해 줘', '오늘 배터리 추이 보여줘', '헤드캠 보여줘'],
  '/settings': ['현재 연결된 로봇을 알려 줘', '최근 일주일 운영 현황을 요약해 줘'],
};
function PlanCard({ plan }: { plan: AgentPlan }) {
  const agent = useAgent();
  const auth = useAuthOptional();
  const { seats, robots, refresh } = useOperations();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState(plan.items.map(({ seat_id, robot_id, priority, task_type }) => ({ seat_id, robot_id, priority, task_type })));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [addSeat, setAddSeat] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => { if (plan.status !== 'draft') return; const timer = window.setInterval(() => setNow(Date.now()), 10000); return () => window.clearInterval(timer); }, [plan.status]);
  const expired = Date.parse(plan.expires_at) <= now;
  const draft = plan.status === 'draft' && !expired;
  const disabled = pending || agent.busy;
  const states = { draft: expired ? '만료됨' : '승인 대기', submitted: '작업 등록됨', cancelled: '취소됨', superseded: '새 계획으로 변경됨', expired: '만료됨' };
  const missions = useQuery({ queryKey: ['agent-plan-missions', auth?.site?.site_id, plan.plan_id, plan.mission_ids], enabled: plan.status === 'submitted', queryFn: () => Promise.all((plan.mission_ids ?? []).map(api.mission)), refetchInterval: query => query.state.data?.every(m => m.phase === 'TERMINAL') ? false : 3000 });
  async function act(action: 'approve' | 'cancel' | 'edit') {
    setPending(true); setError('');
    try {
      const updated = action === 'edit' ? await agentApi.edit(plan, items) : action === 'approve' ? await agentApi.approve(plan) : await agentApi.cancel(plan);
      agent.updatePlan(updated); setEditing(false);
      if (action === 'approve') await refresh();
    } catch (e) { setError((e as Error).message); if (agent.detail) void agent.refresh(agent.detail.conversation_id).catch(() => {}); }
    finally { setPending(false); }
  }
  return <section className="agent-plan" aria-label="AI 작업 계획">
    <header><span className="agent-eyebrow">작업 계획 · 좌석 정리{plan.execution_mode === 'mock' ? ' · Mock' : ''}</span><StatusBadge tone={draft ? 'warning' : plan.status === 'submitted' ? 'success' : 'neutral'}>{states[plan.status]}</StatusBadge></header>
    <h3>{plan.title}</h3>{plan.reason && <p>{plan.reason}</p>}
    <div className="agent-plan-targets">{(editing ? items : plan.items).map((item, index) => {
      const canonical = seats.find(s => s.seat_id === item.seat_id);
      const saved = plan.items.find(s => s.seat_id === item.seat_id);
      return <div key={item.seat_id}><div><strong>{(canonical?.zone_id ?? saved?.zone_id ?? '').toUpperCase()} · {canonical?.label ?? saved?.label ?? item.seat_id}</strong><small>{item.robot_id}</small></div>
        {editing ? <><NativeSelect aria-label={`${canonical?.label ?? saved?.label} 우선순위`} value={item.priority} onChange={e => setItems(old => old.map((value, i) => i === index ? { ...value, priority: e.target.value as 'NORMAL' | 'HIGH' } : value))}><option value="NORMAL">보통</option><option value="HIGH">높음</option></NativeSelect><Button size="icon-compact" variant="ghost" aria-label={`${canonical?.label ?? saved?.label} 좌석 제외`} onClick={() => setItems(old => old.filter((_, i) => i !== index))}>×</Button></> : <span>{item.priority === 'HIGH' ? '높음' : '보통'}</span>}
      </div>;
    })}</div>
    {editing && <div className="agent-add-seat"><NativeSelect aria-label="계획에 추가할 좌석" value={addSeat} onChange={e => setAddSeat(e.target.value)}><option value="">좌석 추가</option>{seats.filter(s => !items.some(i => i.seat_id === s.seat_id)).map(s => <option key={s.seat_id} value={s.seat_id}>{s.zone_id?.toUpperCase()} · {s.label}</option>)}</NativeSelect><Button disabled={!addSeat || !robots[0] || items.length >= (agent.status?.max_plan_items ?? 50)} onClick={() => { setItems(old => [...old, { seat_id: addSeat, robot_id: robots[0].robot_id, priority: 'NORMAL', task_type: 'SEAT_SERVICE' }]); setAddSeat(''); }}>추가</Button></div>}
    {!editing && plan.blockers?.map(reason => <p className="agent-warning" key={reason}>{reason}</p>)}
    {error && <p role="alert" className="agent-error">{error}</p>}
    {draft && <footer>{editing ? <><Button disabled={disabled} onClick={() => setEditing(false)}>돌아가기</Button><Button variant="primary" disabled={disabled || !items.length} onClick={() => void act('edit')}>계획 수정</Button></> : <><Button variant="ghost" disabled={disabled} onClick={() => void act('cancel')}>취소</Button><Button disabled={disabled} onClick={() => { setItems(plan.items.map(({ seat_id, robot_id, priority, task_type }) => ({ seat_id, robot_id, priority, task_type }))); setEditing(true); }}>수정</Button><Button variant="primary" disabled={disabled || !agent.status?.can_approve || !!plan.blockers?.length} onClick={() => void act('approve')}>{pending ? '처리 중' : `${plan.items.length}건 승인·요청`}</Button></> }</footer>}
    {draft && !agent.status?.can_approve && <p className="agent-warning">조회 권한 · 작업 승인 불가</p>}
    {plan.status === 'submitted' && <div className="agent-missions">{missions.isError && <p role="alert">작업 상태를 불러오지 못했습니다.</p>}{(plan.mission_ids ?? []).map((id, i) => <Link key={id} to={`/missions?mission=${encodeURIComponent(id)}&site=${encodeURIComponent(auth?.site?.site_id ?? '')}`}>{plan.items[i]?.label}번 좌석 {missions.data?.[i] ? <MissionStatusBadge mission={missions.data[i]} /> : <span>상태 조회 중</span>} <span aria-hidden="true">↗</span></Link>)}</div>}
  </section>;
}
export function AgentPanel() {
  const agent = useAgent();
  const auth = useAuthOptional();
  const { seats } = useOperations();
  const { isDemo, setDemoMode } = useDemoMode();
  const feed = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  useEffect(() => { if (agent.open) textarea.current?.focus(); }, [agent.open]);
  useEffect(() => { if (nearBottom.current && feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [agent.detail, agent.progress, agent.open]);
  useEffect(() => {
    if (!agent.open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('[data-state="open"][role="dialog"]')) { agent.setOpen(false); document.querySelector<HTMLButtonElement>('.agent-trigger')?.focus(); } };
    document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape);
  }, [agent.open, agent.setOpen]);
  if (!agent.open) return null;
  const chip = (key: string, label: string) => <button type="button" className="agent-context-chip" key={key} onClick={() => agent.setRemoved(old => [...old, key])} aria-label={`${label} 컨텍스트 제거`}>{label}<span aria-hidden="true">×</span></button>;
  return <aside id="cleany-agent" className={'agent-panel' + (agent.expanded ? ' is-expanded' : '')} aria-label="Cleany AI 운영 도우미" style={{ '--agent-width': `${Math.max(360, Math.min(800, agent.width))}px` } as CSSProperties}>
    {!agent.expanded && <div className="agent-resize" role="separator" tabIndex={0} aria-label="AI 패널 너비" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={800} aria-valuenow={agent.width}
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const width = Math.max(360, Math.min(800, agent.width + (e.key === 'ArrowLeft' ? 24 : -24))); agent.setWidth(width); localStorage.setItem('cleany:agent-width', String(width)); } }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) agent.setWidth(Math.max(360, Math.min(800, window.innerWidth - e.clientX))); }}
      onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); localStorage.setItem('cleany:agent-width', String(agent.width)); }} />}
    <header className="agent-heading"><div><AgentIcon /><div><h2>Cleany AI</h2><span>운영 도우미</span></div></div><div><Button size="icon-compact" variant="ghost" aria-label="새 대화" disabled={agent.busy} onClick={() => void agent.selectConversation('')}>＋</Button><Button size="icon-compact" variant="ghost" aria-label={agent.expanded ? 'AI 패널 축소' : 'AI 전체 화면'} onClick={() => agent.setExpanded(!agent.expanded)}>{agent.expanded ? '↙' : '⤢'}</Button><Button size="icon-compact" variant="ghost" aria-label="AI 닫기" onClick={() => { agent.setOpen(false); document.querySelector<HTMLButtonElement>('.agent-trigger')?.focus(); }}>×</Button></div></header>
    <div className="agent-history"><NativeSelect aria-label="대화 기록" disabled={agent.busy} value={agent.detail?.conversation_id ?? ''} onChange={e => void agent.selectConversation(e.target.value)}><option value="">새 대화</option>{agent.conversations.map(c => <option key={c.conversation_id} value={c.conversation_id}>{c.title}</option>)}{agent.detail && !agent.conversations.some(c => c.conversation_id === agent.detail?.conversation_id) && <option value={agent.detail.conversation_id}>{agent.detail.title}</option>}</NativeSelect><StatusBadge>{agent.status?.execution_mode === 'mock' ? 'Mock 실행' : '운영 데이터'}</StatusBadge></div>
    <div className="agent-feed" ref={feed} onScroll={() => { const el = feed.current; nearBottom.current = !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 100; }} aria-busy={agent.busy}>
      {!agent.detail?.messages.length && <div className="agent-welcome"><span className="agent-welcome-mark"><AgentIcon /></span><h3>운영에 필요한 정보를<br />한곳에서 확인하세요.</h3><p>기록 조회부터 작업 요청까지</p><div>{(suggestions[agent.context.page ?? '/'] ?? suggestions['/']).map(text => <Button key={text} disabled={agent.busy || isDemo || !agent.status?.configured} onClick={() => void agent.send(text)}>{text}<span aria-hidden="true">↗</span></Button>)}</div></div>}
      {agent.detail?.messages.map(message => <article className={`agent-message is-${message.role}`} key={message.message_id} aria-label={message.role === 'user' ? '내 질문' : 'AI 답변'}>
        <span className="agent-speaker">{message.role === 'user' ? '나' : 'Cleany AI'}</span>{message.content && <div className="agent-message-text">{message.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part)}</div>}
        {message.cards?.map(card => <AgentResultCard key={card.kind === 'mission_progress' ? card.mission_id : card.kind} card={card} />)}
        {message.summaries?.map((summary, i) => <div className="agent-summary" key={i}><strong>{summary.title}</strong><dl>{summary.metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl></div>)}
        {message.plan_ids?.map(id => { const plan = agent.detail?.plans.find(p => p.plan_id === id); return plan && <PlanCard key={id} plan={plan} />; })}
        {!!message.citations?.length && <details className="agent-sources"><summary>근거 {message.citations.length}</summary><div>{message.citations.map(c => <Link key={c.href} to={c.href}>{c.label}<span aria-hidden="true">↗</span></Link>)}</div></details>}
        {message.error && <p className="agent-error">{message.error}</p>}
      </article>)}
      {agent.busy && <div className="agent-progress" role="status"><i className="agent-live-dot" />{agent.progress || '답변 작성 중'}</div>}
    </div>
    <div className="sr-only" aria-live="polite">{!agent.busy && agent.detail?.messages.at(-1)?.role === "assistant" ? "AI 답변이 도착했습니다." : ""}</div>
    <div className="agent-compose">
      <div className="agent-context" aria-label="AI에 전달할 컨텍스트"><span className="agent-context-site">{auth?.site?.display_name ?? '현재 지점'}</span>{!agent.removed.includes('page') && chip('page', pages[agent.context.page ?? '/'])}{agent.context.seat_ids?.map(id => chip(id, `${seats.find(s => s.seat_id === id)?.zone_id?.toUpperCase() ?? ''} ${seats.find(s => s.seat_id === id)?.label ?? id}번`))}{agent.context.mission_id && chip('mission', '선택한 작업')}{agent.context.robot_id && chip('robot', agent.context.robot_id)}{agent.context.day && chip('day', agent.context.day)}</div>
      {agent.error && <p className="agent-error" role="alert">{agent.error}</p>}
      {isDemo ? <div className="agent-warning">예시 데이터 화면<Button size="compact" onClick={() => setDemoMode(false)}>실제 데이터로 전환</Button></div> : agent.status && !agent.status.configured && <p className="agent-warning">AI 연결 설정이 필요합니다.</p>}
      <form onSubmit={e => { e.preventDefault(); nearBottom.current = true; void agent.send(); }}><textarea ref={textarea} aria-label="AI에게 요청" placeholder="질문하거나 작업을 요청하세요" rows={2} maxLength={4000} disabled={isDemo || !agent.status?.configured} value={agent.draft} onChange={e => agent.setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!agent.busy) { nearBottom.current = true; void agent.send(); } } }} /><div><span>작업은 승인 후 요청됩니다.</span>{agent.busy ? <Button type="button" onClick={agent.stop}>응답 중단</Button> : <Button type="submit" variant="primary" disabled={!agent.draft.trim() || isDemo || !agent.status?.configured}>보내기 ↑</Button>}</div></form>
    </div>
  </aside>;
}
