import { expect, test } from '@playwright/test';

test('manual controls hold, stop on release/blur/navigation, and never transmit in demo', async ({ page }, testInfo) => {
  const commands: { action: string; sequence: number; vector: number[] }[] = [];
  const state = { configured:true,available:true,connected:true,ready:true,phase:'idle',mock:true,
    message:'모의 조종 서버 · 실물 미연결',web_max_velocity:2,stop_confirmed:true,velocity:[0,0,0,0] };
  await page.route('**/api/robots/cleany-01/manual/status?*', route => route.fulfill({json:state}));
  await page.route('**/api/robots/cleany-01/manual/control?*', async route => {
    commands.push(route.request().postDataJSON()); await route.fulfill({json:state});
  });
  await page.goto('/');
  await page.getByLabel('아이디', {exact:true}).fill('e2e-operator');
  await page.getByLabel('비밀번호', {exact:true}).fill('e2e-operator-password-2026');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.getByRole('link',{name:'로봇',exact:true}).click();
  const panel = page.getByRole('region',{name:'수동 조종',exact:true});
  const forward = panel.getByRole('application',{name:'이동 조이스틱',exact:true});
  await expect(forward).toHaveAttribute('aria-disabled', 'false');
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('manual-control.png'),fullPage:true});
  expect(commands).toHaveLength(0);
  const box=(await forward.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height*.2);
  await page.mouse.down();
  await expect.poll(()=>commands.filter(c=>c.action==='update').length).toBeGreaterThan(1);
  expect(commands.at(-1)?.vector[0]).toBeGreaterThan(.8);
  await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);
  await expect.poll(()=>commands.at(-1)?.vector[1] ?? 0).toBeGreaterThan(.6);
  await page.mouse.up();
  await expect.poll(()=>commands.at(-1)?.action).toBe('stop');
  const stopped = commands.length;
  await page.waitForTimeout(300);
  expect(commands).toHaveLength(stopped);
  const turn = panel.getByRole('application',{name:'회전 슬라이더'});
  const turnBox = (await turn.boundingBox())!;
  await page.mouse.move(turnBox.x+turnBox.width*.12,turnBox.y+turnBox.height/2);
  await page.mouse.down();
  await expect.poll(()=>commands.at(-1)?.vector?.[2] ?? 0).toBeGreaterThan(.8);
  await page.mouse.move(turnBox.x+turnBox.width*.88,turnBox.y+turnBox.height/2);
  await expect.poll(()=>commands.at(-1)?.vector?.[2] ?? 0).toBeLessThan(-.8);
  await page.mouse.up();
  await expect.poll(()=>commands.at(-1)?.action).toBe('stop');

  // Synthetic touch pointers exercise concurrent contacts without hardware transport.
  await forward.evaluate(el => { el.setPointerCapture = () => {}; });
  await turn.evaluate(el => { el.setPointerCapture = () => {}; });
  await forward.dispatchEvent('pointerdown',{pointerId:11,pointerType:'touch',button:0,clientX:box.x+box.width/2,clientY:box.y+box.height*.2});
  await turn.dispatchEvent('pointerdown',{pointerId:12,pointerType:'touch',button:0,clientX:turnBox.x+turnBox.width*.12,clientY:turnBox.y+turnBox.height/2});
  await expect.poll(()=>commands.at(-1)?.vector?.[2] ?? 0).toBeGreaterThan(.8);
  expect(commands.at(-1)?.vector[0]).toBeGreaterThan(.8);
  await forward.dispatchEvent('pointerup',{pointerId:11});
  await expect.poll(()=>commands.at(-1)?.vector?.[0]).toBe(0);
  expect(commands.at(-1)?.vector[2]).toBeGreaterThan(.8);
  await turn.dispatchEvent('pointercancel',{pointerId:12});
  await expect.poll(()=>commands.at(-1)?.action).toBe('stop');
  await forward.focus(); await page.keyboard.down('ArrowUp');
  await expect.poll(()=>commands.at(-1)?.action).toBe('update');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect.poll(()=>commands.at(-1)?.action).toBe('stop');
  await page.keyboard.up('ArrowUp');
  await forward.focus(); await page.keyboard.down('ArrowUp');
  await expect.poll(()=>commands.at(-1)?.action).toBe('update');
  await page.getByRole('link',{name:'홈',exact:true}).click();
  await expect.poll(()=>commands.at(-1)?.action).toBe('stop');
  await page.keyboard.up('ArrowUp');
  const beforeDemo=commands.length;
  await page.goto('/robots?demo=1');
  await expect(page.getByRole('application',{name:'이동 조이스틱',exact:true})).toHaveAttribute('aria-disabled', 'true');
  await page.waitForTimeout(300);
  expect(commands).toHaveLength(beforeDemo);
});

test('unavailable controller displays disabled inputs', async ({page},testInfo)=>{
  await page.goto('/');
  await page.getByLabel('아이디',{exact:true}).fill('e2e-operator');
  await page.getByLabel('비밀번호',{exact:true}).fill('e2e-operator-password-2026');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.getByRole('link',{name:'로봇',exact:true}).click();
  const panel=page.getByRole('region',{name:'수동 조종',exact:true});
  await expect(panel.getByText('연결 확인 중')).toHaveCount(0);
  await expect(panel.getByRole('application',{name:'이동 조이스틱',exact:true})).toHaveAttribute('aria-disabled', 'true');
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('manual-unavailable.png'),fullPage:true});
});
