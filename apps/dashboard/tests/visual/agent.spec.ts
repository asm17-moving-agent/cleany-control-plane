import { expect, test } from '@playwright/test';
import { capture, fixture } from './fixture';
const plan = { plan_id: 'visual-plan', conversation_id: 'visual-chat', revision: 1, status: 'draft', title: 'D-HUB 좌석 정리', reason: '선택한 두 좌석 정리', items: [18, 20].map(n => ({ seat_id: `seat-${n}`, label: String(n), zone_id: 'd-hub', priority: 'HIGH', robot_id: 'cleany-01', task_type: 'SEAT_SERVICE' })), blockers: [], created_at: '2026-11-16T10:00:00Z', expires_at: '2026-11-16T10:15:00Z', mission_ids: [] };
const conversation = { conversation_id: 'visual-chat', title: '선택한 좌석 정리해 줘', created_at: plan.created_at, updated_at: plan.created_at };
test('agent plan and expanded summary use shared controls and fit the viewport', async ({ page }, info) => {
  await fixture(page);
  await page.route('**/api/agent/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) return route.fulfill({ json: { configured: true, provider: 'openai', model: 'gpt-6.1-sol', reasoning_effort: 'low', can_read: true, can_approve: true, max_plan_items: 50, execution_mode: 'mock' } });
    if (path.endsWith('/conversations')) return route.fulfill({ json: { items: [conversation] } });
    return route.fulfill({ json: { ...conversation, plans: [plan], messages: [
      { message_id: 'question', role: 'user', content: '선택한 좌석 정리해 줘', status: 'complete', created_at: plan.created_at, citations: [], summaries: [], plan_ids: [] },
      { message_id: 'answer', role: 'assistant', content: '두 좌석의 정리 계획을 준비했습니다. 계획을 확인하고 승인해 주세요.', status: 'complete', created_at: plan.created_at, citations: [{ kind: 'seats', label: '시설 좌석', href: '/map' }], summaries: [], plan_ids: ['visual-plan'] },
    ] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  const panel = page.getByRole('complementary', { name: 'Cleany AI 운영 도우미' });
  await expect(panel.getByRole('button', { name: '2건 승인·요청' })).toBeVisible();
  await capture(page, info, 'agent-plan');
  await panel.getByRole('button', { name: 'AI 전체 화면' }).click();
  await capture(page, info, 'agent-expanded');
});
