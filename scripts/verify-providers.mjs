#!/usr/bin/env node
/**
 * Live provider verification.
 *
 * Every upstream shape this app depends on, checked against the real
 * endpoints and reported as pass/fail. Run it from a machine with outbound
 * network access:
 *
 *   npm run verify                    # defaults to Ottawa
 *   npm run verify -- 43.65 -79.38    # any lat/lon
 *
 * Exit code is non-zero if a REQUIRED assumption fails. Optional providers
 * (radar, aurora) only warn, because the app already degrades gracefully
 * when they are down.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const eccc = require('../api/_lib/alerts/eccc.js');
const nws = require('../api/_lib/alerts/nws.js');

const [latArg, lonArg] = process.argv.slice(2);
const LAT = Number.parseFloat(latArg ?? '45.4215');
const LON = Number.parseFloat(lonArg ?? '-75.6972');

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', OFF = '\x1b[0m';
let failures = 0;
let warnings = 0;

function pass(name, detail = '') {
  console.log(`${GREEN}  PASS${OFF}  ${name}${detail ? ` ${DIM}${detail}${OFF}` : ''}`);
}
function fail(name, detail) {
  failures += 1;
  console.log(`${RED}  FAIL${OFF}  ${name}\n        ${detail}`);
}
function warn(name, detail) {
  warnings += 1;
  console.log(`${YELLOW}  WARN${OFF}  ${name}\n        ${detail}`);
}
function section(title) {
  console.log(`\n${title}`);
}

async function check(name, fn, { required = true } = {}) {
  try {
    const detail = await fn();
    pass(name, detail || '');
  } catch (error) {
    (required ? fail : warn)(name, error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(`Verifying upstream providers against ${LAT}, ${LON}`);

/* ------------------------------------------------------------ Open-Meteo */

section('Open-Meteo (required — the forecast itself)');

await check('forecast endpoint returns the fields the UI reads', async () => {
  const handlers = require('../api/_lib/handlers.js');
  const { body } = await handlers.forecast({ lat: LAT, lon: LON });

  assert(body.current, 'no current block');
  assert(body.hourly && Array.isArray(body.hourly.time), 'no hourly.time array');
  assert(body.daily && Array.isArray(body.daily.time), 'no daily.time array');
  assert(body.index.hourly >= 0, 'could not locate "now" in the hourly array');
  assert(body.index.daily >= 0, 'could not locate today in the daily array');

  for (const field of ['temperature_2m', 'apparent_temperature', 'weather_code', 'is_day']) {
    assert(body.current[field] !== undefined, `current.${field} missing`);
  }
  for (const field of ['uv_index', 'visibility', 'dew_point_2m', 'precipitation_probability']) {
    assert(Array.isArray(body.hourly[field]), `hourly.${field} missing`);
  }
  for (const field of ['sunrise', 'sunset', 'daylight_duration', 'uv_index_max']) {
    assert(Array.isArray(body.daily[field]), `daily.${field} missing`);
  }
  return `${body.hourly.time.length}h, ${body.daily.time.length}d, tz ${body.location.timezone}`;
});

await check('air quality attached to the forecast', async () => {
  const handlers = require('../api/_lib/handlers.js');
  const { body } = await handlers.forecast({ lat: LAT, lon: LON });
  assert(body.air && body.air.current, 'air.current missing');
  const index = body.air.current.us_aqi ?? body.air.current.european_aqi;
  assert(index !== undefined && index !== null, 'neither us_aqi nor european_aqi present');
  return `AQI ${Math.round(index)}`;
}, { required: false });

await check('almanac returns normals and records', async () => {
  const handlers = require('../api/_lib/handlers.js');
  const { body } = await handlers.almanac({ lat: LAT, lon: LON });
  assert(body.available, 'almanac reported unavailable (archive may be lagging)');
  assert(Number.isFinite(body.normalHigh), 'normalHigh is not a number');
  assert(body.recordHigh && Number.isFinite(body.recordHigh.value), 'recordHigh missing');
  return `${body.years}y, normal high ${body.normalHigh.toFixed(1)}°C`;
});

await check('geocoder returns usable places', async () => {
  const handlers = require('../api/_lib/handlers.js');
  const { body } = await handlers.geocode({ q: 'Ottawa' });
  assert(body.results.length > 0, 'no results for "Ottawa"');
  const [first] = body.results;
  assert(Number.isFinite(first.latitude) && Number.isFinite(first.longitude), 'result has no coordinates');
  return `${body.results.length} results, first: ${first.name}, ${first.admin1}`;
});

/* ------------------------------------------------------------------ ECCC */

section('Environment Canada (required in Canada)');

const { SITE_LIST, CITYPAGE, parseSiteList, parseWarnings, nearestSite } = eccc._internals;
let resolvedSite = null;

await check('site list is reachable and parses', async () => {
  const response = await fetch(SITE_LIST, { headers: { 'User-Agent': 'weatherview-verify/1.0' } });
  assert(response.ok, `HTTP ${response.status} from ${SITE_LIST}`);

  const csv = await response.text();
  const sites = parseSiteList(csv);
  assert(sites.length > 100, `parsed only ${sites.length} sites — the CSV format has probably changed`);

  const withBadCoords = sites.filter((s) => !Number.isFinite(s.latitude) || !Number.isFinite(s.longitude));
  assert(withBadCoords.length === 0, `${withBadCoords.length} sites have unparseable coordinates`);

  // Canada is entirely in the western hemisphere and north of the equator.
  const wrongHemisphere = sites.filter((s) => s.longitude > 0 || s.latitude < 0);
  assert(wrongHemisphere.length === 0,
    `${wrongHemisphere.length} sites landed in the wrong hemisphere, e.g. ${JSON.stringify(wrongHemisphere[0])}`);

  return `${sites.length} sites`;
});

await check('nearest site resolves for the target point', async () => {
  const response = await fetch(SITE_LIST, { headers: { 'User-Agent': 'weatherview-verify/1.0' } });
  const sites = parseSiteList(await response.text());
  resolvedSite = nearestSite(sites, LAT, LON);

  if (!eccc.covers(LAT, LON)) return 'point is outside Canada — skipped';
  assert(resolvedSite, 'no site within 150 km; ECCC alerts will be silent here');
  return `${resolvedSite.name}, ${resolvedSite.province} (${resolvedSite.distanceKm.toFixed(1)} km away)`;
});

await check('citypage XML is reachable and has the expected structure', async () => {
  if (!resolvedSite) return 'no site resolved — skipped';

  const url = CITYPAGE(resolvedSite.province, resolvedSite.code);
  const response = await fetch(url, { headers: { 'User-Agent': 'weatherview-verify/1.0' } });
  assert(response.ok, `HTTP ${response.status} from ${url}`);

  const doc = await response.text();
  assert(/<siteData/i.test(doc), 'response is not a citypage document');

  // The warnings element must exist even when nothing is in effect —
  // its absence would mean the schema moved.
  assert(/<warnings/i.test(doc), 'no <warnings> element: the citypage schema has changed');

  const alerts = parseWarnings(doc, resolvedSite);
  const active = /<event\b/i.test(doc);
  return active
    ? `${alerts.length} active alert(s): ${alerts.map((a) => a.event).join('; ') || '(all ended)'}`
    : 'no warnings in effect (schema present and correct)';
});

/* ------------------------------------------------------------------- NWS */

section('US National Weather Service (required in the US)');

await check('alerts endpoint responds with GeoJSON features', async () => {
  if (!nws.covers(LAT, LON)) return 'point is outside the US box — skipped';
  const alerts = await nws.fetchAlerts(LAT, LON);
  assert(Array.isArray(alerts), 'provider did not return an array');
  return `${alerts.length} active alert(s)`;
});

// Always probe a known-active-weather point so the shape gets exercised even
// when the user's own location is quiet or Canadian.
await check('alerts shape verified against a US reference point', async () => {
  const alerts = await nws.fetchAlerts(35.48, -97.53); // Oklahoma City
  assert(Array.isArray(alerts), 'provider did not return an array');
  if (!alerts.length) return 'no active alerts at the reference point right now';
  const [first] = alerts;
  for (const key of ['event', 'severity', 'source']) {
    assert(first[key], `alert missing ${key}`);
  }
  return `${alerts.length} alert(s), first: ${first.event} (${first.severity})`;
});

/* -------------------------------------------------------------- optional */

section('Optional panels (degrade gracefully — warnings only)');

await check('RainViewer frame index', async () => {
  const handlers = require('../api/_lib/handlers.js');
  const { body } = await handlers.radar();
  assert(body.available, 'RainViewer reported no frames');
  assert(body.host, 'no tile host returned');
  assert(body.frames.length > 0, 'frame list is empty');

  const [frame] = body.frames;
  assert(typeof frame.time === 'number', `frame.time is ${typeof frame.time}, expected number`);
  assert(typeof frame.path === 'string' && frame.path.startsWith('/'), `frame.path looks wrong: ${frame.path}`);

  // Confirm a real tile actually renders at the app's own URL template.
  const tile = `${body.host}${frame.path}/256/4/4/5/4/1_1.png`;
  const response = await fetch(tile);
  assert(response.ok, `tile request failed: HTTP ${response.status} for ${tile}`);
  const type = response.headers.get('content-type') || '';
  assert(type.includes('image'), `tile returned ${type}, not an image`);

  return `${body.frames.length} frames, tiles OK`;
}, { required: false });

await check('NOAA planetary K index', async () => {
  const handlers = require('../api/_lib/handlers.js');
  const { body } = await handlers.space();
  assert(body.available, 'SWPC reported unavailable');
  assert(Number.isFinite(body.kp), `kp is not a number: ${body.kp}`);
  assert(body.kp >= 0 && body.kp <= 9, `kp out of range: ${body.kp}`);
  return `Kp ${body.kp}`;
}, { required: false });

await check('CARTO base map tiles', async () => {
  const response = await fetch('https://basemaps.cartocdn.com/dark_all/5/9/11.png');
  assert(response.ok, `HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  assert(type.includes('image'), `returned ${type}, not an image`);
  return 'tiles OK';
}, { required: false });

await check('reverse geocoder', async () => {
  const handlers = require('../api/_lib/handlers.js');
  const { body } = await handlers.reverse({ lat: LAT, lon: LON });
  assert(body.name, 'no place name returned');
  return `${body.name}, ${body.country}`;
}, { required: false });

/* ----------------------------------------------------------------- done */

console.log('');
if (failures) {
  console.log(`${RED}${failures} required check(s) failed${OFF}${warnings ? `, ${warnings} warning(s)` : ''}.`);
  process.exit(1);
}
console.log(`${GREEN}All required checks passed${OFF}${warnings ? `, ${warnings} optional warning(s)` : ''}.`);
