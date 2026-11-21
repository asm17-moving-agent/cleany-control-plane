import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useDemoMode } from '../../operations/DemoModeContext';
import { agentApi, type AgentContext as Context, type AgentConversation, type AgentDetail, type AgentPlan, type AgentStatus } from './api';

function useAgentState() {
  const location = useLocation();
  const { isDemo } = useDemoMode();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(() => Number(localStorage.getItem('cleany:agent-width')) || 460);
  const [selection, setSelection] = useState<Partial<Context>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const controller = useRef<AbortController | null>(null);
  const initialized = useRef(false);
  const selectionEpoch = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const publish = useCallback((next: Partial<Context>) => { setSelection(next); setRemoved([]); }, []);
  const page = (['/', '/map', '/map/edit', '/missions', '/robots', '/settings'].includes(location.pathname) ? location.pathname : '/') as Context['page'];
  const context: Context = useMemo(() => ({ page: removed.includes('page') ? null : page, demo: isDemo,
    ...selection, seat_ids: (selection.seat_ids ?? []).filter(id => !removed.includes(id)),
    mission_id: removed.includes('mission') ? null : selection.mission_id,
    robot_id: removed.includes('robot') ? null : selection.robot_id,
    day: removed.includes('day') ? null : selection.day,
  }), [page, isDemo, selection, removed]);
  useEffect(() => { setRemoved([]); }, [page]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const epoch = selectionEpoch.current;
    void Promise.all([agentApi.status(), agentApi.list()]).then(async ([next, history]) => {
      if (cancelled) return;
      setStatus(next); setConversations(history.items); setError('');
      if (!initialized.current && epoch === selectionEpoch.current) {
        if (history.items[0]) {
          const previous = await agentApi.detail(history.items[0].conversation_id);
          if (!cancelled && epoch === selectionEpoch.current) { setDetail(previous); initialized.current = true; }
        }
      }
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [open]);
  const refresh = useCallback(async (id: string) => {
    const epoch = selectionEpoch.current;
    const [next, history] = await Promise.all([agentApi.detail(id), agentApi.list()]);
    if (alive.current && epoch === selectionEpoch.current) { setDetail(next); setConversations(history.items); }
  }, []);
  const updatePlan = useCallback((plan: AgentPlan) => setDetail(old => old ? ({ ...old, plans: [...old.plans.filter(p => p.plan_id !== plan.plan_id), plan] }) : old), []);
  async function send(text = draft, selectedSeats?: string[]) {
    if (!text.trim() || busy || isDemo) return;
    selectionEpoch.current += 1; initialized.current = true;
    setError(''); setBusy(true); setProgress('응답 준비'); setDraft('');
    const requestContext = selectedSeats ? { ...context, seat_ids: selectedSeats, mission_id: null } : context;
    const abort = new AbortController(); controller.current = abort;
    let id = detail?.conversation_id;
    try {
      let current = detail;
      if (!current) { const created = await agentApi.create(); current = { ...created, messages: [], plans: [] }; id = created.conversation_id; }
      if (abort.signal.aborted) return;
      setDetail({ ...current, messages: [...current.messages, { message_id: crypto.randomUUID(), role: 'user', content: text.trim(), status: 'complete', context: requestContext, created_at: new Date().toISOString(), citations: [], summaries: [], plan_ids: [] }] });
      await agentApi.send(current.conversation_id, text.trim(), requestContext, abort.signal, event => {
        if (event.type === 'started' && event.message) setDetail(old => old && ({ ...old, messages: [...old.messages, event.message!] }));
        if (event.type === 'delta') { setProgress(''); setDetail(old => old && ({ ...old, messages: old.messages.map((m, i) => i === old.messages.length - 1 && m.role === 'assistant' ? { ...m, content: m.content + event.text } : m) })); }
        if (event.type === 'tool') setProgress(event.text ?? '조회 중');
        if (event.type === 'plan' && event.plan) updatePlan(event.plan);
        if (event.type === 'complete' && event.message) setDetail(old => old && ({ ...old, messages: old.messages.map(m => m.message_id === event.message!.message_id ? event.message! : m) }));
        if (event.type === 'error') setError(event.text ?? '응답 오류');
      });
    } catch (e) {
      if (alive.current) setError(abort.signal.aborted ? '응답을 중단했습니다.' : (e as Error).message);
    } finally {
      if (alive.current) {
        setBusy(false); setProgress('');
        if (id) { try { await refresh(id); } catch { /* Preserve transcript when reconnect fails. */ } }
      }
      controller.current = null;
    }
  }
  async function selectConversation(id: string) {
    if (busy) return;
    selectionEpoch.current += 1; initialized.current = true;
    setError('');
    if (!id) { initialized.current = true; setDetail(null); setDraft(''); return; }
    try { await refresh(id); } catch (e) { setError((e as Error).message); }
  }
  return { open, setOpen, expanded, setExpanded, width, setWidth, publish, removed, setRemoved, context, status, conversations, detail, busy, progress, error, setError, draft, setDraft, send, selectConversation, updatePlan, refresh, stop: () => controller.current?.abort() };
}
const AgentState = createContext<ReturnType<typeof useAgentState> | null>(null);
export function AgentProvider({ children }: { children: ReactNode }) { const value = useAgentState(); return <AgentState.Provider value={value}>{children}</AgentState.Provider>; }
export function useAgent() { const value = useContext(AgentState); if (!value) throw new Error('AgentProvider missing'); return value; }
/** Page selection stays live until the operator explicitly removes that context. */
export function useAgentPageContext(context: Partial<Context>) {
  const agent = useContext(AgentState);
  const publish = agent?.publish;
  const serialized = JSON.stringify(context);
  useEffect(() => { publish?.(JSON.parse(serialized) as Partial<Context>); return () => publish?.({}); }, [publish, serialized]);
}
