/** Caption existing browser evidence without modifying the captured UI. */
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [destination, captures, comparison] = process.argv.slice(2);
if (!comparison) throw new Error('Provide output, Jetson capture, and comparison capture directories.');
const embed = async path => `data:image/png;base64,${(await readFile(path)).toString('base64')}`;
await mkdir(destination, { recursive: true });
const dashboard = await embed(resolve(captures, 'jetson-dashboard.png'));
const editor = await embed(resolve(captures, 'jetson-seat-editor.png'));
const legacy = await embed(resolve(comparison, 'legacy-40px-per-meter.png'));
const current = await embed(resolve(comparison, 'corrected-40px-per-meter.png'));
const panels = [
  ['01-dashboard', 'SLAM 지도와 82개 좌석', 'Jetson 배포 파일 · 격리 검증 DB · 2026-11-13',
    `<img class="full" src="${dashboard}">`, '지도 SVG 외곽선 제거 · SLAM 원본 22% 중첩 · 실물 주행 검증 미수행'],
  ['02-comparison', '기존 대시보드와 SLAM 배치 비교', '노트북 브라우저 검증 · 두 화면 모두 40 px/m · 2026-11-13',
    `<div class="columns"><section><h2>기존 도면의 D-HUB</h2><img src="${legacy}"></section><section><h2>현재 SLAM 지도의 D-HUB</h2><img src="${current}"></section></div><h2>현재 배치의 벽면 접촉부 확대</h2><div class="details"><div class="crop"><img src="${current}" style="left:0"></div><div class="crop"><img src="${current}" style="right:0"></div></div>`,
    '책상 1.20 × 0.77 m 유지 · 좌우 6개 묶음의 외곽 변을 보존된 벽선 좌표에 정렬 · 현장 실측 확인 전'],
  ['03-seat-editor', '좌석 위치와 로봇 접근 좌표', 'Jetson 배포 파일 · 격리 검증 DB의 배치 v3 · 2026-11-13',
    `<img class="full" src="${editor}">`, 'seat-01 선택 · 접근 위치 및 방향 표시 · 현장 검증 대기 · 로봇 이동 명령 미전송'],
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1520, height: 1200 }, deviceScaleFactor: 1 });
  for (const [name, title, provenance, body, caption] of panels) {
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:40px;background:#f8faf9;color:#203d34;font-family:system-ui,sans-serif}h1{margin:0 0 10px;font-size:30px}p{margin:0 0 24px;font-size:18px;color:#52695f}img{display:block}.full{width:1440px;border:1px solid #d9e2dd;box-sizing:border-box}.columns{display:flex;gap:70px;justify-content:center}h2{font-size:21px;margin:20px 0 12px}.details{display:flex;gap:40px}.crop{position:relative;overflow:hidden;width:340px;height:250px;border:1px solid #d9e2dd}.crop img{position:absolute;top:-105px;width:1235px}footer{font-size:18px;margin-top:24px;line-height:1.6}</style><h1>${title}</h1><p>${provenance}</p>${body}<footer>${caption}</footer>`;
    await writeFile(resolve(destination, `${name}.html`), html);
    await page.setContent(html);
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    await page.screenshot({ path: resolve(destination, `${name}.png`), fullPage: true });
  }
} finally { await browser.close(); }
