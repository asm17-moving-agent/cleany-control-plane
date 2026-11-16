/** Overlay the vector tracing on original pixels and sample its wall centre lines. */
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const [mapDirectory, destination] = process.argv.slice(2);
if (!mapDirectory || !destination) throw new Error('Provide map directory and output directory');
const metadata = JSON.parse(await readFile(resolve(mapDirectory, 'metadata.json'), 'utf8'));
const layout = JSON.parse(await readFile(resolve(mapDirectory, 'presentation-layout.json'), 'utf8'));
const svg = await readFile(resolve(mapDirectory, 'presentation.svg'), 'utf8');
const raster = (await readFile(resolve(mapDirectory, 'map.png'))).toString('base64');
const { width, height, transform } = metadata.presentation;
await mkdir(destination, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: width * 2, height: height * 2 } });
  await page.setContent(`<style>
    body { margin:0; background:#e8edea; }
    main { width:${width}px; height:${height}px; transform:scale(2); transform-origin:0 0; overflow:hidden; }
    img,svg { position:absolute; transform:matrix(${transform.join(',')}); transform-origin:0 0; }
    img { image-rendering:pixelated; }
    svg path { fill:none; stroke:#e1334c; stroke-width:0.8; }
    #floor { display:none; }
  </style><main><img src="data:image/png;base64,${raster}" width="${metadata.width}" height="${metadata.height}">${svg}</main>`);
  await page.locator('img').evaluate(image => image.decode());
  await page.screenshot({ path: resolve(destination, 'wall-alignment-overlay.png') });
  const samples = await page.evaluate(ids => ids.map(id => {
    const path = document.getElementById(id);
    const length = path.getTotalLength();
    const points = Array.from({ length: Math.ceil(length) + 1 }, (_, i) => {
      const p = path.getPointAtLength(Math.min(i, length));
      return [p.x, p.y];
    });
    return { id, length, points };
  }), layout.walls.map(wall => wall.id));
  await writeFile(resolve(destination, 'wall-samples.json'), JSON.stringify(samples));
  await page.addStyleTag({ content: 'img { display:none; } svg path { fill:revert-layer; stroke:revert-layer; stroke-width:revert-layer; }' });
  // Remove review-only path rules, leaving the asset's presentation attributes intact.
  await page.locator('style').first().evaluate(style => {
    style.textContent = style.textContent.replace(/svg path \{[^}]+\}/, '').replace(/#floor \{[^}]+\}/, '');
  });
  await page.screenshot({ path: resolve(destination, 'vector-2x.png') });
} finally { await browser.close(); }
