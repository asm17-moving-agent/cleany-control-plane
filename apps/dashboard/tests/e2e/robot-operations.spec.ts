import { expect, test } from './support/auth';

test('manual preview opens directly without controller requests and live mode still checks readiness', async ({page}) => {
  const requests: string[] = [];
  page.on('request', request => {
    if (/\/manual\/(status|control)/.test(request.url())) requests.push(request.url());
  });
  await page.goto('/robots?demo=1&recording=0&mode=manual');
  const panel = page.getByRole('region', {name:'수동 조종', exact:true});
  await expect(panel).toBeVisible();
  await expect(page.locator('.robot-manual-entry')).toHaveCount(0);
  await expect(panel.getByRole('application',{name:'이동 조이스틱'})).toHaveAttribute('aria-disabled','true');
  await page.reload();
  await expect(panel).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole('button',{name:'실제 데이터로 돌아가기',exact:true}).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button',{name:'조종 시작',exact:true})).toBeDisabled();
  await page.getByRole('link',{name:'예시 화면',exact:true}).click();
  await expect(panel).toBeVisible();
  await expect(page.locator('.robot-manual-entry')).toHaveCount(0);
});

test('persisted robot observations reach the UI, stale data stays labelled, and date filters scope history', async ({page}) => {
  await page.goto('/robots');
  await expect(page.getByLabel('배터리', {exact: true})).toContainText('미수신');
  await expect(page.locator('.manual-control')).toHaveCount(0);
  await page.evaluate(async () => {
    const socket = new WebSocket(`ws://${location.host}/api/robots/cleany-01/telemetry/ws`, ['cleany','e2e-robot-token-only-for-tests']);
    (window as unknown as { observationSocket: WebSocket }).observationSocket=socket;
    await new Promise<void>((resolve,reject)=>{ socket.onopen=()=>resolve();socket.onerror=reject; });
    let sequence=0;
    for(const sample of [
      {kind:'battery',percentage:67.0,voltage:24.0,charging:'CHARGING'},
      {kind:'joints',names:['left_gripper_joint'],positions:[.25],ages_seconds:[0]},
      {kind:'joint_targets',names:['left_gripper_joint'],positions:[.8],ages_seconds:[0]},
      {kind:'supervisor_state',epoch:'synthetic',operating_state:'OPERATIONAL'},
      {kind:'supervisor_event',epoch:'synthetic',event_sequence:1,event_kind:'RECOVERY_SUCCEEDED',code:'sensor',severity:'info',detail:'합성 입력 복구'},
    ]) {
      socket.send(JSON.stringify({schema_version:1,boot_id:'e2e-'+Date.now(),sequence:++sequence,source_topic:'/fixture',source_stamp:Date.now()/1000,source_age_seconds:0,provenance:'sim',sample}));
      await new Promise<void>(resolve=>{socket.onmessage=()=>resolve();});
    }
  });
  await expect(page.getByLabel('배터리', {exact: true})).toContainText('67');
  await expect(page.locator('.robot-twin')).toContainText('시뮬레이션');
  await page.getByRole('button',{name:'진단',exact:true}).click();
  const row=page.locator('.robot-diagnostics tr').filter({hasText:'left_gripper_joint'});
  await expect(row).toContainText('0.2500'); await expect(row).toContainText('0.8000');
  await page.evaluate(()=> (window as unknown as { observationSocket: WebSocket }).observationSocket.close());
  await expect(page.getByLabel('배터리', {exact: true})).toContainText('갱신 중단');
  await page.getByRole('button',{name:'관제',exact:true}).click();
  await page.locator('.robot-period').getByRole('button',{name:'새로고침',exact:true}).click();
  await expect(page.locator('.robot-timeline')).toContainText('자동 복구 완료');
  await expect(page.locator('.robot-timeline')).toContainText('충전 시작');
  const today = await page.getByLabel('분석 기준 날짜').inputValue();
  await page.getByLabel('분석 기준 날짜').fill('2020-01-01');
  await expect(page.getByText('배터리 기록 없음',{exact:true})).toBeVisible();
  await expect(page.getByText('운영 이벤트 없음',{exact:true})).toBeVisible();
  await page.getByLabel('분석 기준 날짜').fill(today);
  await page.getByLabel('분석 기간').selectOption('7');
  await expect(page.locator('.robot-timeline')).toContainText('자동 복구 완료');
  await page.goto('/robots?' + new URLSearchParams({robot:'cleany-01',date:today,days:'7',event:'supervisor:synthetic:1'}));
  await expect(page.getByLabel('분석 기준 날짜')).toHaveValue(today);
  await expect(page.getByLabel('분석 기간')).toHaveValue('7');
  await expect(page.locator('.robot-timeline li[aria-current="true"]')).toContainText('자동 복구 완료');
  await page.reload();
  await expect(page.getByLabel('배터리', {exact: true})).toContainText('67');
  await expect(page.getByLabel('배터리', {exact: true})).toContainText('갱신 중단');
});

test('leaving manual mode sends STOP and fresh entry is required', async ({page}) => {
  const commands: {action:string}[]=[];
  const state={configured:true,available:true,connected:true,ready:true,phase:'idle',mock:true,stop_confirmed:true,web_max_velocity:2,velocity:[0,0,0,0]};
  await page.route('**/manual/status?*',route=>route.fulfill({json:state}));
  await page.route('**/manual/control?*',route=>{commands.push(route.request().postDataJSON());return route.fulfill({json:state});});
  await page.goto('/robots');
  await page.getByRole('button',{name:'수동 조종',exact:true}).click();
  await page.getByRole('button',{name:'조종 시작',exact:true}).click();
  const stick=page.getByRole('application',{name:'이동 조이스틱'});
  await expect(stick).toHaveAttribute('aria-disabled','false');
  await stick.focus(); await page.keyboard.down('ArrowUp');
  await expect.poll(()=>commands.at(-1)?.action).toBe('update');
  await page.getByRole('button',{name:'관제',exact:true}).click();
  await expect.poll(()=>commands.at(-1)?.action).toBe('stop');
  await page.keyboard.up('ArrowUp');
  await expect(page.locator('.manual-control')).toHaveCount(0);
  await page.getByRole('button',{name:'수동 조종',exact:true}).click();
  await expect(page.getByRole('button',{name:'조종 시작',exact:true})).toBeVisible();
  await expect(page.locator('.manual-control')).toHaveCount(0);
});
