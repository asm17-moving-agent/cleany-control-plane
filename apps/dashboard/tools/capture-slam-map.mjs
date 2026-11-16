/** Read-only browser review; credentials come from env, not stored artifacts. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const [baseURL, destination, siteId] = process.argv.slice(2);
if (!baseURL || !destination || !siteId || !process.env.CLEANY_REVIEW_LOGIN || !process.env.CLEANY_REVIEW_PASSWORD) {
  throw new Error('Provide URL, output directory, site ID and CLEANY_REVIEW_LOGIN / CLEANY_REVIEW_PASSWORD.');
}
await mkdir(destination, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, locale: 'ko-KR' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.getByLabel('아이디', { exact: true }).fill(process.env.CLEANY_REVIEW_LOGIN);
  await page.getByLabel('비밀번호', { exact: true }).fill(process.env.CLEANY_REVIEW_PASSWORD);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('combobox', { name: '운영 층 선택' }).selectOption(siteId);
  const image = page.getByRole('img', { name: '실측 SLAM 기반 운영 지도' });
  await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.slam-seat')).toHaveCount(82);
  await page.screenshot({ path: resolve(destination, 'jetson-dashboard.png') });
  const metadata = await (await page.request.get(`${baseURL}/api/map?site_id=${siteId}`)).json();
  const asset = await page.request.get(`${baseURL}/api/map/presentation?site_id=${siteId}`);
  expect(asset.status()).toBe(200);
  const canvas = page.locator('.slam-map-shell .facility-plan-canvas');
  const style = await canvas.getAttribute('style');
  await page.getByRole('button', { name: 'SLAM 원본', exact: true }).click();
  const original = page.getByRole('img', { name: 'SLAM으로 작성한 실측 점유 지도' });
  await expect.poll(() => original.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
  expect(await canvas.getAttribute('style')).toBe(style);
  await page.screenshot({ path: resolve(destination, 'jetson-original.png') });
  await page.getByRole('button', { name: '운영 지도', exact: true }).click();
  await page.getByRole('button', { name: '지도 확대', exact: true }).click();
  expect(await canvas.getAttribute('style')).not.toBe(style);
  await page.screenshot({ path: resolve(destination, 'jetson-zoom.png') });
  await page.getByRole('button', { name: '전체 보기', exact: true }).click();
  await expect(canvas).toHaveAttribute('style', style);
  await page.getByRole('button', { name: '좌석 배치 편집', exact: true }).click();
  await page.getByLabel('좌석 선택', { exact: true }).selectOption('seat-01');
  await page.locator('.seat-layout-editor').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: resolve(destination, 'jetson-seat-editor.png') });
  const review = await (await page.request.get(`${baseURL}/api/seat-layout?site_id=${siteId}`)).json();
  const targets = await (await page.request.get(`${baseURL}/api/seat-layout/targets?site_id=${siteId}`)).json();
  expect(targets.validation_status).toBe('draft');
  expect(review.layout.seats).toHaveLength(82);
  await writeFile(resolve(destination, 'seat-layout-review.json'), JSON.stringify(review, null, 2));
  await writeFile(resolve(destination, 'targets-draft.json'), JSON.stringify(targets, null, 2));
  expect(errors).toEqual([]);
  const result = { baseURL, siteId, mapId: metadata.map_id, presentation: metadata.presentation,
    servedSvgSha256: createHash('sha256').update(await asset.body()).digest('hex'), errors };
  await writeFile(resolve(destination, 'jetson-browser-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ mapId: result.mapId, servedSvgSha256: result.servedSvgSha256, errors }));
} finally { await browser.close(); }
