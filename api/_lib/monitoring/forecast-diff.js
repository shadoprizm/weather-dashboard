'use strict';

const crypto = require('node:crypto');

const DEFAULT_THRESHOLDS = Object.freeze({
  temperatureC: 3,
  precipProbabilityPoints: 20,
  snowCm: 2,
  windGustKph: 15,
  precipTimingMinutes: 90,
});

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function withinWindow(hour, startLocal, endLocal) {
  if (!hour?.localTime) return false;
  return (!startLocal || hour.localTime >= startLocal) && (!endLocal || hour.localTime <= endLocal);
}

function alignedHours(previous, current, startLocal, endLocal) {
  const oldByTime = new Map(
    (previous.hours || [])
      .filter((hour) => withinWindow(hour, startLocal, endLocal))
      .map((hour) => [hour.localTime, hour])
  );

  return (current.hours || [])
    .filter((hour) => withinWindow(hour, startLocal, endLocal))
    .flatMap((hour) => oldByTime.has(hour.localTime)
      ? [{ localTime: hour.localTime, previous: oldByTime.get(hour.localTime), current: hour }]
      : []);
}

function largestDelta(pairs, field) {
  let winner = null;
  for (const pair of pairs) {
    const before = finite(pair.previous[field]);
    const after = finite(pair.current[field]);
    if (before === null || after === null) continue;
    const delta = after - before;
    if (!winner || Math.abs(delta) > Math.abs(winner.delta)) {
      winner = { localTime: pair.localTime, before, after, delta };
    }
  }
  return winner;
}

function sum(hours, field) {
  return hours.reduce((total, hour) => total + (finite(hour[field]) || 0), 0);
}

function firstWetHour(hours) {
  return hours.find((hour) =>
    (finite(hour.precipMm) || 0) >= 0.2 ||
    (finite(hour.snowCm) || 0) > 0 ||
    (finite(hour.precipProbabilityPct) || 0) >= 50
  )?.localTime || null;
}

function localMinuteNumber(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])
  ) / 60000;
}

function minuteDifference(a, b) {
  const left = localMinuteNumber(a);
  const right = localMinuteNumber(b);
  return left === null || right === null ? null : right - left;
}

function containsHazard(hour) {
  if ([66, 67, 95, 96, 99].includes(finite(hour.weatherCode))) return true;
  const words = [hour.condition, hour.icon, ...(hour.precipTypes || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /thunder|freezing|ice|hail/.test(words);
}

function compareForecasts(previous, current, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const startLocal = options.startLocal || null;
  const endLocal = options.endLocal || null;
  const pairs = alignedHours(previous, current, startLocal, endLocal);
  const oldHours = pairs.map((pair) => pair.previous);
  const newHours = pairs.map((pair) => pair.current);
  const changes = [];

  const temperature = largestDelta(pairs, 'tempC');
  if (temperature && Math.abs(temperature.delta) >= thresholds.temperatureC) {
    changes.push({ kind: 'temperature', ...temperature });
  }

  const precipProbability = largestDelta(pairs, 'precipProbabilityPct');
  if (precipProbability && Math.abs(precipProbability.delta) >= thresholds.precipProbabilityPoints) {
    changes.push({ kind: 'precip-probability', ...precipProbability });
  }

  const oldSnow = sum(oldHours, 'snowCm');
  const newSnow = sum(newHours, 'snowCm');
  if (Math.abs(newSnow - oldSnow) >= thresholds.snowCm) {
    changes.push({ kind: 'snow-total', before: oldSnow, after: newSnow, delta: newSnow - oldSnow });
  }

  const gust = largestDelta(pairs, 'windGustKph');
  if (gust && Math.abs(gust.delta) >= thresholds.windGustKph) {
    changes.push({ kind: 'wind-gust', ...gust });
  }

  const oldWet = firstWetHour(oldHours);
  const newWet = firstWetHour(newHours);
  const timingDelta = minuteDifference(oldWet, newWet);
  if (oldWet && newWet && timingDelta !== null && Math.abs(timingDelta) >= thresholds.precipTimingMinutes) {
    changes.push({
      kind: 'precip-timing', before: oldWet, after: newWet, deltaMinutes: timingDelta,
    });
  }

  const oldFreezing = oldHours.some((hour) => finite(hour.tempC) !== null && hour.tempC <= 0);
  const newFreezing = newHours.some((hour) => finite(hour.tempC) !== null && hour.tempC <= 0);
  if (oldFreezing !== newFreezing) {
    changes.push({ kind: 'freezing-threshold', before: oldFreezing, after: newFreezing });
  }

  const oldHazard = oldHours.some(containsHazard);
  const newHazard = newHours.some(containsHazard);
  if (oldHazard !== newHazard) {
    changes.push({ kind: 'hazard', before: oldHazard, after: newHazard });
  }

  const stableEvidence = JSON.stringify({ startLocal, endLocal, changes });
  const fingerprint = crypto.createHash('sha256').update(stableEvidence).digest('hex').slice(0, 24);

  return {
    material: changes.length > 0,
    fingerprint,
    comparedHours: pairs.length,
    window: { startLocal, endLocal },
    previousFetchedAt: previous.fetchedAt || null,
    currentFetchedAt: current.fetchedAt || null,
    changes,
  };
}

module.exports = { compareForecasts, DEFAULT_THRESHOLDS, _internals: { minuteDifference, firstWetHour } };
