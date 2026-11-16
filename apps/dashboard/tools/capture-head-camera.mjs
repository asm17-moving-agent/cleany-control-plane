/** Read-only capture of an isolated dashboard with a real camera source. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [baseURL, destination] = process.argv.slice(2);
await mkdir(destination, {recursive:true});
const browser = await chromium.launch();
try {
 const page = await browser.newPage({viewport:{width:1440,height:1080},locale:'ko-KR'});
 let frames = 0;
 page.on('response', r => { if (r.url().includes('/camera/head?') && r.status()===200) frames++; });
 await page.goto(baseURL);
 await page.getByLabel('아이디',{exact:true}).fill('e2e-operator');
 await page.getByLabel('비밀번호',{exact:true}).fill('e2e-operator-password-2026');
 await page.getByRole('button',{name:'로그인',exact:true}).click();
 await page.getByRole('link',{name:'로봇',exact:true}).click();
 const panel=page.getByRole('region',{name:'수동 조종',exact:true});
 await expect(page.getByRole('img',{name:'로봇 헤드캠 실시간 영상'})).toBeVisible({timeout:20000});
 await expect.poll(()=>frames).toBeGreaterThan(2);
 await panel.screenshot({path:resolve(destination,'head-camera-controls.png')});
 await writeFile(resolve(destination,'browser.json'),JSON.stringify({frames,liveCamera:true,motionCommands:false},null,2));
 console.log(JSON.stringify({frames,liveCamera:true,motionCommands:false}));
} finally { await browser.close(); }
