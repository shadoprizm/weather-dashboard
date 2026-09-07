import assert from 'node:assert/strict';
import {
  WATCH_PRESETS,
  normalizeForecast,
  compareWatchForecasts,
  saveWatch,
  getWatch,
  removeWatch,
  evaluateAndRecord,
  describeWatchEvent,
} from '../js/weather-watch.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function payload({ fetchedAt = '2026-09-07T10:00:00Z', pop = [10, 10, 10], temp = [5, 5, 5], gust = [20, 20, 20], code = [3, 3, 3], snow = [0, 0, 0] } = {}) {
  return {
    fetchedAt,
    hourly: {
      time: ['2026-09-08T10:00', '2026-09-08T11:00', '2026-09-08T12:00'],
      temperature_2m: temp,
      precipitation: [0, 0, 0],
      precipitation_probability: pop,
      snowfall: snow,
      wind_gusts_10m: gust,
      weather_code: code,
    },
  };
}

const place = { name: 'Ottawa', admin1: 'Ontario', latitude: 45.42, longitude: -75.7 };
const baseline = normalizeForecast(payload());
const changed = normalizeForecast(payload({
  fetchedAt: '2026-09-07T11:00:00Z',
  pop: [70, 75, 10],
  temp: [-2, -2, 5],
  gust: [55, 55, 20],
  code: [95, 3, 3],
}));
const events = compareWatchForecasts(baseline, changed);

assert.deepEqual(Object.keys(WATCH_PRESETS), ['all', 'rain', 'freezing', 'wind']);
assert.ok(events.some((event) => event.kind === 'precip-probability'));
assert.ok(events.some((event) => event.kind === 'freezing-threshold'));
assert.ok(events.some((event) => event.kind === 'wind-gust'));
assert.ok(events.some((event) => event.kind === 'wind-threshold'));
assert.ok(events.some((event) => event.kind === 'hazard'));
assert.ok(events.every((event) => event.eventKey));
assert.ok(describeWatchEvent(events[0]).endsWith('.'));

const newRain = compareWatchForecasts(
  baseline,
  normalizeForecast(payload({ pop: [70, 75, 10] }))
);
assert.ok(newRain.some((event) => event.kind === 'precip-transition'),
  'a persistent new precipitation window is material');

const isolated = compareWatchForecasts(
  baseline,
  normalizeForecast(payload({ pop: [80, 10, 10], temp: [-2, 5, 5], gust: [60, 20, 20] }))
);
assert.ok(!isolated.some((event) => ['precip-probability', 'freezing-threshold', 'wind-gust', 'wind-threshold'].includes(event.kind)),
  'single-hour jitter must not create a persistent candidate');

const storage = memoryStorage();
saveWatch({ place, preset: 'rain', data: payload() }, storage);
assert.equal(getWatch(place, storage).preset, 'rain');
const recorded = evaluateAndRecord({ place, data: payload({ fetchedAt: '2026-09-07T11:00:00Z', pop: [70, 75, 10] }) }, storage);
assert.deepEqual(recorded.newEvents.map((event) => event.kind), ['precip-probability', 'precip-transition']);
assert.equal(getWatch(place, storage).events.length, 2);

const retried = evaluateAndRecord({ place, data: payload({ fetchedAt: '2026-09-07T11:05:00Z', pop: [70, 75, 10] }) }, storage);
assert.equal(retried.newEvents.length, 0, 'a repeated forecast does not duplicate an event');
assert.equal(removeWatch(place, storage), true);
assert.equal(getWatch(place, storage), null);

console.log('All device-local weather-watch checks passed.');
