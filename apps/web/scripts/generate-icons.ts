// Renders the PWA PNG icons from public/icons/icon.svg with Playwright's Chromium.
// Run once after changing the SVG:  node apps/web/scripts/generate-icons.ts
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const iconsDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = await readFile(`${iconsDir}icon.svg`, 'utf8');
const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const targets = [
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  // Maskable icons keep the artwork inside the central 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.1 },
];

const browser = await chromium.launch();
try {
  for (const { file, size, inset } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const pad = Math.round(size * inset);
    await page.setContent(
      `<body style="margin:0;background:#1E3A5F"><img src="${svgDataUrl}" style="display:block;width:${size - 2 * pad}px;height:${size - 2 * pad}px;margin:${pad}px"></body>`,
    );
    await page.screenshot({ path: `${iconsDir}${file}`, omitBackground: false });
    await page.close();
  }
} finally {
  await browser.close();
}
