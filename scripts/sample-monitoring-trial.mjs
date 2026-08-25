#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cities = require('../api/_lib/cities');
const trial = require('../api/_lib/monitoring/trial-store');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CITIES = ['toronto', 'ottawa', 'vancouver', 'new-york', 'london', 'sydney'];

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function selectedCities() {
  const requested = String(option('cities', process.env.MONITORING_TRIAL_CITIES || DEFAULT_CITIES.join(',')))
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
  const unique = [...new Set(requested)];
  const unknown = unique.filter((slug) => !cities.bySlug(slug));
  if (unknown.length) throw new Error(`Unknown monitoring trial cities: ${unknown.join(', ')}`);
  return unique.map((slug) => cities.bySlug(slug));
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const directory = path.resolve(option('directory', path.join(ROOT, 'monitoring-trial')));
  const origin = String(option(
    'origin',
    process.env.MONITORING_TRIAL_ORIGIN || 'https://www.weatherview.cloud'
  )).replace(/\/$/, '');
  const hours = Math.max(1, Math.min(192, Number.parseInt(option('hours', '72'), 10) || 72));
  const sampleAt = new Date().toISOString();
  const places = selectedCities();
  const results = [];
  const failures = [];

  for (const [index, city] of places.entries()) {
    try {
      const url = new URL('/api/weather', origin);
      url.searchParams.set('lat', String(city.latitude));
      url.searchParams.set('lon', String(city.longitude));
      const response = await fetch(url, {
        headers: { 'user-agent': 'WeatherView-Silent-Monitoring-Trial/1.0' },
      });
      if (!response.ok) throw new Error(`WeatherView API returned HTTP ${response.status}`);
      const forecast = trial.normalizedForecastFromWeatherResponse(await response.json());
      results.push(trial.recordLocationSample({ directory, city, forecast, hours }));
    } catch (error) {
      failures.push({ city: city.slug, message: error.message });
    }

    // The initial provider bake-off showed that parallel bursts can trigger
    // upstream throttling. Keep this background trial intentionally gentle.
    if (index < places.length - 1) await pause(250);
  }

  const runId = String(process.env.GITHUB_RUN_ID || '').replace(/[^a-zA-Z0-9-]/g, '');
  const { summary } = trial.recordTrialRun({ directory, sampleAt, runId, results, failures });

  for (const result of results) {
    const state = result.baseline
      ? 'baseline'
      : result.comparison.material
        ? `${result.comparison.changes.length} material change(s)`
        : 'no material change';
    const source = `${result.provider}${result.fallback ? ' fallback' : ''}`;
    console.log(`${result.city.label}: ${state}; ${result.comparison?.comparedHours || 0} aligned hours; ${source}`);
  }
  for (const failure of failures) console.warn(`${failure.city}: ${failure.message}`);
  console.log(`Trial total: ${summary.runs} runs, ${summary.comparisons} comparisons, ${summary.failures} failures`);

  if (!results.length) throw new Error('Every monitoring trial forecast failed');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
