import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const trial = require('../api/_lib/monitoring/trial-store');

const city = {
  slug: 'toronto', label: 'Toronto, Ontario', latitude: 43.6532, longitude: -79.3832,
};

const weatherResponse = {
  weatherProvider: 'visual-crossing',
  weatherProviderFallback: false,
  weatherProviderQueryCost: 1,
  fetchedAt: '2026-08-24T10:00:00Z',
  location: { timezone: 'America/Toronto' },
  current: { time: '2026-08-25T09:30' },
  index: { hourly: -1 },
  hourly: {
    time: ['2026-08-25T09:00', '2026-08-25T10:00'],
    temperature_2m: [20, 21],
    precipitation: [0, 0.4],
    precipitation_probability: [20, 55],
    snowfall: [0, 0],
    wind_gusts_10m: [20, 25],
    weather_code: [3, 61],
  },
};

const normalizedResponse = trial.normalizedForecastFromWeatherResponse(weatherResponse);
assert.equal(normalizedResponse.provider, 'visual-crossing');
assert.equal(normalizedResponse.fallback, false);
assert.equal(normalizedResponse.hours.length, 2, 'a half-hour current time resolves to its containing hour');
assert.equal(normalizedResponse.hours[1].precipProbabilityPct, 55);

function forecast(fetchedAt, temperature, precipitationProbability) {
  return {
    provider: 'visual-crossing',
    fetchedAt,
    queryCost: 1,
    location: { timezone: 'America/Toronto' },
    hours: [
      {
        localTime: '2026-08-25T09:00', tempC: temperature, precipMm: 0,
        precipProbabilityPct: precipitationProbability, snowCm: 0, windGustKph: 20,
        weatherCode: 3, condition: 'Cloudy', icon: 'cloudy', precipTypes: [],
        secretProviderField: 'must-not-be-recorded',
      },
    ],
  };
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weatherview-monitoring-trial-'));
try {
  const baseline = trial.recordLocationSample({
    directory, city, forecast: forecast('2026-08-24T10:00:00Z', 20, 20),
  });
  assert.equal(baseline.baseline, true);
  assert.equal(baseline.comparison, null);

  const changed = trial.recordLocationSample({
    directory, city, forecast: forecast('2026-08-24T16:00:00Z', 24, 55),
  });
  assert.equal(changed.baseline, false);
  assert.equal(changed.comparison.material, true);
  assert.ok(changed.comparison.changes.some((change) => change.kind === 'temperature'));
  assert.ok(changed.comparison.changes.some((change) => change.kind === 'precip-probability'));

  const snapshot = JSON.parse(fs.readFileSync(path.join(directory, 'snapshots', 'toronto.json')));
  assert.equal(snapshot.hours[0].secretProviderField, undefined, 'snapshots keep only evaluator evidence');

  trial.recordTrialRun({
    directory,
    sampleAt: '2026-08-24T10:00:00Z',
    runId: '1',
    results: [baseline],
  });
  const recorded = trial.recordTrialRun({
    directory,
    sampleAt: '2026-08-24T16:00:00Z',
    runId: '2',
    results: [changed],
    failures: [{ city: 'ottawa', message: 'test failure' }],
  });

  assert.equal(recorded.summary.runs, 2);
  assert.equal(recorded.summary.comparisons, 1);
  assert.equal(recorded.summary.materialComparisons, 1);
  assert.equal(recorded.summary.materialRate, 1);
  assert.equal(recorded.summary.failures, 1);
  assert.deepEqual(recorded.summary.providers, { 'visual-crossing': 2 });
  assert.equal(recorded.summary.fallbackSamples, 0);
  assert.equal(recorded.summary.changeKinds.temperature, 1);
  assert.equal(recorded.summary.cities.toronto.samples, 2);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('All silent monitoring trial checks passed.');
