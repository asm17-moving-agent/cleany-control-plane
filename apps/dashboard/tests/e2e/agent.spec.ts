import { expect, test } from '@playwright/test';
const panel = (page: import('@playwright/test').Page) => page.getByRole('complementary', { name: 'Cleany AI 운영 도우미' });
test.beforeEach(async ({ page }) => {
  await page.goto('/map');
  await page.getByLabel('아이디', { exact: true }).fill('e2e-operator');
  await page.getByLabel('비밀번호', { exact: true }).fill('e2e-operator-password-2026');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.locator('.facility-map-seat').first()).toBeVisible();
});

test('selected seat → editable plan → explicit approval → mock execution; history survives navigation and reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.locator('.facility-map-seat[data-seat-id="seat-18"]').click();
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  const ai = panel(page);
  await expect(ai.getByRole('button', { name: 'D-HUB 18번 컨텍스트 제거' })).toBeVisible();
  await ai.getByRole('button', { name: '새 대화', exact: true }).click();
  const count = await page.request.get('/api/missions?site_id=BUSAN_SOMA_18F').then(r => r.json()).then(r => r.items.length);
  await ai.getByRole('textbox', { name: 'AI에게 요청' }).fill('여기 정리해 줘');
  await ai.getByRole('button', { name: '보내기' }).click();
  await expect(ai.getByRole('button', { name: '1건 승인·요청' })).toBeEnabled();
  expect(await page.request.get('/api/missions?site_id=BUSAN_SOMA_18F').then(r => r.json()).then(r => r.items.length)).toBe(count);
  await ai.getByRole('button', { name: '수정', exact: true }).click();
  await ai.getByRole('combobox', { name: '18 우선순위' }).selectOption('HIGH');
  await ai.getByRole('button', { name: '계획 수정', exact: true }).click();
  await expect(ai.locator('.agent-plan-targets')).toContainText('높음');
  await page.screenshot({ path: '/tmp/cleany-ai-agent-20261117/plan-desktop.png' });
  await ai.getByRole('button', { name: '1건 승인·요청' }).click();
  await expect(ai.getByText('작업 등록됨', { exact: true })).toBeVisible();
  await expect(ai.locator('.agent-missions')).toContainText('완료', { timeout: 15000 });
  await ai.locator('.agent-missions a').click();
  await expect(page).toHaveURL(/missions\?mission=/);
  await expect(ai).toBeVisible();
  await expect(ai.getByRole('button', { name: '선택한 작업 컨텍스트 제거' })).toBeVisible();
  await ai.getByRole('button', { name: 'AI 닫기' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  await expect(ai.getByText('작업 등록됨', { exact: true })).toBeVisible();
  await ai.getByRole('textbox', { name: 'AI에게 요청' }).fill('이 작업 진행 상태를 보여줘');
  await ai.getByRole('button', { name: '보내기' }).click();
  const card = ai.getByRole('region', { name: '작업 진행 카드' });
  await expect(card.getByRole('group', { name: '작업 진행 상황' })).toContainText('완료');
  const missionId = new URL(page.url()).searchParams.get('mission');
  const refreshed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/missions/' + missionId && r.request().method() === 'GET');
  await card.getByRole('button', { name: '최신 상태 확인' }).click();
  expect((await refreshed).status()).toBe(200);
  await card.getByRole('link', { name: /작업 상세 열기/ }).click();
  await expect(ai).toBeHidden();
  expect(new URL(page.url()).searchParams.get('mission')).toBe(missionId);
  expect(errors).toEqual([]);
});

test('comparison card survives reload and opens the chosen day', async ({ page }) => {
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  const ai = panel(page);
  await ai.getByRole('button', { name: '새 대화', exact: true }).click();
  await ai.getByRole('textbox', { name: 'AI에게 요청' }).fill('어제와 오늘 작업 기록 비교');
  await ai.getByRole('button', { name: '보내기' }).click();
  const table = ai.getByRole('region', { name: '날짜별 작업 비교' }).getByRole('table');
  await expect(table.getByRole('rowheader')).toHaveCount(5);
  await page.reload();
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  await expect(table.getByRole('link')).toHaveCount(2);
  const earlier = table.getByRole('link').first();
  const destination = await earlier.getAttribute('href');
  await earlier.click();
  await expect(page).toHaveURL(url => url.pathname + url.search === destination);
  await expect(ai).toBeHidden();
});

test('context removal, resizing, fullscreen, cancellation, errors and scoped conversations', async ({ page }) => {
  await page.locator('.facility-map-seat[data-seat-id="seat-20"]').click();
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  const ai = panel(page);
  await ai.getByRole('button', { name: 'D-HUB 20번 컨텍스트 제거' }).click();
  await expect(ai.getByRole('button', { name: 'D-HUB 20번 컨텍스트 제거' })).toHaveCount(0);
  const handle = ai.getByRole('separator');
  const width = await ai.evaluate(el => el.getBoundingClientRect().width);
  await handle.focus(); await page.keyboard.press('ArrowLeft');
  expect(await ai.evaluate(el => el.getBoundingClientRect().width)).toBe(width + 24);
  await ai.getByRole('button', { name: 'AI 전체 화면' }).click();
  expect(await ai.evaluate(el => el.getBoundingClientRect().width)).toBe(1440);
  await ai.getByRole('button', { name: '새 대화', exact: true }).click();
  await ai.getByRole('textbox', { name: 'AI에게 요청' }).fill('오늘 완료된 작업?');
  await ai.getByRole('button', { name: '보내기' }).click();
  await expect(ai.locator('.agent-summary')).toBeVisible();
  await page.screenshot({ path: '/tmp/cleany-ai-agent-20261117/summary-expanded.png' });
  await ai.getByRole('button', { name: 'AI 패널 축소' }).click();
  await ai.getByRole('textbox', { name: 'AI에게 요청' }).fill('연결 오류 테스트');
  await ai.getByRole('button', { name: '보내기' }).click();
  await expect(ai.getByRole('alert')).toContainText('연결 시간이 초과');
  await ai.getByRole('textbox', { name: 'AI에게 요청' }).fill('느리게 오늘 작업 확인해 줘');
  await ai.getByRole('button', { name: '보내기' }).click();
  await expect(ai.getByRole('button', { name: '응답 중단' })).toBeVisible();
  await ai.getByRole('button', { name: '응답 중단' }).click();
  await expect(ai.getByRole('button', { name: '보내기' })).toBeVisible();
  await page.getByRole('combobox', { name: '운영 층 선택' }).selectOption('BUSAN_SOMA_19F');
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  await expect(ai.locator('.agent-message')).toHaveCount(0);
});

test('cancelled draft never creates missions; mobile panel and demo commands are blocked', async ({ page }) => {
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  const ai = panel(page);
  await expect(ai.getByRole('combobox', { name: '대화 기록' })).toBeEnabled();
  await ai.getByRole('button', { name: '새 대화', exact: true }).click();
  await ai.getByRole('textbox', { name: 'AI에게 요청' }).fill('D-HUB 18번 정리해 줘');
  await ai.getByRole('button', { name: '보내기' }).click();
  await expect(ai.getByRole('button', { name: '취소', exact: true })).toBeEnabled();
  await ai.getByRole('button', { name: '취소', exact: true }).click();
  await expect(ai.getByText('취소됨', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/cleany-ai-agent-20261117/panel-mobile.png' });
  expect(await ai.evaluate(el => el.getBoundingClientRect().width)).toBe(390);
  await ai.getByRole('button', { name: 'AI 닫기' }).click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '운영 메뉴' }).click();
  await page.getByRole('menuitem', { name: '예시 데이터 보기' }).click();
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  await expect(ai.getByRole('textbox', { name: 'AI에게 요청' })).toBeDisabled();
  await expect(ai.getByRole('button', { name: '실제 데이터로 전환' })).toBeVisible();
});

test('a late history response cannot replace a new conversation', async ({ page }) => {
  const session = await page.request.get('/api/auth/me').then(r => r.json());
  await page.request.post('/api/agent/conversations?site_id=BUSAN_SOMA_18F', { headers: { Origin: 'http://127.0.0.1:18081', 'X-CSRF-Token': session.csrf_token } });
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/agent/conversations/*?*', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(); started(); await blocked;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  await requested;
  const ai = panel(page);
  await ai.getByRole('button', { name: '새 대화', exact: true }).click();
  await ai.getByRole('textbox', { name: 'AI에게 요청' }).fill('새로운 질문 작성 중');
  release();
  await expect(ai.getByRole('combobox', { name: '대화 기록' })).toHaveValue('');
  await expect(ai.locator('.agent-message')).toHaveCount(0);
  await expect(ai.getByRole('textbox', { name: 'AI에게 요청' })).toHaveValue('새로운 질문 작성 중');
});

test('operational views run inline and choosing seats produces only a draft', async ({ page }) => {
  test.setTimeout(75000);
  await page.getByRole('button', { name: 'Cleany AI 열기' }).click();
  const ai = panel(page);
  await ai.getByRole('button', { name: '새 대화', exact: true }).click();
  const turns = [
    ['로봇 상태 요약', '로봇 상태'], ['헤드캠 보여줘', '헤드캠 미리보기'],
    ['밀린 작업 보여줘', '작업 대기열'], ['미검토 작업 목록', '관리자 검토함'],
    ['배터리 그래프', '배터리 추이'], ['장애 복구 타임라인', '장애·복구 타임라인'],
    ['클리니 어디 있어? D-HUB 18번이랑 같이 보여줘', '로봇 위치'],
    ['좌석별 완료 지도', '좌석별 완료 기록'], ['D-HUB 작업 가능 좌석', '작업 가능 좌석'],
  ];
  for (const [question, title] of turns) {
    await ai.getByRole('textbox', { name: 'AI에게 요청' }).fill(question);
    await ai.getByRole('button', { name: '보내기' }).click();
    const card = ai.getByRole('region', { name: title, exact: true });
    await expect(card).toBeVisible();
    if (title === '헤드캠 미리보기') {
      const frames = page.waitForRequest(r => r.url().includes('/camera/head?'));
      await card.getByRole('button', { name: '영상 열기' }).click();
      await frames;
      await card.getByRole('button', { name: '영상 닫기' }).click();
      await expect(card.getByRole('region', { name: '헤드캠', exact: true })).toHaveCount(0);
    }
    if (title === '좌석별 완료 기록') {
      await card.getByRole('button', { name: 'D-HUB 18번', exact: true }).click();
      await expect(card).toContainText(/마지막 완료|완료 기록 없음/);
    }
  }
  const picker = ai.getByRole('region', { name: '작업 가능 좌석', exact: true });
  await page.setViewportSize({width: 390, height: 844});
  await expect(picker.getByRole('button', { name: '0석 정리 초안 만들기' })).toBeDisabled();
  for (const n of [18,20]) await picker.getByRole('button', { name: 'D-HUB ' + n + '번', exact: true }).click();
  const count = async () => (await (await page.request.get('/api/missions?site_id=BUSAN_SOMA_18F')).json()).items.length;
  const before = await count();
  await picker.getByRole('button', { name: '2석 정리 초안 만들기' }).click();
  await expect(ai.getByRole('button', { name: '2건 승인·요청' })).toBeEnabled();
  expect(await count()).toBe(before);
});
