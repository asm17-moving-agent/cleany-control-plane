/** Capture the actual dashboard CAD renderer; run with the local Vite server on 5176. */
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, reducedMotion: 'reduce' });
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: {
      user_id: 'poster', customer_id: 'poster', customer_name: 'Preview', display_name: 'Preview',
      login_id: 'poster', csrf_token: 'fixture', must_change_password: false, expires_at: Date.now() / 1000 + 3600,
    } });
    return route.fulfill({ json: { items: path === '/api/sites'
      ? [{ site_id: 'poster', display_name: 'Preview', map_ref: 'facility-18f' }] : [] } });
  });
  await page.goto('http://127.0.0.1:5176/robot-model?renderStats=1');
  await expect(page.locator('.robot-model-card')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await page.addStyleTag({ content: `html, body, #root, .robot-model-page, .robot-model-card { background: transparent !important; }
    .robot-model-page { padding: 0 !important; }
    .robot-model-page > :not(.robot-model-card) { display: none; }
    .robot-model-card { width: 720px !important; border: none; margin: 0; }
    .robot-model-stage { height: 720px !important; }
    .robot-model-caption, .robot-model-reset, .robot-model-canvas::after { display: none !important; }` });
  await expect(page.locator('.robot-model-canvas canvas')).toHaveJSProperty('width', 720);
  await page.locator('.robot-model-stage').screenshot({
    path: fileURLToPath(new URL('../public/models/cleany-c32c3074-cad-poster.png', import.meta.url)),
    omitBackground: true,
  });
  console.log(await page.locator('.robot-model-canvas').evaluate(el => ({ ...el.dataset })));
} finally { await browser.close(); }
