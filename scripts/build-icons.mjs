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

function cubic(from, controlA, controlB, to, steps = 12) {
  const points = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u ** 3 * from[0] + 3 * u ** 2 * t * controlA[0] + 3 * u * t ** 2 * controlB[0] + t ** 3 * to[0],
      u ** 3 * from[1] + 3 * u ** 2 * t * controlA[1] + 3 * u * t ** 2 * controlB[1] + t ** 3 * to[1],
    ]);
  }
  return points;
}

function upperDisc(surface, cx, cy, radius, rgb) {
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const x1 = Math.min(surface.width - 1, Math.ceil(cx + radius + 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const y1 = Math.min(surface.height - 1, Math.ceil(cy));

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const coverage = radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (coverage > 0) surface.blend(x, y, rgb, Math.min(1, coverage));
    }
  }
}

/** The cloud, rising sun, and horizon used in the WeatherView wordmark. */
function drawIcon(size, { padding = 0 } = {}) {
  const surface = new Surface(size, size);
  const inset = padding * size;
  const scale = (size - inset * 2) / 512;
  const at = (x, y) => [inset + x * scale, inset + y * scale];

  surface.linearGradient([11, 18, 32], [43, 108, 176]);

  const markX = 60;
  const markY = 160;
  const markScale = 2.9;
  const point = ([x, y]) => at(markX + x * markScale, markY + y * markScale);
  const accent = [90, 183, 255];
  const white = [255, 255, 255];

  const cloud = [[12, 60]];
  const curve = (a, b, c, d) => cloud.push(...cubic(a, b, c, d));
  curve([12, 60], [6.7, 54.7], [4, 48.2], [4, 40.5]);
  curve([4, 40.5], [4, 25.9], [15.9, 14], [30.5, 14]);
  curve([30.5, 14], [33.7, 14], [36.8, 14.6], [39.7, 15.7]);
  curve([39.7, 15.7], [44.7, 6.2], [54.7, 0], [66, 0]);
  curve([66, 0], [77.3, 0], [87.3, 6.2], [92.3, 15.7]);
  curve([92.3, 15.7], [95.2, 14.6], [98.3, 14], [101.5, 14]);
  curve([101.5, 14], [116.1, 14], [128, 25.9], [128, 40.5]);
  curve([128, 40.5], [128, 48.2], [125.3, 54.7], [120, 60]);

  const [sunX, sunY] = point([66, 60]);
  upperDisc(surface, sunX, sunY, 20 * markScale * scale, accent);
  surface.stroke(cloud.map(point), white, 7 * markScale * scale, 1);
  surface.stroke([point([8, 60]), point([128, 60])], accent, 7 * markScale * scale, 1);

  return surface.toPng();
}

mkdirSync(OUT, { recursive: true });

for (const size of [192, 512]) {
  writeFileSync(path.join(OUT, `weatherview-${size}.png`), drawIcon(size));
  console.log(`icons/weatherview-${size}.png`);
}

// Maskable icons are cropped to a circle by Android, so the mark is inset to
// keep it inside the safe zone.
writeFileSync(path.join(OUT, 'weatherview-maskable-512.png'), drawIcon(512, { padding: 0.12 }));
console.log('icons/weatherview-maskable-512.png');
