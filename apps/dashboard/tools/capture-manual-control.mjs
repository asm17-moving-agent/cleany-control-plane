/** Validate the real phone HTTP protocol only when its server explicitly reports mock. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [baseURL, destination] = process.argv.slice(2);
const unavailable = process.argv[4] === '--unavailable';
const readOnly = process.argv[4] === '--read-only';
if (!baseURL || !destination) throw new Error('Provide isolated review URL and output directory');
await mkdir(destination, {recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:1080},locale:'ko-KR'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(baseURL);
  await page.getByLabel('아이디',{exact:true}).fill('e2e-operator');
  await page.getByLabel('비밀번호',{exact:true}).fill('e2e-operator-password-2026');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'운영 층 선택'})).toBeVisible();
  const url=baseURL+'/api/robots/cleany-01/manual/';
  const scope='?site_id=BUSAN_SOMA_18F';
  const status=async()=>await (await page.request.get(url+'status'+scope)).json();
  const before=await status();
  if (unavailable) expect(before.available).toBe(false);
  else {
    expect(before.mock,'refuse any real-hardware exercise').toBe(true);
    expect(before.ready).toBe(true);
  }
  await page.getByRole('link',{name:'로봇',exact:true}).click();
  const panel=page.getByRole('region',{name:'수동 조종',exact:true});
  const button=panel.getByRole('application',{name:'이동 조이스틱',exact:true});
  if (unavailable) await expect(button).toHaveAttribute('aria-disabled','true');
  else await expect(button).toHaveAttribute('aria-disabled','false');
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({path:resolve(destination,unavailable ? 'jetson-manual-unavailable.png' : 'jetson-manual-panel.png')});
  if (!unavailable && !readOnly) {
  const box=(await button.boundingBox());
  await page.mouse.move(box.x+box.width/2,box.y+box.height*.2);await page.mouse.down();
  await expect.poll(async()=>(await status()).phase).toBe('moving');
  await page.mouse.up();
  await expect.poll(async()=>(await status()).stop_confirmed).toBe(true);
  await expect.poll(async()=>(await status()).phase).toBe('idle');
  const session=await (await page.request.get(baseURL+'/api/auth/me')).json();
  const headers={Origin:baseURL,'X-CSRF-Token':session.csrf_token};
  const client=crypto.randomUUID();
  const send=(sequence,action)=>page.request.post(url+'control'+scope,{headers,data:{client,sequence,action,vector:[.5,0,.2],speed:.5}});
  expect((await send(1,'press')).status()).toBe(200);
  // Deliberately omit further heartbeats: only the --mock controller is exercised.
  await page.waitForTimeout(400);
  await expect.poll(async()=>(await status()).stop_confirmed).toBe(true);
  expect((await status()).enabled).toBe(false);
  expect((await send(4,'stop')).status()).toBe(200);
  expect((await send(3,'press')).status()).toBe(409);
  await expect.poll(async()=>(await status()).phase).toBe('idle');
  expect(errors).toEqual([]);
  await writeFile(resolve(destination,'validation.json'),JSON.stringify({backend:baseURL,phoneServerMock:true,
    holdAndRelease:true,leaseExpiry:true,stalePressRejected:true,errors,physicalMotion:false,after:await status()},null,2));
  console.log('Phone --mock integration: hold/release, lease expiry, stale press rejection passed; no hardware.');
  } else {
    expect(errors).toEqual([]);
    console.log(unavailable ? 'Controller unavailable: inputs disabled; no commands sent.' : 'Mock controller ready: screenshot captured; no commands sent.');
  }
} finally {await browser.close();}
