import type { components } from '../../api/generated/openapi';
import { request, streamRequest } from '../../api/client';
type Schemas = components['schemas'];
export type AgentContext = Schemas['AgentContext'];
export type AgentPlan = Schemas['AgentPlan'];
export type AgentMessage = Schemas['AgentMessage'];
export type AgentConversation = Schemas['AgentConversation'];
export type AgentDetail = Schemas['AgentConversationDetail'];
export type AgentStatus = Schemas['AgentStatus'];
export type AgentEvent = Schemas['AgentStreamEvent'];
const json = (method: string, body?: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
export const agentApi = {
  status: () => request<AgentStatus>('/api/agent/status'),
  list: () => request<Schemas['AgentConversationList']>('/api/agent/conversations'),
  create: () => request<AgentConversation>('/api/agent/conversations', json('POST')),
  detail: (id: string) => request<AgentDetail>(`/api/agent/conversations/${encodeURIComponent(id)}`),
  edit: (plan: AgentPlan, items: Schemas['AgentPlanItem'][]) => request<AgentPlan>(`/api/agent/plans/${plan.plan_id}`, json('PATCH', { revision: plan.revision, items })),
  cancel: (plan: AgentPlan) => request<AgentPlan>(`/api/agent/plans/${plan.plan_id}/cancel`, json('POST', { revision: plan.revision })),
  approve: (plan: AgentPlan) => request<AgentPlan>(`/api/agent/plans/${plan.plan_id}/approve`, json('POST', { revision: plan.revision, approved: true })),
  send: (id: string, content: string, context: AgentContext, signal: AbortSignal, onEvent: (event: AgentEvent) => void) => streamRequest(`/api/agent/conversations/${id}/messages`, { client_message_id: crypto.randomUUID(), content, context }, signal, onEvent),
};
