import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('head camera shows fresh frames, clears lost video, and stops fetching in demo', async ({page}, testInfo) => {
  let requests = 0, online = true;
  await page.route('**/api/robots/cleany-01/camera/head?*', route => {
    requests++;
    return online ? route.fulfill({contentType:'image/jpeg',body:readFileSync('tests/e2e/fixtures/head-camera-test.jpg')}) : route.fulfill({status:503,json:{detail:'offline'}});
  });
  await page.goto('/');
  await page.getByLabel('아이디',{exact:true}).fill('e2e-operator');
  await page.getByLabel('비밀번호',{exact:true}).fill('e2e-operator-password-2026');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.getByRole('link',{name:'로봇',exact:true}).click();
  const panel = page.getByRole('region',{name:'헤드캠',exact:true});
  await expect(panel.getByRole('img')).toBeVisible();
  await expect.poll(()=>requests).toBeGreaterThan(1);
  await page.getByRole('region',{name:'수동 조종',exact:true}).screenshot({path:testInfo.outputPath('head-camera-panel.png')});
  online = false;
  await expect(panel.getByRole('img')).toHaveCount(0);
  await expect(panel.getByText('영상 대기').first()).toBeVisible();
  await page.goto('/robots?demo=1');
  const stopped = requests;
  await page.waitForTimeout(1800);
  expect(requests).toBe(stopped);
  await expect(page.getByRole('img',{name:'로봇 헤드캠 실시간 영상'})).toHaveCount(0);
});
