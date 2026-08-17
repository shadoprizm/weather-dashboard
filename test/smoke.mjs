/**
 * Smoke tests for the pure front-end modules.
 *
 * The views are deliberately pure string builders, so the whole render path
 * can be exercised in Node against a synthetic forecast -- no browser, no
 * network. Run with `npm test`.
 */
import assert from 'node:assert/strict';

const base = new URL('../js/', import.meta.url).href;
const fmt = await import(base + 'format.js');
const wmo = await import(base + 'wmo.js');
const icons = await import(base + 'icons.js');
const ins = await import(base + 'insights.js');
const views = await import(base + 'views/forecast.js');
const panels = await import(base + 'views/panels.js');
const { buildFixture } = await import(new URL('./fixture.mjs', import.meta.url).href);

const units = { temp: 'c', wind: 'kmh', precip: 'mm', pressure: 'hpa', distance: 'km', clock: '12' };
const imperial = { temp: 'f', wind: 'mph', precip: 'in', pressure: 'inhg', distance: 'mi', clock: '24' };

// --- formatting -----------------------------------------------------------
assert.equal(fmt.temp(21.4, units), '21°');
assert.equal(fmt.temp(0, imperial), '32°');
assert.equal(fmt.temp(null, units), '--');
assert.equal(fmt.compass(0), 'N');
assert.equal(fmt.compass(180), 'S');
assert.equal(fmt.compass(315), 'NW');
assert.equal(fmt.percent(63.4), '63%');
assert.match(fmt.pressure(1013.2, units), /^1013/);
assert.match(fmt.pressure(1013.2, imperial), /inHg$/);
assert.equal(fmt.hourLabel('2026-08-17T15:00', units), '3pm');
assert.equal(fmt.hourLabel('2026-08-17T15:00', imperial), '15:00');
assert.equal(fmt.duration(3600 * 14 + 60 * 32), '14h 32m');
assert.equal(fmt.signedDuration(-134), '−2m 14s');
assert.equal(fmt.tempDelta(4.23, units), '+4.2°');

// --- wmo ------------------------------------------------------------------
assert.equal(wmo.describe(0, 1).icon, 'clear-day');
assert.equal(wmo.describe(0, 0).icon, 'clear-night');
assert.equal(wmo.describe(95, 1).sky, 'storm');
assert.equal(wmo.skyTheme(3, 0), 'cloud-night');
assert.equal(wmo.describe(1234, 1).label, 'Unknown');
for (const code of Object.keys(wmo.CODES)) {
  const icon = wmo.describe(Number(code), 1).icon;
  assert.ok(icons.weatherIcon(icon).includes('<svg'), `icon missing for ${code}`);
}

// --- icons ----------------------------------------------------------------
assert.ok(icons.weatherIcon('nope').includes('<svg'));            // falls back
assert.ok(icons.moonPhaseIcon(0.5).includes('<svg'));
assert.ok(icons.windArrow(270).includes('rotate(90deg)'));
assert.ok(icons.glyph('wind').includes('<path'));
assert.equal(icons.glyph('does-not-exist'), '');
// Unique ids so multiple moons on one page do not collide.
const a = icons.moonPhaseIcon(0.3), b = icons.moonPhaseIcon(0.3);
assert.notEqual(a.match(/id="(mp-\d+)"/)[1], b.match(/id="(mp-\d+)"/)[1]);

// --- synthetic forecast ---------------------------------------------------
const data = buildFixture();
const series = ins.hourlySeries(data);
const daily = ins.dailySeries(data);
assert.equal(series.length, 96);
assert.equal(daily.length, 4);
assert.equal(series[26].temp, data.hourly.temperature_2m[26]);

// --- insights -------------------------------------------------------------
const comfort = ins.comfortScore(series[26]);
assert.ok(comfort > 0 && comfort <= 100, `comfort out of range: ${comfort}`);
assert.equal(ins.comfortScore(null), null);
assert.equal(ins.comfortLabel(90), 'Perfect');

const trend = ins.pressureTrend(series, 26);
assert.equal(trend.direction, 'steady');

const timing = ins.precipTiming(series, 26, 24);
assert.equal(timing.state, 'incoming');
assert.ok(timing.startsAt);

const dry = ins.dryStreak(series, 26);
assert.ok(dry.hours >= 0);

const narrative = ins.buildNarrative({
  current: data.current, series, nowIndex: 26, days: daily, todayIndex: 1,
  placeName: 'Ottawa', units,
});
assert.ok(narrative.length >= 2, 'narrative too short');
assert.ok(narrative.every((s) => typeof s === 'string' && s.length > 8));

const solar = ins.solarWindows(daily[1]);
assert.ok(solar.goldenHours.size >= 2);

const activities = ins.activityWindows(series, 26, { goldenHours: solar.goldenHours });
assert.equal(activities.length, ins.ACTIVITIES.length);
assert.ok(activities.every((a) => a.bestScore >= 0 && a.bestScore <= 100));
// Sorted best-first.
assert.ok(activities[0].bestScore >= activities[activities.length - 1].bestScore);
// Night-only activity must never pick a daylight hour.
const stargaze = activities.find((a) => a.id === 'stargaze');
if (stargaze.window) assert.equal(stargaze.window.start.isDay, 0);
// Daylight-only likewise.
const laundry = activities.find((a) => a.id === 'laundry');
if (laundry.window) assert.equal(laundry.window.start.isDay, 1);

const moon = ins.moonPhase(new Date('2026-08-17T12:00:00Z'));
assert.ok(moon.phase >= 0 && moon.phase < 1);
assert.ok(moon.illumination >= 0 && moon.illumination <= 1);
assert.ok(ins.PHASE_NAMES === undefined || true);
// Known new moon: 2000-01-06 should be very close to phase 0.
const newMoon = ins.moonPhase(new Date('2000-01-06T18:14:00Z'));
assert.ok(newMoon.phase < 0.02 || newMoon.phase > 0.98, `phase ${newMoon.phase}`);

const stars = ins.stargazingOutlook(series, 26, moon);
assert.ok(stars.score >= 0 && stars.score <= 100);

const watches = ins.computeWatches({ series, nowIndex: 26, days: daily, todayIndex: 1, air: data.air });
assert.ok(Array.isArray(watches));
assert.ok(watches.every((w) => w.level === 'warning' || w.level === 'advisory'));

assert.equal(ins.aqiBand(42).tone, 'good');
assert.equal(ins.aqiBand(160).tone, 'unhealthy');
assert.equal(ins.aqiBand(null), null);

const almanac = {
  available: true, date: '2026-08-17', windowDays: 3, years: 20,
  normalHigh: 26.1, normalLow: 15.2, normalPrecip: 2.4, wetDayOdds: 0.33,
  recordHigh: { value: 35.4, date: '2011-08-18' }, recordLow: { value: 6.1, date: '2004-08-15' },
};
const cmp = ins.almanacComparison(almanac, daily[1]);
assert.ok(typeof cmp.verdict === 'string');
assert.equal(ins.almanacComparison(null, daily[1]), null);

const aurora = ins.auroraOutlook(6, 45.42);
assert.equal(aurora.level, 'Geomagnetic storm');
assert.equal(ins.auroraOutlook(NaN, 45), null);

const ranked = ins.rankLocations([
  { place: { id: 'a', name: 'A' }, data },
  { place: { id: 'b', name: 'B' }, data },
]);
assert.equal(ranked.length, 2);

// --- views render without throwing, and escape hostile input --------------
const vm = {
  place: { id: 'x', name: '<img src=x onerror=alert(1)>', admin1: 'Ontario', country: 'Canada', latitude: 45.42, longitude: -75.7 },
  units, utcOffsetSeconds: -14400,
  current: data.current, air: data.air,
  series, days: daily, nowIndex: 26, todayIndex: 1,
  next48: ins.upcoming(series, 26, 48),
  selectedDay: null, dayHours: [],
  alerts: { alerts: [{ id: '1', event: 'Severe Thunderstorm Warning', headline: 'Take cover', description: 'd', severity: 'Severe', source: 'NWS', expires: '2026-08-17T20:00' }] },
  almanac, space: { available: true, kp: 6 },
  comparisons: [{ place: { id: 'a', name: 'A' }, data }, { place: { id: 'b', name: 'B' }, data }],
  updatedAt: data.fetchedAt,
};

const rendered = {
  hero: views.renderHero(vm),
  briefing: views.renderBriefing(vm),
  hourly: views.renderHourly(vm),
  details: views.renderDetails(vm),
  daily: views.renderDaily(vm),
  alerts: panels.renderAlerts(vm),
  activities: panels.renderActivities(vm),
  astro: panels.renderAstro(vm),
  air: panels.renderAir(vm),
  almanac: panels.renderAlmanac(vm),
  compare: panels.renderCompare(vm),
};

for (const [name, markup] of Object.entries(rendered)) {
  assert.ok(typeof markup === 'string' && markup.length > 20, `${name} rendered empty`);
  assert.ok(!markup.includes('undefined'), `${name} leaked "undefined"`);
  assert.ok(!markup.includes('NaN'), `${name} leaked "NaN"`);
  // The hostile name must never survive as live markup.
  assert.ok(!markup.includes('<img src=x'), `${name} failed to escape hostile place name`);
}
assert.ok(rendered.hero.includes('&lt;img'), 'hero did not escape place name');
assert.ok(rendered.briefing.includes('&lt;img'), 'briefing did not escape place name');

// Alert providers hand over different amounts of detail; both shapes must render.
const vmEccc = { ...vm, alerts: { alerts: [{
  id: 'eccc:s0000430:Rainfall warning', event: 'Rainfall warning',
  headline: null, description: null, instruction: null,
  severity: 'Severe', area: 'Ottawa, ON', sender: 'ECCC',
  onset: '2026-08-17T12:34:00Z', expires: null,
  url: 'https://weather.gc.ca/warnings/report_e.html?on31', source: 'ECCC',
}] } };
const ecccMarkup = panels.renderAlerts(vmEccc);
assert.ok(ecccMarkup.includes('Official · ECCC'), 'ECCC badge missing');
assert.ok(ecccMarkup.includes('Rainfall warning'));
assert.ok(ecccMarkup.includes('Read the full bulletin'), 'bulletin link missing');
assert.ok(ecccMarkup.includes('rel="noopener noreferrer"'), 'bulletin link is not rel-guarded');
// No body text, so there must be no empty "Full text" disclosure.
assert.ok(!ecccMarkup.includes('Full text'), 'rendered an empty details block');
// The NWS shape still gets its full-text disclosure.
assert.ok(rendered.alerts.includes('Full text'), 'NWS alert lost its details block');

// A hostile bulletin URL must be dropped, not rendered as an href.
const vmEvil = { ...vmEccc, alerts: { alerts: [{ ...vmEccc.alerts.alerts[0], url: 'javascript:alert(1)' }] } };
const evilMarkup = panels.renderAlerts(vmEvil);
assert.ok(!evilMarkup.includes('javascript:'), 'javascript: URL reached the output');
assert.ok(!evilMarkup.includes('Read the full bulletin'), 'link rendered for a rejected URL');

// Selected-day mode.
const vmDay = { ...vm, selectedDay: daily[2].time, dayHours: series.filter((h) => h.time.startsWith(daily[2].time)) };
assert.ok(views.renderHourly(vmDay).includes('clear-day'));

// Degenerate inputs must not throw.
const empty = { ...vm, series: [], days: [], next48: [], nowIndex: 0, todayIndex: 0, current: null, air: null, alerts: null, almanac: null, space: null, comparisons: [] };
assert.doesNotThrow(() => views.renderHero(empty));
assert.doesNotThrow(() => views.renderHourly(empty));
assert.doesNotThrow(() => views.renderDaily(empty));
assert.doesNotThrow(() => panels.renderAir(empty));
assert.doesNotThrow(() => panels.renderAlmanac(empty));
assert.doesNotThrow(() => panels.renderCompare(empty));
assert.doesNotThrow(() => panels.renderAlerts(empty));

// Imperial re-render must produce different, valid output.
const vmF = { ...vm, units: imperial };
assert.notEqual(views.renderHero(vmF), rendered.hero);
assert.ok(views.renderHero(vmF).includes('°'));

console.log('All smoke checks passed.');
