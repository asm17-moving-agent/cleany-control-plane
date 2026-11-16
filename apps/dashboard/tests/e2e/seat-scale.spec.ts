import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const geometry = JSON.parse(readFileSync(new URL('../../src/features/facility-map/seat-geometry.json', import.meta.url), 'utf8'));

test('SLAM furniture preserves legacy metric dimensions and aspect ratios', async ({ page }, testInfo) => {
  execFileSync('uv', ['run', '--project', '../backend', 'python', '-m', 'control_plane.admin', '--database', process.env.CLEANY_E2E_DATABASE!, 'site-set-map', 'BUSAN_SOMA_19F', 'slam-20261108']);
  await page.goto('/map');
  await page.getByLabel('아이디', { exact: true }).fill('e2e-operator');
  await page.getByLabel('비밀번호', { exact: true }).fill('e2e-operator-password-2026');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.locator('.facility-map-seat')).toHaveCount(82);
  await page.screenshot({ path: testInfo.outputPath('legacy-dashboard.png') });
  const legacy = await page.locator('.facility-map-seat[data-seat-id="seat-01"]').evaluate(el => ({ w: parseFloat(el.style.width), h: parseFloat(el.style.height) }));
  const room = await page.locator('.facility-map-seat[data-seat-id="seat-m1-01"]').evaluate(el => ({ w: parseFloat(el.style.width), h: parseFloat(el.style.height) }));
  // Render both complete scenes at exactly 40 screen pixels per meter, not independent fit scales.
  const legacyScale = 40 / (geometry.reference_room_width_units / geometry.reference_room_width_m);
  await page.locator('.facility-plan-canvas').evaluate((el, scale) => { el.style.transform = `translate(10px, 10px) scale(${scale})`; }, legacyScale);
  const oldBox = (await page.locator('.facility-plan-canvas').boundingBox())!;
  await page.screenshot({ path: testInfo.outputPath('legacy-40px-per-meter.png'), clip: { x: oldBox.x + 576 * legacyScale, y: oldBox.y + 8 * legacyScale, width: 400 * legacyScale, height: 357 * legacyScale } });
  await page.getByRole('combobox', { name: '운영 층 선택' }).selectOption('BUSAN_SOMA_19F');
  await expect(page.locator('.slam-seat')).toHaveCount(82);
  const metadata = await (await page.request.get('/api/map?site_id=BUSAN_SOMA_19F')).json();
  const layout = (await (await page.request.get('/api/seat-layout?site_id=BUSAN_SOMA_19F')).json()).layout;
  const seat = layout.seats.find((s: { seat_id: string }) => s.seat_id === 'seat-01');
  const roomSeat = layout.seats.find((s: { seat_id: string }) => s.seat_id === 'seat-m1-01');
  const unit = geometry.reference_room_width_units / geometry.reference_room_width_m;
  expect(seat.width).toBeCloseTo(legacy.w / unit, 5);
  expect(seat.depth).toBeCloseTo(legacy.h / unit, 5);
  expect(roomSeat.width).toBeCloseTo(room.w / unit, 5);
  expect(roomSeat.depth).toBeCloseTo(room.h / unit, 5);
  const rect = page.locator('.slam-seat[data-seat-id="seat-01"] .slam-desk');
  expect(Number(await rect.getAttribute('height')) * metadata.resolution).toBeCloseTo(1.2, 6);
  expect(Number(await rect.getAttribute('width')) * metadata.resolution).toBeCloseTo(.77, 6);
  await page.screenshot({ path: testInfo.outputPath('corrected-dashboard.png') });
  await page.locator('.facility-plan-canvas').evaluate((el, scale) => { el.style.transform = `translate(10px, 10px) scale(${scale})`; }, 40 * metadata.resolution);
  const newBox = (await page.locator('.facility-plan-canvas').boundingBox())!;
  await page.screenshot({ path: testInfo.outputPath('corrected-40px-per-meter.png'), clip: { x: newBox.x + 371 * 2, y: newBox.y + 30 * 2, width: 247 * 2, height: 247 * 2 } });
});
