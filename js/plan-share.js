import { ACTIVITIES } from './insights.js';
import { PLAN_DURATIONS, normalizePlanPreferences } from './planning.js';
import * as fmt from './format.js';
import { planReasons } from './views/planner.js?v=23';

/** Only recognized choices from a planning link can replace saved preferences. */
export function planPreferencesFromUrl(value, saved = {}) {
  const url = new URL(value);
  if (url.searchParams.get('view') !== 'plan') return null;
  const choices = {};
  const activity = url.searchParams.get('activity');
  const duration = url.searchParams.get('duration');
  const timeOfDay = url.searchParams.get('timeOfDay');
  if (ACTIVITIES.some(a => a.id === activity)) choices.activity = activity;
  if (duration && PLAN_DURATIONS.includes(Number(duration))) choices.duration = Number(duration);
  if (['daylight', 'any', 'night'].includes(timeOfDay)) choices.timeOfDay = timeOfDay;
  return Object.keys(choices).length ? normalizePlanPreferences({ ...saved, ...choices }) : null;
}

export function planShareUrl(place, preferences, origin = 'https://www.weatherview.cloud') {
  const url = new URL('/', origin);
  url.searchParams.set('lat', place.latitude.toFixed(4));
  url.searchParams.set('lon', place.longitude.toFixed(4));
  url.searchParams.set('name', place.name);
  url.searchParams.set('view', 'plan');
  for (const [key, value] of Object.entries(normalizePlanPreferences(preferences))) url.searchParams.set(key, value);
  return url.href;
}

export function planShareText(vm, plan, window) {
  const when = `${fmt.dayName(window.start)} ${fmt.dayNumber(window.start)}, ${fmt.timeLabel(window.start, vm.units)}–${fmt.timeLabel(window.end, vm.units)}${window.start.slice(0,10) !== window.end.slice(0,10) ? ` (${fmt.dayName(window.end)})` : ''}`;
  return `${plan.activity.label} in ${vm.place.name}: ${when} (${vm.timezone || 'local time'}), ${plan.preferences.duration} minutes.\n${planReasons(window, plan.activity, vm.units).join(' · ')}.\nForecast checked ${new Date(vm.updatedAt || Date.now()).toISOString()}. Open the link for updated suggestions; weather can change.`;
}

export function drawPlanCard(vm, plan, window) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image sharing is unavailable');
  const gradient = ctx.createLinearGradient(0,0,1200,630);
  gradient.addColorStop(0, '#0b1220'); gradient.addColorStop(1, '#123e5d');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,1200,630);
  ctx.fillStyle = '#67d4c8'; ctx.font = '600 25px system-ui';
  ctx.fillText('WEATHERVIEW · A BETTER TIME TO GET OUTSIDE', 64, 65);
  ctx.fillStyle = '#fff'; ctx.font = '600 48px system-ui';
  ctx.fillText(`${plan.activity.label} · ${plan.preferences.duration} minutes`, 64, 155, 1072);
  ctx.font = '400 32px system-ui'; ctx.fillText(vm.place.name, 64, 215, 1072);
  ctx.font = '600 52px system-ui';
  ctx.fillText(`${fmt.dayName(window.start)} ${fmt.dayNumber(window.start)}, ${fmt.timeLabel(window.start, vm.units)}–${fmt.timeLabel(window.end, vm.units)}`, 64, 312, 1072);
  ctx.fillStyle = '#bcd5e6'; ctx.font = '400 24px system-ui';
  ctx.fillText(`Local time · ${vm.timezone || vm.place.name}${window.start.slice(0,10) !== window.end.slice(0,10) ? ` · ends ${fmt.dayName(window.end)} ${fmt.dayNumber(window.end)}` : ''}`,64,360,1072);
  ctx.fillText(planReasons(window, plan.activity, vm.units).join(' · '), 64, 419, 1072);
  ctx.fillText(`Forecast checked ${new Date(vm.updatedAt || Date.now()).toISOString().slice(0,16).replace('T',' ')} UTC. Weather can change.`, 64, 492, 1072);
  ctx.fillStyle = '#67d4c8'; ctx.fillText('Free · Ad-free · weatherview.cloud', 64, 559);
  return canvas;
}

/** Return the completed share method; cancellation is not a conversion. */
export async function sharePlan(vm, plan, window, { toast = () => {} } = {}) {
  const url = planShareUrl(vm.place, plan.preferences, globalThis.location.origin);
  const text = planShareText(vm, plan, window);
  if (navigator.share) {
    try { await navigator.share({ title: `${plan.activity.label} · WeatherView`, text, url }); return 'native'; }
    catch (error) { if (error.name === 'AbortError') return null; }
  }
  let copied = false, downloaded = false;
  try { await navigator.clipboard.writeText(`${text}\n${url}`); copied = true; } catch { /* Download remains available. */ }
  try {
    const blob = await new Promise(resolve => drawPlanCard(vm, plan, window).toBlob(resolve, 'image/png'));
    if (blob) {
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = href;
      link.download = `weatherview-${plan.activity.id}-plan.png`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10000); downloaded = true;
    }
  } catch { /* Clipboard sharing does not depend on canvas support. */ }
  toast(copied ? (downloaded ? 'Plan card saved and updated-planning link copied.' : 'Updated-planning link copied.') : downloaded ? 'Plan card saved. The time shown is a forecast, not a guarantee.' : 'Sharing is unavailable in this browser.');
  return copied ? 'clipboard' : downloaded ? 'download' : null;
}
