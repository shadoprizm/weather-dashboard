import { wallTimeToUtc } from './calendar.js';
import { ACTIVITIES, solarWindows } from './insights.js';

export const PLAN_DURATIONS = [30, 60, 90, 120, 180];
export const DEFAULT_PLAN = { activity: 'run', duration: 60, timeOfDay: 'daylight' };

export function normalizePlanPreferences(value = {}) {
  return {
    activity: ACTIVITIES.some(a => a.id === value.activity) ? value.activity : DEFAULT_PLAN.activity,
    duration: PLAN_DURATIONS.includes(Number(value.duration)) ? Number(value.duration) : DEFAULT_PLAN.duration,
    timeOfDay: ['daylight', 'any', 'night'].includes(value.timeOfDay) ? value.timeOfDay : DEFAULT_PLAN.timeOfDay,
  };
}

function wallMillis(time) { return Date.parse(`${time.slice(0, 16)}:00Z`); }
function wallTime(millis) { return new Date(millis).toISOString().slice(0, 16); }

/** Hourly day/night flags describe an instant, not the whole outing. */
function fitsSolarWindow(days, start, end, mode) {
  for (let midnight = Math.floor(start / 86400000) * 86400000; midnight < end; midnight += 86400000) {
    const day = days.find(d => d.time.slice(0, 10) === wallTime(midnight).slice(0, 10));
    const from = Math.max(start, midnight);
    const to = Math.min(end, midnight + 86400000);
    const sunrise = day?.sunrise ? wallMillis(day.sunrise) : NaN;
    const sunset = day?.sunset ? wallMillis(day.sunset) : NaN;
    if (!Number.isFinite(sunrise) || !Number.isFinite(sunset) || sunrise >= sunset) {
      // Explicit polar day/night can qualify; missing solar data cannot.
      if (mode === 'daylight' && day?.daylight >= 86400) continue;
      if (mode === 'night' && day?.daylight === 0) continue;
      return false;
    }
    if (mode === 'daylight' && (from < sunrise || to > sunset)) return false;
    if (mode === 'night' && from < sunset && to > sunrise) return false;
    if (mode === 'golden' && !(
      (from >= sunrise && to <= sunrise + 55 * 60000) ||
      (from >= sunset - 55 * 60000 && to <= sunset)
    )) return false;
  }
  return true;
}

export function locationNow(utcOffsetSeconds = 0, now = Date.now()) {
  return wallTime(now + utcOffsetSeconds * 1000);
}

/** Suggestions use full hourly coverage; unknown rain/wind never means dry/calm. */
export function planActivity(vm, preferences = DEFAULT_PLAN, { nowTime, hours = 48, limit = 3 } = {}) {
  const prefs = normalizePlanPreferences(preferences);
  const activity = ACTIVITIES.find(a => a.id === prefs.activity);
  const now = nowTime || vm.planNow || locationNow(vm.utcOffsetSeconds);
  const nowMs = wallMillis(now);
  const horizon = nowMs + hours * 3600000;
  const durationMs = prefs.duration * 60000;
  const count = Math.ceil(prefs.duration / 60);
  const goldenHours = new Set(vm.days.flatMap(day => [...solarWindows(day).goldenHours]));
  const candidates = [];
  let completeWindows = 0;

  for (let i = Math.max(0, vm.nowIndex); i < vm.series.length; i += 1) {
    const first = vm.series[i];
    const start = wallMillis(first.time);
    if (!Number.isFinite(start) || start < nowMs || start + durationMs > horizon) continue;
    const covered = vm.series.slice(i, i + count);
    if (covered.length !== count || covered.some((h, j) => wallMillis(h.time) !== start + j * 3600000)) continue;
    if (covered.some(h => !Number.isFinite(h.feels ?? h.temp) || !Number.isFinite(h.pop) || !Number.isFinite(h.wind))) continue;
    if ((activity.id === 'stargaze' || activity.id === 'photo') && covered.some(h => !Number.isFinite(h.cloud))) continue;
    completeWindows += 1;
    if (covered.some(h => (activity.daylight || prefs.timeOfDay === 'daylight') && h.isDay !== 1)) continue;
    if (covered.some(h => (activity.night || prefs.timeOfDay === 'night') && h.isDay !== 0)) continue;
    if (activity.id === 'photo' && covered.some(h => !goldenHours.has(h.time))) continue;
    const lightMode = activity.id === 'photo' ? 'golden'
      : activity.daylight || prefs.timeOfDay === 'daylight' ? 'daylight'
      : activity.night || prefs.timeOfDay === 'night' ? 'night' : null;
    if (lightMode && !fitsSolarWindow(vm.days, start, start + durationMs, lightMode)) continue;
    const end = wallTime(start + durationMs);
    try {
      if (wallTimeToUtc(end, vm.timezone, vm.utcOffsetSeconds) - wallTimeToUtc(first.time, vm.timezone, vm.utcOffsetSeconds) !== durationMs) continue;
    } catch { continue; }
    const scores = covered.map(h => Math.max(0, Math.min(100, Math.round(activity.score(h, { goldenHours })))));
    // Every part of the outing must qualify, rather than averaging away a bad hour.
    if (scores.some(score => !Number.isFinite(score) || score < 55)) continue;
    const score = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
    const feels = covered.map(h => h.feels ?? h.temp);
    candidates.push({
      start: first.time.slice(0, 16), end, duration: prefs.duration,
      score, band: score >= 75 ? 'good' : 'fair',
      maxRainChance: Math.max(...covered.map(h => h.pop)),
      maxWind: Math.max(...covered.map(h => h.wind)),
      minFeels: Math.min(...feels), maxFeels: Math.max(...feels),
      maxCloud: Math.max(...covered.map(h => h.cloud ?? 0)),
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));
  const windows = [];
  for (const candidate of candidates) {
    if (windows.some(w => candidate.start < w.end && candidate.end > w.start)) continue;
    windows.push(candidate);
    if (windows.length >= limit) break;
  }
  return {
    preferences: prefs,
    activity: { id: activity.id, label: activity.label, blurb: activity.blurb, icon: activity.icon },
    windows, status: windows.length ? 'available' : completeWindows ? 'no-fit' : 'unavailable',
    timezone: vm.timezone || null, utcOffsetSeconds: vm.utcOffsetSeconds,
    now, updatedAt: vm.updatedAt,
  };
}
