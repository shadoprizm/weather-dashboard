import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { planActivity, normalizePlanPreferences } from '../js/planning.js';
import { calendarEvent, wallTimeToUtc } from '../js/calendar.js';
import { renderPlanner } from '../js/views/planner.js';

const series = Array.from({ length: 48 }, (_, i) => ({
  time: new Date(Date.UTC(2026,9,9,8+i)).toISOString().slice(0,16),
  temp: 11, feels: 11, pop: 0, wind: 8, cloud: 0, isDay: 1,
}));
const vm = { series, days: [], nowIndex: 0, utcOffsetSeconds: -14400,
  timezone: 'America/Toronto', planNow: '2026-10-09T08:15',
  place: { name: 'Toronto' }, units: { temp: 'c', wind: 'kmh', clock: '12' } };
const options = { activity: 'run', duration: 90, timeOfDay: 'daylight' };
const result = planActivity(vm, options);
assert.equal(result.windows.length, 3);
assert.equal(result.windows[0].start, '2026-10-09T09:00', 'never recommend an hour already in progress');
for (const w of result.windows) {
  assert.equal(Date.parse(w.end) - Date.parse(w.start), 90 * 60000);
  assert.ok(w.start > vm.planNow);
}
for (const [i, a] of result.windows.entries()) {
  for (const b of result.windows.slice(i+1)) assert.ok(a.start >= b.end || b.start >= a.end);
}
const bad = [{ ...series[1] }, { ...series[2], pop: 100, precip: 5 }];
assert.equal(planActivity({ ...vm, series: bad }, { ...options, duration: 120 }).status, 'no-fit', 'a wet hour cannot be averaged away');
assert.equal(planActivity({ ...vm, series: series.map(h => ({ ...h, pop: null })) }, options).status, 'unavailable');
assert.equal(planActivity({ ...vm, series: [series[1],series[3]] }, { ...options, duration: 120 }).windows.length, 0, 'gaps cannot cover an outing');
assert.equal(planActivity({ ...vm, series: series.map(h => ({ ...h, isDay: 0 })) }, options).windows.length, 0);
assert.equal(planActivity(vm, { ...options, activity: 'stargaze', timeOfDay: 'night' }).windows.length, 0);
assert.ok(planActivity({ ...vm, series: series.map(h => ({ ...h, isDay: 0 })) }, { activity: 'stargaze', duration: 60, timeOfDay: 'night' }).windows.length);
const overnight = { ...vm, planNow: '2026-10-09T22:15', series: series.filter(h => h.time >= '2026-10-09T23:00') };
const overnightPlan = planActivity(overnight, { ...options, duration: 120, timeOfDay: 'any' });
assert.equal(overnightPlan.windows[0].end, '2026-10-10T01:00');
assert.match(renderPlanner({ ...overnight, planPreferences: { ...options, duration: 120, timeOfDay: 'any' } }), /Sat 1:00\s*am/, 'overnight UI names the ending day');
assert.deepEqual(normalizePlanPreferences({ activity: 'bogus', duration: 24, timeOfDay: 'bogus' }), { activity: 'run', duration: 60, timeOfDay: 'daylight' });
assert.equal(wallTimeToUtc('2026-03-08T03:00', 'America/Toronto').toISOString(), '2026-03-08T07:00:00.000Z');
assert.throws(() => wallTimeToUtc('2026-03-08T02:30', 'America/Toronto'), /clock change/);
assert.equal(wallTimeToUtc('2026-11-01T03:00', 'America/Toronto').toISOString(), '2026-11-01T08:00:00.000Z');
const crossing = { ...vm, planNow: '2026-03-08T00:15', series: [
  { ...series[0], time: '2026-03-08T01:00' }, { ...series[0], time: '2026-03-08T02:00' },
] };
assert.equal(planActivity(crossing, { ...options, duration: 120 }).windows.length, 0, 'DST gaps cannot yield false durations');
const event = calendarEvent({ window: result.windows[0], activity: { id: 'run', label: 'Go for a run' },
  place: { name: 'Toronto, ON; home\nBEGIN:bad' }, timezone: vm.timezone, description: 'é'.repeat(120) });
assert.match(event, /DTSTART:20261009T130000Z/);
assert.match(event, /DTEND:20261009T143000Z/);
assert.match(event, /Toronto\\, ON\\; home\\nBEGIN:bad/);
assert.ok(event.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75), 'calendar lines fold by UTF-8 bytes');
assert.ok(!event.includes('\nBEGIN:bad'), 'text cannot inject another calendar property');

globalThis.localStorage = { getItem: () => JSON.stringify({ locations: [{ name: 'Home', latitude: 45, longitude: -75 }], units: { temp: 'f' }, theme: 'light' }), setItem: (_, value) => { globalThis.saved = JSON.parse(value); } };
const state = await import('../js/state.js?preference-test');
state.setPlanPreferences(options);
assert.equal(saved.locations[0].name, 'Home');
assert.equal(saved.units.temp, 'f');
assert.equal(saved.theme, 'light');
assert.deepEqual(saved.plan, options);
delete globalThis.localStorage;

const require = createRequire(import.meta.url);
const handlers = require('../api/_lib/handlers.js');
const original = handlers.forecast;
let requests = 0;
handlers.forecast = async () => { requests++; throw new Error('must not fetch invalid preferences'); };
const { plan } = require('../api/_lib/planner.js');
assert.equal((await plan({ activity: 'bogus' })).status, 400);
assert.equal((await plan({ duration: '999' })).status, 400);
assert.equal(requests, 0);
handlers.forecast = original;
console.log('Planning, timezone, calendar and preference checks passed.');
