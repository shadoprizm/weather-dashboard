import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compareForecasts } = require('../api/_lib/monitoring/forecast-diff.js');

function forecast(fetchedAt, hours) {
  return { provider: 'fixture', fetchedAt, hours };
}

const previous = forecast('2026-08-22T10:00:00Z', [
  { localTime: '2026-08-23T08:00', tempC: 4, precipMm: 1, precipProbabilityPct: 60, snowCm: 0, windGustKph: 20 },
  { localTime: '2026-08-23T09:00', tempC: 3, precipMm: 0, precipProbabilityPct: 30, snowCm: 0, windGustKph: 25 },
  { localTime: '2026-08-23T10:00', tempC: 2, precipMm: 0, precipProbabilityPct: 10, snowCm: 0, windGustKph: 30 },
]);

const current = forecast('2026-08-22T11:00:00Z', [
  { localTime: '2026-08-23T08:00', tempC: -1, precipMm: 0, precipProbabilityPct: 10, snowCm: 0, windGustKph: 20 },
  { localTime: '2026-08-23T09:00', tempC: 0, precipMm: 0, precipProbabilityPct: 20, snowCm: 0, windGustKph: 25 },
  { localTime: '2026-08-23T10:00', tempC: 1, precipMm: 1, precipProbabilityPct: 70, snowCm: 3, windGustKph: 50, condition: 'Freezing rain' },
]);

const changed = compareForecasts(previous, current, {
  startLocal: '2026-08-23T08:00',
  endLocal: '2026-08-23T10:00',
});

assert.equal(changed.material, true);
assert.equal(changed.comparedHours, 3);
assert.ok(changed.changes.some((change) => change.kind === 'temperature'));
assert.ok(changed.changes.some((change) => change.kind === 'precip-probability'));
assert.ok(changed.changes.some((change) => change.kind === 'snow-total'));
assert.ok(changed.changes.some((change) => change.kind === 'wind-gust'));
assert.ok(changed.changes.some((change) => change.kind === 'precip-timing' && change.deltaMinutes === 120));
assert.ok(changed.changes.some((change) => change.kind === 'freezing-threshold'));
assert.ok(changed.changes.some((change) => change.kind === 'hazard'));

// Fetch timestamps are metadata, not notification identity: retries must deduplicate.
const retried = compareForecasts(previous, { ...current, fetchedAt: '2026-08-22T11:05:00Z' }, {
  startLocal: '2026-08-23T08:00',
  endLocal: '2026-08-23T10:00',
});
assert.equal(retried.fingerprint, changed.fingerprint);

const outsideWindow = compareForecasts(previous, current, {
  startLocal: '2026-08-23T07:00',
  endLocal: '2026-08-23T07:30',
});
assert.equal(outsideWindow.material, false);
assert.equal(outsideWindow.comparedHours, 0);

const identical = compareForecasts(previous, { ...previous, fetchedAt: 'later' });
assert.equal(identical.material, false);

const wmoHazard = compareForecasts(
  forecast('before', [{ localTime: '2026-08-23T12:00', weatherCode: 3 }]),
  forecast('after', [{ localTime: '2026-08-23T12:00', weatherCode: 95 }])
);
assert.ok(wmoHazard.changes.some((change) => change.kind === 'hazard'));

console.log('All forecast-monitoring tests passed.');
