import { expect, test } from '@playwright/test';
import { fixture } from './fixture';

test('chat shows paired observations and a priority queue in the same card style', async ({ page }) => {
  await fixture(page);
  const at = '2026-11-16T10:00:00Z', site = 'BUSAN_SOMA_18F';
  const conv = { conversation_id: 'visual-views', title: '작업 기록', created_at: at, updated_at: at };
  const profile = { navigation: 'mock', perception: 'mock', planning: 'mock', execution: 'mock' };
  const cards = [
    { kind: 'desk_photos', site_id: site, captured_at: at, mission_id: 'qa-only', seat_id: 'seat-18', profile,
      before: '/api/missions/qa-only/observations/before', after: '/api/missions/qa-only/observations/after' },
    { kind: 'work_queue', site_id: site, captured_at: at, focus_seats: ['seat-20'], start_day: null, end_day: null,
      rows: [{ mission_id: 'test-queue', seat_id: null, label: 'D-HUB 20번', priority: 'HIGH', created_at: at,
        finished_at: null, outcome: null, reason: '', profile }] },
  ];
  await page.route('**/api/missions/qa-only/observations/**', async route => {
    const before = new URL(route.request().url()).pathname.endsWith('/before');
    const source = new URL(before ? '/demo/observations/desk-before.png' : '/demo/observations/desk-after-complete.png', page.url());
    await route.fulfill({ response: await route.fetch({url: source.href}) });
  });
  await page.route('**/api/agent/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) return route.fulfill({json:{configured:true, can_read:true, can_approve:true, provider:'qwen',execution_mode:'mock'}});
    if (path.endsWith('/conversations')) return route.fulfill({json:{items:[conv]}});
    return route.fulfill({json:{...conv,plans:[],messages:[{ message_id:'reply',role:'assistant',status:'complete',created_at:at,
      content:'조회한 작업입니다.',cards,citations:[],summaries:[],plan_ids:[] }]}});
  });
  await page.goto('/map');
  await page.getByRole('button',{name:'Cleany AI 열기'}).click();
  const photos = page.getByRole('region',{name:'작업 전후 사진'});
  await expect(photos.getByRole('img', {name: /관측 사진/})).toHaveCount(2);
  await photos.evaluate(async el => { await document.fonts.ready; await Promise.all(Array.from(el.querySelectorAll('img')).map(img=>img.decode())); });
  await expect(photos).toHaveScreenshot('agent-desk-photos.png');
  await expect(page.getByRole('region',{name:'작업 대기열'})).toHaveScreenshot('agent-work-queue.png');
});
