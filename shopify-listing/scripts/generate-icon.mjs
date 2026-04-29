import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const srcSvg = resolve(repoRoot, 'public/logos/blujay-logo.svg');
const outDir = resolve(repoRoot, 'shopify-listing/icons');

await mkdir(outDir, { recursive: true });

const svgBuffer = await readFile(srcSvg);

const BRAND_BLUE = { r: 59, g: 130, b: 246, alpha: 1 };
const DARK_NAVY = { r: 15, g: 23, b: 42, alpha: 1 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function renderLogo(width, recolorToWhite = false) {
  const base = await sharp(svgBuffer, { density: 600 })
    .resize({ width, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (recolorToWhite) {
    const { data, info } = base;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
  }

  return sharp(base.data, { raw: { width: base.info.width, height: base.info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function makeIcon(size, bg, logoWidthPct, filename, recolor = false) {
  const logoWidth = Math.round(size * logoWidthPct);
  const renderedLogo = await renderLogo(logoWidth, recolor);
  const meta = await sharp(renderedLogo).metadata();

  await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([
      {
        input: renderedLogo,
        left: Math.round((size - meta.width) / 2),
        top: Math.round((size - meta.height) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(resolve(outDir, filename));
  console.log(`✓ ${filename} (${size}x${size})`);
}

await makeIcon(1200, WHITE, 0.92, 'icon-1200-white.png');
await makeIcon(1200, BRAND_BLUE, 0.92, 'icon-1200-blue.png', true);
await makeIcon(1200, DARK_NAVY, 0.92, 'icon-1200-navy.png', true);
await makeIcon(512, WHITE, 0.92, 'icon-512-white.png');
await makeIcon(512, BRAND_BLUE, 0.92, 'icon-512-blue.png', true);

await sharp(svgBuffer, { density: 600 })
  .resize({ width: 2048, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(resolve(outDir, 'logo-wide-2048.png'));
console.log('✓ logo-wide-2048.png (transparent)');
