/**
 * Rasterise the app icons.
 *
 * A web app manifest needs PNGs — the SVG icon covers browser tabs, but
 * Android's installer and iOS's home screen both want raster. Rather than
 * add a build step or a dependency, this reuses the same drawing surface the
 * share cards are rendered with, and is run by hand when the mark changes:
 *
 *   node scripts/build-icons.mjs
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { Surface } = require('../api/_lib/og/canvas.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');

/** The mark: a sun behind a cloud, over three strokes of rain. */
function drawIcon(size, { padding = 0 } = {}) {
  const surface = new Surface(size, size);
  const s = size / 512;
  const inset = padding * size;
  const scale = (size - inset * 2) / 512;
  const at = (x, y) => [inset + x * scale, inset + y * scale];

  surface.linearGradient([11, 18, 32], [43, 108, 176]);

  const [sunX, sunY] = at(196, 182);
  surface.disc(sunX, sunY, 58 * scale, [255, 212, 121], 1);

  const white = [255, 255, 255];
  const [c1x, c1y] = at(206, 300);
  const [c2x, c2y] = at(292, 278);
  surface.disc(c1x, c1y, 62 * scale, white, 1);
  surface.disc(c2x, c2y, 82 * scale, white, 1);
  const [bx, by] = at(144, 300);
  surface.roundRect(bx, by, 230 * scale, 86 * scale, 43 * scale, white, 1);

  for (const x of [186, 256, 326]) {
    const [ax, ay] = at(x, 404);
    const [ex, ey] = at(x - 18, 446);
    surface.stroke([[ax, ay], [ex, ey]], [125, 211, 252], 20 * scale * (size / size), 1);
  }

  return surface.toPng();
}

mkdirSync(OUT, { recursive: true });

for (const size of [192, 512]) {
  writeFileSync(path.join(OUT, `icon-${size}.png`), drawIcon(size));
  console.log(`icons/icon-${size}.png`);
}

// Maskable icons are cropped to a circle by Android, so the mark is inset to
// keep it inside the safe zone.
writeFileSync(path.join(OUT, 'icon-maskable-512.png'), drawIcon(512, { padding: 0.12 }));
console.log('icons/icon-maskable-512.png');
