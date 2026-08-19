'use strict';

/**
 * A tiny anti-aliased drawing surface.
 *
 * Everything the share card needs and nothing else: gradients, rounded
 * rectangles, discs, and stroked polylines — which is also how text is drawn,
 * since the font is a set of centrelines. Coverage comes from the distance to
 * the nearest segment, so round joins and caps fall out for free and edges
 * land smooth without a supersampling pass.
 */

const { encodePng } = require('./png');
const { glyphFor, measure } = require('./font');

const ARC_STEP_DEGREES = 4;

class Surface {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 3);
  }

  /** Blend one pixel toward `[r, g, b]` by `alpha` (0..1). */
  blend(x, y, rgb, alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const a = alpha > 1 ? 1 : alpha;
    const i = (y * this.width + x) * 3;
    this.data[i] += (rgb[0] - this.data[i]) * a;
    this.data[i + 1] += (rgb[1] - this.data[i + 1]) * a;
    this.data[i + 2] += (rgb[2] - this.data[i + 2]) * a;
  }

  fill(rgb) {
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] = rgb[0];
      this.data[i + 1] = rgb[1];
      this.data[i + 2] = rgb[2];
    }
  }

  /** Diagonal two-stop gradient across the whole surface. */
  linearGradient(from, to) {
    const span = this.width + this.height;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const t = (x + y) / span;
        const i = (y * this.width + x) * 3;
        this.data[i] = from[0] + (to[0] - from[0]) * t;
        this.data[i + 1] = from[1] + (to[1] - from[1]) * t;
        this.data[i + 2] = from[2] + (to[2] - from[2]) * t;
      }
    }
  }

  /** A soft radial wash, for lifting one corner of the background. */
  radialGlow(cx, cy, radius, rgb, strength = 0.2) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d = Math.hypot(x - cx, y - cy) / radius;
        if (d >= 1) continue;
        // Smoothstep falloff: a linear one shows its edge as a visible ring.
        const t = 1 - d;
        this.blend(x, y, rgb, strength * t * t * (3 - 2 * t));
      }
    }
  }

  rect(x, y, w, h, rgb, alpha = 1) {
    this.roundRect(x, y, w, h, 0, rgb, alpha);
  }

  /** Rounded rectangle, anti-aliased on the corners. */
  roundRect(x, y, w, h, radius, rgb, alpha = 1) {
    const r = Math.min(radius, w / 2, h / 2);
    const x0 = Math.max(0, Math.floor(x));
    const x1 = Math.min(this.width - 1, Math.ceil(x + w));
    const y0 = Math.max(0, Math.floor(y));
    const y1 = Math.min(this.height - 1, Math.ceil(y + h));

    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        // Distance from the rounded box, negative inside.
        const dx = Math.max(x + r - (px + 0.5), (px + 0.5) - (x + w - r), 0);
        const dy = Math.max(y + r - (py + 0.5), (py + 0.5) - (y + h - r), 0);
        const distance = Math.hypot(dx, dy) - r;
        const coverage = 0.5 - distance;
        if (coverage > 0) this.blend(px, py, rgb, alpha * Math.min(1, coverage));
      }
    }
  }

  disc(cx, cy, radius, rgb, alpha = 1) {
    const x0 = Math.max(0, Math.floor(cx - radius - 1));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius + 1));
    const y0 = Math.max(0, Math.floor(cy - radius - 1));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius + 1));

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const coverage = radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (coverage > 0) this.blend(x, y, rgb, alpha * Math.min(1, coverage));
      }
    }
  }

  /**
   * Stroke a polyline with a round pen.
   *
   * Each segment paints only its own bounding box, and coverage is the
   * distance from the pixel centre to the segment — so overlapping segments
   * blend into one continuous stroke rather than showing their joins.
   */
  stroke(points, rgb, thickness, alpha = 1) {
    const half = thickness / 2;

    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];

      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - half - 1));
      const x1 = Math.min(this.width - 1, Math.ceil(Math.max(ax, bx) + half + 1));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - half - 1));
      const y1 = Math.min(this.height - 1, Math.ceil(Math.max(ay, by) + half + 1));

      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;

      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const px = x + 0.5;
          const py = y + 0.5;
          let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
          const coverage = half + 0.5 - distance;
          if (coverage > 0) this.blend(x, y, rgb, alpha * Math.min(1, coverage));
        }
      }
    }
  }

  toPng() {
    return encodePng(this.data, this.width, this.height);
  }
}

/** Expand a glyph path — points and arcs — into one polyline. */
function flattenPath(path, originX, baselineY, size) {
  const points = [];
  const push = (x, y) => points.push([originX + x * size, baselineY - y * size]);

  for (const item of path) {
    if (Array.isArray(item)) {
      push(item[0], item[1]);
      continue;
    }
    const [cx, cy, rx, ry, from, to] = item.a;
    const steps = Math.max(2, Math.ceil(Math.abs(to - from) / ARC_STEP_DEGREES));
    for (let i = 0; i <= steps; i += 1) {
      const angle = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
      push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
    }
  }

  return points;
}

/**
 * Draw a line of text.
 *
 * `size` is the em size in pixels; `weight` the pen thickness as a fraction of
 * it, which is how this font expresses bold.
 */
function drawText(surface, text, {
  x, y, size, rgb, alpha = 1, weight = 0.075, tracking = 0, align = 'left',
}) {
  const width = measure(text, { tracking }) * size;
  let cursor = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  const thickness = Math.max(1.2, size * weight);

  for (const character of String(text)) {
    const glyph = glyphFor(character);
    if (glyph) {
      for (const path of glyph.paths) {
        surface.stroke(flattenPath(path, cursor, y, size), rgb, thickness, alpha);
      }
      cursor += (glyph.advance + tracking) * size;
    } else {
      cursor += (0.4 + tracking) * size;
    }
  }

  return width;
}

/** Break text into lines that fit `maxWidth` pixels at `size`. */
function wrapText(text, { size, maxWidth, tracking = 0 }) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, { tracking }) * size > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

module.exports = { Surface, drawText, wrapText, measure };
