/**
 * Shareable weather cards.
 *
 * The premise: nobody shares a link to a weather site, but people share
 * "rain arriving around 4" all the time. So the share button does not offer a
 * URL — it renders the answer as an image, with the URL as the fine print.
 *
 * Drawn on a canvas rather than fetched, so it costs one frame and works
 * offline, and handed to the OS share sheet where that exists.
 */

import { describe } from './wmo.js';
import * as fmt from './format.js';
import { precipTiming } from './insights.js';

const WIDTH = 1200;
const HEIGHT = 630;

const SKY = {
  'clear-day': ['#2b6cb0', '#63b3ed'],
  'clear-night': ['#0b1220', '#243b6b'],
  'cloud-day': ['#4a5568', '#90a4bd'],
  'cloud-night': ['#151d2e', '#33405c'],
  'rain-day': ['#2c5282', '#4a7fb5'],
  'rain-night': ['#111a2b', '#2b3f63'],
  'snow-day': ['#5a6b83', '#a8bed4'],
  'snow-night': ['#141c2c', '#39496b'],
  'storm-day': ['#2d3748', '#5a6a8a'],
  'storm-night': ['#0d1220', '#2a3350'],
  'fog-day': ['#6b7280', '#a3aab6'],
  'fog-night': ['#171c27', '#3a4252'],
};

function palette(icon) {
  return SKY[icon] || SKY['clear-day'];
}

/** The one line worth sharing: what the weather is about to do. */
export function shareHeadline(vm) {
  const timing = precipTiming(vm.series, vm.nowIndex, 24);
  const place = vm.place.name;

  if (timing && timing.state === 'active') {
    return timing.openEnded
      ? `Rain in ${place}, and it is not letting up today`
      : `Rain in ${place} until about ${fmt.hourLabel(timing.endsAt, vm.units)}`;
  }
  if (timing && timing.state === 'incoming') {
    const kind = timing.type === 'snow' ? 'Snow' : 'Rain';
    return `${kind} arriving in ${place} around ${fmt.hourLabel(timing.startsAt, vm.units)}`;
  }

  const today = vm.days[vm.todayIndex];
  const condition = describe(vm.current.weather_code, vm.current.is_day);
  return today
    ? `${place}: ${condition.label.toLowerCase()}, ${fmt.temp(today.high, vm.units)} / ${fmt.temp(today.low, vm.units)}`
    : `${place}: ${condition.label.toLowerCase()}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wrap text to a width, returning the lines rather than drawing them. */
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Draw the card and return the canvas. */
export function drawCard(vm, { width = WIDTH, height = HEIGHT } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const scale = width / WIDTH;
  ctx.scale(scale, scale);

  const current = vm.current;
  const today = vm.days[vm.todayIndex];
  const condition = describe(current.weather_code, current.is_day);
  const [from, to] = palette(condition.icon);

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A soft vignette keeps white text readable over the lighter corner.
  const glow = ctx.createRadialGradient(WIDTH * 0.75, HEIGHT * 0.15, 40, WIDTH * 0.75, HEIGHT * 0.15, 620);
  glow.addColorStop(0, 'rgba(255,255,255,0.20)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textBaseline = 'top';

  // Place
  ctx.font = `600 40px ${FONT}`;
  ctx.fillText(vm.place.name.toUpperCase(), 72, 66);
  if (vm.place.admin1) {
    ctx.font = `400 28px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.fillText(vm.place.admin1, 72, 116);
  }

  // Temperature
  ctx.fillStyle = '#ffffff';
  ctx.font = `200 176px ${FONT}`;
  ctx.fillText(fmt.temp(current.temperature_2m, vm.units), 66, 168);

  const tempWidth = ctx.measureText(fmt.temp(current.temperature_2m, vm.units)).width;
  ctx.font = `500 40px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText(condition.label, 78 + tempWidth, 248);
  if (today) {
    ctx.font = `400 32px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.fillText(
      `${fmt.temp(today.high, vm.units)} / ${fmt.temp(today.low, vm.units)}  ·  ${fmt.percent(today.popMax)} chance`,
      78 + tempWidth, 298
    );
  }

  // The headline — the actual reason to share this
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 52px ${FONT}`;
  const lines = wrap(ctx, shareHeadline(vm), WIDTH - 144).slice(0, 2);
  lines.forEach((line, i) => ctx.fillText(line, 72, 388 + i * 62));

  // Precipitation-probability bars for the next twelve hours
  const hours = vm.next48.slice(0, 12);
  const barWidth = 46;
  const gap = 12;
  const baseY = HEIGHT - 96;
  hours.forEach((hour, i) => {
    const x = 72 + i * (barWidth + gap);
    const pop = Math.max(0, Math.min(100, hour.pop || 0));
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, x, baseY - 54, barWidth, 54, 8);
    ctx.fill();
    if (pop > 0) {
      const h = Math.max(4, (pop / 100) * 54);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      roundRect(ctx, x, baseY - h, barWidth, h, 8);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `500 18px ${FONT}`;
    ctx.fillText(fmt.hourLabel(hour.time, vm.units).replace(':00', ''), x, baseY + 10);
  });

  // Wordmark
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('weatherview.cloud', WIDTH - 72, HEIGHT - 60);
  ctx.textAlign = 'left';

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Share the current forecast: the OS sheet where it exists, a download plus a
 * copied link where it does not.
 */
export async function shareForecast(vm, { toast = () => {} } = {}) {
  if (!vm || !vm.current) return;

  const headline = shareHeadline(vm);
  const url = window.location.href.split('#')[0];
  const text = `${headline} — ${url}`;

  let file = null;
  try {
    const blob = await canvasToBlob(drawCard(vm));
    if (blob) {
      file = new File([blob], `${vm.place.name.toLowerCase().replace(/\s+/g, '-')}-weather.png`, {
        type: 'image/png',
      });
    }
  } catch (error) {
    /* Canvas is blocked or unsupported; fall through to a text share. */
  }

  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: headline, text: headline, url });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: headline, text: headline, url });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }

  // No share sheet: save the card and put the link on the clipboard, which is
  // every step of "post this somewhere" minus the posting.
  if (file) {
    const href = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = href;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  }

  try {
    await navigator.clipboard.writeText(text);
    toast(file ? 'Card saved and link copied' : 'Link copied');
  } catch (error) {
    toast(file ? 'Card saved' : 'Could not share on this browser');
  }
}
