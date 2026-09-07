import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compareForecasts } = require('../api/_lib/monitoring/forecast-diff.js');

function forecast(fetchedAt, hours) {
  return { provider: 'fixture', fetchedAt, hours };
}

const previous = forecast('2026-08-22T10:00:00Z', [
  { localTime: '2026-08-23T08:00', tempC: 4, precipMm: 1, precipProbabilityPct: 60, snowCm: 0, windGustKph: 20 },
  { localTime: '2026-08-23T09:00', tempC: 3, precipMm: 0.4, precipProbabilityPct: 55, snowCm: 0, windGustKph: 25 },
  { localTime: '2026-08-23T10:00', tempC: 2, precipMm: 0, precipProbabilityPct: 10, snowCm: 0, windGustKph: 30 },
  { localTime: '2026-08-23T11:00', tempC: 2, precipMm: 0, precipProbabilityPct: 10, snowCm: 0, windGustKph: 30 },
  { localTime: '2026-08-23T12:00', tempC: 2, precipMm: 0, precipProbabilityPct: 10, snowCm: 0, windGustKph: 30 },
]);

const current = forecast('2026-08-22T11:00:00Z', [
  { localTime: '2026-08-23T08:00', tempC: -1, precipMm: 0, precipProbabilityPct: 10, snowCm: 0, windGustKph: 20 },
  { localTime: '2026-08-23T09:00', tempC: -1, precipMm: 0, precipProbabilityPct: 20, snowCm: 0, windGustKph: 25 },
  { localTime: '2026-08-23T10:00', tempC: 1, precipMm: 0, precipProbabilityPct: 10, snowCm: 0, windGustKph: 30 },
  { localTime: '2026-08-23T11:00', tempC: 1, precipMm: 1, precipProbabilityPct: 70, snowCm: 3, windGustKph: 50, condition: 'Freezing rain' },
  { localTime: '2026-08-23T12:00', tempC: 1, precipMm: 0.5, precipProbabilityPct: 65, snowCm: 0, windGustKph: 50, condition: 'Freezing rain' },
]);

const changed = compareForecasts(previous, current, {
  startLocal: '2026-08-23T08:00',
  endLocal: '2026-08-23T12:00',
});

assert.equal(changed.material, true);
assert.equal(changed.policyVersion, 2);
assert.equal(changed.policy.thresholds.persistentHours, 2);
assert.equal(changed.comparedHours, 5);
assert.ok(changed.changes.some((change) => change.kind === 'temperature'));
assert.ok(changed.changes.some((change) => change.kind === 'precip-probability'));
assert.ok(changed.changes.some((change) => change.kind === 'snow-total'));
assert.ok(changed.changes.some((change) => change.kind === 'wind-gust'));
assert.ok(changed.changes.some((change) => change.kind === 'precip-timing' && change.deltaMinutes === 180));
assert.ok(changed.changes.some((change) => change.kind === 'freezing-threshold'));
assert.ok(changed.changes.some((change) => change.kind === 'hazard'));
for (const change of changed.changes) assert.match(change.eventKey, /^[a-f0-9]{24}$/);

// Fetch timestamps are metadata, not notification identity: retries must deduplicate.
const retried = compareForecasts(previous, { ...current, fetchedAt: '2026-08-22T11:05:00Z' }, {
  startLocal: '2026-08-23T08:00',
  endLocal: '2026-08-23T12:00',
});
assert.equal(retried.fingerprint, changed.fingerprint);
assert.deepEqual(
  retried.changes.map((change) => change.eventKey),
  changed.changes.map((change) => change.eventKey),
  'event identity ignores fetch timestamps'
);

const outsideWindow = compareForecasts(previous, current, {
  startLocal: '2026-08-23T07:00',
  endLocal: '2026-08-23T07:30',
});
assert.equal(outsideWindow.material, false);
assert.equal(outsideWindow.comparedHours, 0);

const identical = compareForecasts(previous, { ...previous, fetchedAt: 'later' });
assert.equal(identical.material, false);

const isolatedNoise = compareForecasts(
  forecast('before', [
    { localTime: '2026-08-23T12:00', precipProbabilityPct: 10 },
    { localTime: '2026-08-23T13:00', precipProbabilityPct: 10 },
  ]),
  forecast('after', [
    { localTime: '2026-08-23T12:00', precipProbabilityPct: 80 },
    { localTime: '2026-08-23T13:00', precipProbabilityPct: 12 },
  ])
);
assert.equal(isolatedNoise.material, false, 'one-hour forecast jitter is not material by default');
assert.equal(compareForecasts(
  forecast('before', [{ localTime: '2026-08-23T12:00', precipProbabilityPct: 10 }]),
  forecast('after', [{ localTime: '2026-08-23T12:00', precipProbabilityPct: 80 }]),
  { thresholds: { persistentHours: 1 } }
).material, true, 'an explicit one-hour watch can opt out of persistence');

const newPrecipitation = compareForecasts(
  forecast('before', [
    { localTime: '2026-08-23T12:00', precipProbabilityPct: 10 },
    { localTime: '2026-08-23T13:00', precipProbabilityPct: 10 },
  ]),
  forecast('after', [
    { localTime: '2026-08-23T12:00', precipProbabilityPct: 70 },
    { localTime: '2026-08-23T13:00', precipProbabilityPct: 70 },
  ])
);
assert.ok(newPrecipitation.changes.some((change) => change.kind === 'precip-transition'));

const wmoHazard = compareForecasts(
  forecast('before', [{ localTime: '2026-08-23T12:00', weatherCode: 3 }]),
  forecast('after', [{ localTime: '2026-08-23T12:00', weatherCode: 95 }])
);
assert.ok(wmoHazard.changes.some((change) => change.kind === 'hazard'));

console.log('All forecast-monitoring tests passed.');
