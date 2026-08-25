'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { compareForecasts } = require('./forecast-diff');

const HOUR_FIELDS = [
  'localTime', 'tempC', 'precipMm', 'precipProbabilityPct', 'snowCm',
  'windGustKph', 'weatherCode', 'condition', 'icon', 'precipTypes',
];

function safeSegment(value) {
  const segment = String(value || '').toLowerCase();
  if (!/^[a-z0-9-]+$/.test(segment)) throw new Error(`Invalid trial segment: ${value}`);
  return segment;
}

function compactForecast(forecast, { hours = 72 } = {}) {
  if (!forecast || !Array.isArray(forecast.hours)) {
    throw new Error('A normalized forecast with hourly data is required');
  }

  const limit = Math.max(1, Math.min(192, Number.parseInt(hours, 10) || 72));
  return {
    provider: forecast.provider || 'unknown',
    fallback: forecast.fallback === true,
    fetchedAt: forecast.fetchedAt || new Date().toISOString(),
    queryCost: Number.isFinite(forecast.queryCost) ? forecast.queryCost : null,
    timezone: forecast.location?.timezone || null,
    hours: forecast.hours
      .filter((hour) => hour?.localTime)
      .slice(0, limit)
      .map((hour) => Object.fromEntries(HOUR_FIELDS.map((field) => [field, hour[field] ?? null]))),
  };
}

function normalizedForecastFromWeatherResponse(data) {
  if (!data?.hourly || !Array.isArray(data.hourly.time)) {
    throw new Error('WeatherView returned no hourly forecast');
  }

  const currentHour = data.current?.time
    ? `${String(data.current.time).slice(0, 13)}:00`
    : null;
  const suppliedIndex = Number.isInteger(data.index?.hourly) ? data.index.hourly : -1;
  const resolvedIndex = suppliedIndex >= 0
    ? suppliedIndex
    : Math.max(0, currentHour ? data.hourly.time.indexOf(currentHour) : 0);
  const valueAt = (field, index) => Array.isArray(data.hourly[field])
    ? data.hourly[field][index] ?? null
    : null;

  return {
    provider: data.weatherProvider || 'unknown',
    fallback: data.weatherProviderFallback === true,
    fetchedAt: data.fetchedAt || new Date().toISOString(),
    queryCost: Number.isFinite(data.weatherProviderQueryCost)
      ? data.weatherProviderQueryCost
      : null,
    location: data.location || null,
    hours: data.hourly.time.slice(resolvedIndex).map((localTime, offset) => {
      const index = resolvedIndex + offset;
      return {
        localTime,
        tempC: valueAt('temperature_2m', index),
        precipMm: valueAt('precipitation', index),
        precipProbabilityPct: valueAt('precipitation_probability', index),
        snowCm: valueAt('snowfall', index),
        windGustKph: valueAt('wind_gusts_10m', index),
        weatherCode: valueAt('weather_code', index),
        condition: null,
        icon: null,
        precipTypes: null,
      };
    }),
  };
}

function readJson(filename) {
  if (!fs.existsSync(filename)) return null;
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, filename);
}

function recordLocationSample({ directory, city, forecast, hours = 72 }) {
  const slug = safeSegment(city?.slug);
  const snapshotFile = path.join(directory, 'snapshots', `${slug}.json`);
  const previous = readJson(snapshotFile);
  const current = compactForecast(forecast, { hours });
  const comparison = previous ? compareForecasts(previous, current) : null;

  writeJsonAtomic(snapshotFile, current);
  return {
    city: {
      slug,
      label: city.label || city.name || slug,
      latitude: city.latitude,
      longitude: city.longitude,
    },
    provider: current.provider,
    fallback: current.fallback,
    fetchedAt: current.fetchedAt,
    queryCost: current.queryCost,
    baseline: comparison === null,
    comparison,
  };
}

function runFilename(sampleAt, runId = '') {
  const timestamp = String(sampleAt).replace(/[:.]/g, '-');
  const suffix = runId ? `-${safeSegment(runId)}` : '';
  return `${timestamp}${suffix}.json`;
}

function listRuns(directory) {
  const runsDirectory = path.join(directory, 'runs');
  if (!fs.existsSync(runsDirectory)) return [];
  return fs.readdirSync(runsDirectory)
    .filter((filename) => filename.endsWith('.json'))
    .sort()
    .map((filename) => readJson(path.join(runsDirectory, filename)))
    .filter(Boolean);
}

function summarizeRuns(runs) {
  const changeKinds = {};
  const cities = {};
  let baselines = 0;
  let comparisons = 0;
  let materialComparisons = 0;
  let failures = 0;
  let fallbackSamples = 0;
  const providers = {};

  for (const run of runs) {
    failures += run.failures?.length || 0;
    for (const result of run.results || []) {
      const slug = result.city.slug;
      if (!cities[slug]) {
        cities[slug] = { label: result.city.label, samples: 0, comparisons: 0, material: 0 };
      }
      cities[slug].samples += 1;
      providers[result.provider] = (providers[result.provider] || 0) + 1;
      if (result.fallback) fallbackSamples += 1;

      if (result.baseline || !result.comparison) {
        baselines += 1;
        continue;
      }

      comparisons += 1;
      cities[slug].comparisons += 1;
      if (result.comparison.material) {
        materialComparisons += 1;
        cities[slug].material += 1;
      }
      for (const change of result.comparison.changes || []) {
        changeKinds[change.kind] = (changeKinds[change.kind] || 0) + 1;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    runs: runs.length,
    locationSamples: Object.values(cities).reduce((total, city) => total + city.samples, 0),
    baselines,
    comparisons,
    materialComparisons,
    materialRate: comparisons ? materialComparisons / comparisons : null,
    failures,
    providers,
    fallbackSamples,
    changeKinds,
    cities,
  };
}

function recordTrialRun({ directory, sampleAt = new Date().toISOString(), runId = '', results, failures = [] }) {
  const run = { schemaVersion: 1, sampleAt, results, failures };
  const filename = path.join(directory, 'runs', runFilename(sampleAt, runId));
  writeJsonAtomic(filename, run);

  const summary = summarizeRuns(listRuns(directory));
  writeJsonAtomic(path.join(directory, 'summary.json'), summary);
  return { run, summary, filename };
}

module.exports = {
  HOUR_FIELDS,
  compactForecast,
  normalizedForecastFromWeatherResponse,
  recordLocationSample,
  recordTrialRun,
  listRuns,
  summarizeRuns,
};
