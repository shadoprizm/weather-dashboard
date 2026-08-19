'use strict';

/**
 * The share card: 1200×630, the size every link preview crops to.
 *
 * What goes on it is the whole argument. Not a logo and a tagline — the
 * *answer*: where, how warm, and what the sky is about to do. A card someone
 * would forward to a friend is an advertisement that does not read like one,
 * and it is the only kind that spreads.
 */

const { Surface, drawText, wrapText, measure } = require('./canvas');
const site = require('../site');

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 76;

/** Background pairs, keyed by the same sky themes the site uses. */
const SKIES = {
  'clear-day': [[26, 90, 158], [96, 176, 232]],
  'clear-night': [[9, 15, 34], [38, 60, 110]],
  'cloud-day': [[62, 78, 100], [143, 165, 190]],
  'cloud-night': [[19, 26, 44], [54, 68, 98]],
  'rain-day': [[32, 68, 116], [86, 132, 176]],
  'rain-night': [[13, 22, 40], [44, 66, 102]],
  'snow-day': [[86, 104, 128], [176, 196, 216]],
  'snow-night': [[18, 26, 44], [60, 74, 108]],
  'storm-day': [[42, 52, 72], [96, 110, 140]],
  'storm-night': [[10, 14, 28], [44, 52, 82]],
  'fog-day': [[104, 112, 124], [166, 174, 186]],
  'fog-night': [[22, 28, 40], [60, 68, 84]],
};

const WHITE = [255, 255, 255];

function sky(theme) {
  return SKIES[theme] || SKIES['clear-day'];
}

/**
 * Draw the weather glyph in the top-right.
 *
 * Deliberately drawn rather than traced from the site's SVG icons: at this
 * size a few discs and strokes read better than a shrunken icon, and it keeps
 * the card to one drawing primitive.
 */
function drawSymbol(surface, theme, cx, cy, scale) {
  const dim = [255, 255, 255];
  const soft = 0.55;
  const night = theme.endsWith('night');

  const sun = () => {
    if (night) {
      // A crescent: a bright disc with the background punched back over it.
      surface.disc(cx, cy, 0.42 * scale, dim, 0.92);
      surface.disc(cx + 0.20 * scale, cy - 0.16 * scale, 0.36 * scale, sky(theme)[1], 1);
      return;
    }
    surface.disc(cx, cy, 0.30 * scale, dim, 0.95);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4;
      surface.stroke([
        [cx + Math.cos(angle) * 0.42 * scale, cy + Math.sin(angle) * 0.42 * scale],
        [cx + Math.cos(angle) * 0.56 * scale, cy + Math.sin(angle) * 0.56 * scale],
      ], dim, 0.055 * scale, 0.9);
    }
  };

  const cloud = (offsetX = 0, offsetY = 0, alpha = 0.92) => {
    surface.disc(cx - 0.24 * scale + offsetX, cy + 0.10 * scale + offsetY, 0.24 * scale, dim, alpha);
    surface.disc(cx + 0.06 * scale + offsetX, cy + 0.02 * scale + offsetY, 0.30 * scale, dim, alpha);
    surface.roundRect(
      cx - 0.44 * scale + offsetX, cy + 0.12 * scale + offsetY,
      0.86 * scale, 0.26 * scale, 0.13 * scale, dim, alpha
    );
  };

  const drops = (frozen) => {
    for (let i = 0; i < 4; i += 1) {
      const x = cx - 0.32 * scale + i * 0.22 * scale;
      const y = cy + 0.52 * scale;
      if (frozen) {
        surface.disc(x, y + 0.06 * scale, 0.05 * scale, dim, soft);
      } else {
        surface.stroke([[x + 0.05 * scale, y], [x - 0.03 * scale, y + 0.22 * scale]], dim, 0.05 * scale, soft);
      }
    }
  };

  if (theme.startsWith('clear')) { sun(); return; }
  if (theme.startsWith('cloud')) { sun(-0.1); cloud(0.14 * scale, 0.14 * scale); return; }
  if (theme.startsWith('rain')) { cloud(); drops(false); return; }
  if (theme.startsWith('snow')) { cloud(); drops(true); return; }
  if (theme.startsWith('storm')) {
    cloud();
    surface.stroke([
      [cx + 0.06 * scale, cy + 0.44 * scale],
      [cx - 0.10 * scale, cy + 0.68 * scale],
      [cx + 0.06 * scale, cy + 0.68 * scale],
      [cx - 0.08 * scale, cy + 0.94 * scale],
    ], dim, 0.06 * scale, 0.9);
    return;
  }
  for (let i = 0; i < 4; i += 1) {
    const y = cy - 0.24 * scale + i * 0.2 * scale;
    surface.stroke([[cx - 0.5 * scale, y], [cx + (i % 2 ? 0.36 : 0.5) * scale, y]], dim, 0.07 * scale, soft);
  }
}

/**
 * Render a card.
 *
 * `card` is deliberately plain data — place, temperature, condition, headline,
 * a high/low line and up to twelve precipitation probabilities — so the same
 * shape can come from a live forecast or from a test.
 */
function renderCard(card) {
  const surface = new Surface(WIDTH, HEIGHT);
  const theme = card.theme || 'clear-day';
  const [from, to] = sky(theme);

  surface.linearGradient(from, to);
  surface.radialGlow(WIDTH * 0.78, HEIGHT * 0.14, 640, WHITE, 0.16);

  // Place
  drawText(surface, String(card.place || '').toUpperCase(), {
    x: MARGIN, y: 112, size: 40, rgb: WHITE, alpha: 0.95, weight: 0.085, tracking: 0.06,
  });
  if (card.region) {
    drawText(surface, card.region, {
      x: MARGIN, y: 162, size: 30, rgb: WHITE, alpha: 0.62, weight: 0.07,
    });
  }

  // Temperature, and the condition set beside it
  const temperature = String(card.temperature || '--');
  drawText(surface, temperature, {
    x: MARGIN - 4, y: 330, size: 168, rgb: WHITE, alpha: 1, weight: 0.055,
  });
  const temperatureWidth = measure(temperature) * 168;

  drawText(surface, card.condition || '', {
    x: MARGIN + temperatureWidth + 34, y: 268, size: 40, rgb: WHITE, alpha: 0.92, weight: 0.08,
  });
  if (card.range) {
    drawText(surface, card.range, {
      x: MARGIN + temperatureWidth + 34, y: 322, size: 31, rgb: WHITE, alpha: 0.66, weight: 0.07,
    });
  }

  drawSymbol(surface, theme, WIDTH - 208, 190, 150);

  // The headline: the sentence that makes this worth forwarding.
  const lines = wrapText(card.headline || '', { size: 50, maxWidth: WIDTH - MARGIN * 2 }).slice(0, 2);
  lines.forEach((line, i) => {
    drawText(surface, line, {
      x: MARGIN, y: 428 + i * 62, size: 50, rgb: WHITE, alpha: 1, weight: 0.085,
    });
  });

  // Precipitation probability for the next twelve hours.
  const hours = (card.hours || []).slice(0, 12);
  if (hours.length) {
    const barWidth = 44;
    const gap = 14;
    const baseline = HEIGHT - 88;
    hours.forEach((hour, i) => {
      const x = MARGIN + i * (barWidth + gap);
      surface.roundRect(x, baseline - 52, barWidth, 52, 8, WHITE, 0.18);
      const pop = Math.max(0, Math.min(100, hour.pop || 0));
      if (pop > 2) {
        const height = Math.max(5, (pop / 100) * 52);
        surface.roundRect(x, baseline - height, barWidth, height, 8, WHITE, 0.85);
      }
      drawText(surface, hour.label || '', {
        x: x + barWidth / 2, y: baseline + 30, size: 20, rgb: WHITE, alpha: 0.6,
        weight: 0.09, align: 'center',
      });
    });
  }

  drawText(surface, site.host, {
    x: WIDTH - MARGIN, y: HEIGHT - 52, size: 30, rgb: WHITE, alpha: 0.9,
    weight: 0.085, align: 'right',
  });

  return surface.toPng();
}

module.exports = { renderCard, WIDTH, HEIGHT };
