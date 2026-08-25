#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const openMeteo = require('../api/_lib/weather-providers/open-meteo.js');
const visualCrossing = require('../api/_lib/weather-providers/visual-crossing.js');

const CITIES = {
  toronto: { name: 'Toronto', lat: 43.6532, lon: -79.3832 },
  ottawa: { name: 'Ottawa', lat: 45.4215, lon: -75.6972 },
  vancouver: { name: 'Vancouver', lat: 49.2827, lon: -123.1207 },
  'new-york': { name: 'New York', lat: 40.7128, lon: -74.006 },
  london: { name: 'London', lat: 51.5072, lon: -0.1276 },
  sydney: { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
};

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function location() {
  const cityKey = option('city', 'toronto').toLowerCase();
  const city = CITIES[cityKey];
  const lat = Number.parseFloat(option('lat', city?.lat));
  const lon = Number.parseFloat(option('lon', city?.lon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Unknown city "${cityKey}". Supply --lat and --lon, or use: ${Object.keys(CITIES).join(', ')}`);
  }
  return { name: city?.name || `${lat}, ${lon}`, lat, lon };
}

function meanAbsoluteDifference(pairs, field) {
  const values = pairs.flatMap(({ left, right }) => {
    const a = left[field] === null || left[field] === undefined ? Number.NaN : Number(left[field]);
    const b = right[field] === null || right[field] === undefined ? Number.NaN : Number(right[field]);
    return Number.isFinite(a) && Number.isFinite(b) ? [Math.abs(a - b)] : [];
  });
  return values.length
    ? { value: values.reduce((total, value) => total + value, 0) / values.length, samples: values.length }
    : { value: null, samples: 0 };
}

function formatMetric(metric, suffix) {
  return metric.value === null ? 'n/a' : `${metric.value.toFixed(2)}${suffix} (${metric.samples} aligned hours)`;
}

async function identifyFailure(provider, promise) {
  try {
    return await promise;
  } catch (error) {
    throw new Error(`${provider}: ${error.message}`);
  }
}

const apiKey = process.env.VISUAL_CROSSING_API_KEY;
if (!apiKey) {
  console.error('VISUAL_CROSSING_API_KEY is not set. Add it to Vercel Development, then run:');
  console.error('  vercel env run -- npm run providers:compare -- --city toronto');
  process.exit(1);
}

try {
  const place = location();
  const requestedHours = Math.min(192, Math.max(1, Number.parseInt(option('hours', '72'), 10) || 72));
  console.log(`Comparing ${place.name} (${place.lat}, ${place.lon}) for ${requestedHours} hours…`);

  const [open, visual] = await Promise.all([
    identifyFailure('Open-Meteo', openMeteo.fetchForecast(place)),
    identifyFailure('Visual Crossing', visualCrossing.fetchForecast({ ...place, apiKey })),
  ]);

  const visualByTime = new Map(visual.hours.map((hour) => [hour.localTime, hour]));
  const currentLocalHour = open.current?.localTime
    ? `${open.current.localTime.slice(0, 13)}:00`
    : open.hours[0]?.localTime;
  const pairs = open.hours
    .filter((hour) => !currentLocalHour || hour.localTime >= currentLocalHour)
    .slice(0, requestedHours)
    .flatMap((hour) => visualByTime.has(hour.localTime)
      ? [{ left: hour, right: visualByTime.get(hour.localTime) }]
      : []);

  console.log(`Open-Meteo:     ${open.hours.length} hours, timezone ${open.location.timezone}`);
  console.log(`Visual Crossing: ${visual.hours.length} hours, timezone ${visual.location.timezone}, queryCost ${visual.queryCost ?? 'unknown'}`);
  console.log(`Temperature MAD: ${formatMetric(meanAbsoluteDifference(pairs, 'tempC'), '°C')}`);
  console.log(`Precipitation probability MAD: ${formatMetric(meanAbsoluteDifference(pairs, 'precipProbabilityPct'), ' points')}`);
  console.log(`Wind-gust MAD:   ${formatMetric(meanAbsoluteDifference(pairs, 'windGustKph'), ' km/h')}`);
  console.log('No payloads were written. Repeat this command over changing weather before choosing the Pro provider.');
} catch (error) {
  // Upstream helpers intentionally omit request URLs, keeping provider keys out of errors.
  console.error(`Provider comparison failed: ${error.message}`);
  process.exit(1);
}
