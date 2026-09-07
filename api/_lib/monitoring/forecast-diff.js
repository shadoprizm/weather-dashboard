'use strict';

const crypto = require('node:crypto');
const POLICY_VERSION = 2;

const DEFAULT_THRESHOLDS = Object.freeze({
  temperatureC: 4,
  precipProbabilityPoints: 30,
  snowCm: 2,
  windGustKph: 20,
  precipTimingMinutes: 180,
  persistentHours: 2,
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

function consecutiveHours(left, right) {
  const difference = minuteDifference(left?.localTime, right?.localTime);
  return difference === 60;
}

/**
 * Return the strongest change that persists in the same direction for the
 * required number of adjacent hours. Forecast providers commonly move one
 * isolated hourly value between runs; that is useful evidence, but too noisy
 * to wake a customer over.
 */
function sustainedDelta(pairs, field, threshold, persistentHours) {
  const required = Math.max(1, Number.parseInt(persistentHours, 10) || 1);
  if (required === 1) {
    const winner = largestDelta(pairs, field);
    return winner && Math.abs(winner.delta) >= threshold
      ? { ...winner, persistentHours: 1 }
      : null;
  }

  let winner = null;
  for (let start = 0; start < pairs.length; start += 1) {
    const run = [];
    let direction = 0;
    for (let index = start; index < pairs.length; index += 1) {
      if (index > start && !consecutiveHours(pairs[index - 1], pairs[index])) break;
      const before = finite(pairs[index].previous[field]);
      const after = finite(pairs[index].current[field]);
      if (before === null || after === null) break;
      const delta = after - before;
      const nextDirection = Math.sign(delta);
      if (Math.abs(delta) < threshold || nextDirection === 0) break;
      if (direction && nextDirection !== direction) break;
      direction = nextDirection;
      run.push({ localTime: pairs[index].localTime, before, after, delta });
    }

    if (run.length < required) continue;
    const strongest = run.reduce((best, item) =>
      Math.abs(item.delta) > Math.abs(best.delta) ? item : best
    );
    const candidate = { ...strongest, persistentHours: run.length };
    if (!winner || Math.abs(candidate.delta) > Math.abs(winner.delta)) winner = candidate;
  }
  return winner;
}

function sum(hours, field) {
  return hours.reduce((total, hour) => total + (finite(hour[field]) || 0), 0);
}

function isWet(hour) {
  return (finite(hour?.precipMm) || 0) >= 0.2 ||
    (finite(hour?.snowCm) || 0) > 0 ||
    (finite(hour?.precipProbabilityPct) || 0) >= 50;
}

function firstWetHour(hours, persistentHours = 2) {
  const required = Math.max(1, Number.parseInt(persistentHours, 10) || 1);
  for (let start = 0; start < hours.length; start += 1) {
    if (!isWet(hours[start])) continue;
    let length = 1;
    while (
      length < required &&
      isWet(hours[start + length]) &&
      consecutiveHours(hours[start + length - 1], hours[start + length])
    ) length += 1;
    if (length >= required) return hours[start].localTime;
  }
  return null;
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

function firstMatchingHour(hours, predicate, persistentHours = 1) {
  const required = Math.max(1, Number.parseInt(persistentHours, 10) || 1);
  for (let start = 0; start < hours.length; start += 1) {
    if (!predicate(hours[start])) continue;
    let length = 1;
    while (
      length < required &&
      predicate(hours[start + length]) &&
      consecutiveHours(hours[start + length - 1], hours[start + length])
    ) length += 1;
    if (length >= required) return hours[start].localTime;
  }
  return null;
}

function directionOf(change) {
  if (typeof change.after === 'boolean') return change.after ? 'started' : 'ended';
  const delta = finite(change.delta ?? change.deltaMinutes);
  if (delta === null || delta === 0) return 'changed';
  return delta > 0 ? 'increased' : 'decreased';
}

function withEventKey(change) {
  const identity = {
    kind: change.kind,
    localTime: change.localTime || change.after || change.before || null,
    direction: directionOf(change),
  };
  return {
    ...change,
    eventKey: crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24),
  };
}

function compareForecasts(previous, current, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const startLocal = options.startLocal || null;
  const endLocal = options.endLocal || null;
  const pairs = alignedHours(previous, current, startLocal, endLocal);
  const oldHours = pairs.map((pair) => pair.previous);
  const newHours = pairs.map((pair) => pair.current);
  const changes = [];

  const temperature = sustainedDelta(
    pairs, 'tempC', thresholds.temperatureC, thresholds.persistentHours
  );
  if (temperature) {
    changes.push({ kind: 'temperature', ...temperature });
  }

  const precipProbability = sustainedDelta(
    pairs, 'precipProbabilityPct', thresholds.precipProbabilityPoints, thresholds.persistentHours
  );
  if (precipProbability) {
    changes.push({ kind: 'precip-probability', ...precipProbability });
  }

  const oldSnow = sum(oldHours, 'snowCm');
  const newSnow = sum(newHours, 'snowCm');
  if (Math.abs(newSnow - oldSnow) >= thresholds.snowCm) {
    changes.push({ kind: 'snow-total', before: oldSnow, after: newSnow, delta: newSnow - oldSnow });
  }

  const gust = sustainedDelta(
    pairs, 'windGustKph', thresholds.windGustKph, thresholds.persistentHours
  );
  if (gust) {
    changes.push({ kind: 'wind-gust', ...gust });
  }

  const oldWet = firstWetHour(oldHours, thresholds.persistentHours);
  const newWet = firstWetHour(newHours, thresholds.persistentHours);
  const timingDelta = minuteDifference(oldWet, newWet);
  if (Boolean(oldWet) !== Boolean(newWet)) {
    changes.push({
      kind: 'precip-transition',
      localTime: newWet || oldWet,
      before: Boolean(oldWet),
      after: Boolean(newWet),
    });
  } else if (oldWet && newWet && timingDelta !== null && Math.abs(timingDelta) >= thresholds.precipTimingMinutes) {
    changes.push({
      kind: 'precip-timing', before: oldWet, after: newWet, deltaMinutes: timingDelta,
    });
  }

  const freezing = (hour) => finite(hour?.tempC) !== null && finite(hour.tempC) <= 0;
  const oldFreezingAt = firstMatchingHour(oldHours, freezing, thresholds.persistentHours);
  const newFreezingAt = firstMatchingHour(newHours, freezing, thresholds.persistentHours);
  const oldFreezing = Boolean(oldFreezingAt);
  const newFreezing = Boolean(newFreezingAt);
  if (oldFreezing !== newFreezing) {
    changes.push({
      kind: 'freezing-threshold',
      localTime: newFreezingAt || oldFreezingAt,
      before: oldFreezing,
      after: newFreezing,
    });
  }

  // A thunderstorm or freezing-precipitation code is already a high-severity
  // signal, so it does not need the two-hour persistence rule.
  const oldHazardAt = firstMatchingHour(oldHours, containsHazard, 1);
  const newHazardAt = firstMatchingHour(newHours, containsHazard, 1);
  const oldHazard = Boolean(oldHazardAt);
  const newHazard = Boolean(newHazardAt);
  if (oldHazard !== newHazard) {
    changes.push({
      kind: 'hazard',
      localTime: newHazardAt || oldHazardAt,
      before: oldHazard,
      after: newHazard,
    });
  }

  const keyedChanges = changes.map(withEventKey);
  const stableEvidence = JSON.stringify({ startLocal, endLocal, changes: keyedChanges });
  const fingerprint = crypto.createHash('sha256').update(stableEvidence).digest('hex').slice(0, 24);

  return {
    policyVersion: POLICY_VERSION,
    policy: { thresholds },
    material: keyedChanges.length > 0,
    fingerprint,
    comparedHours: pairs.length,
    window: { startLocal, endLocal },
    previousFetchedAt: previous.fetchedAt || null,
    currentFetchedAt: current.fetchedAt || null,
    changes: keyedChanges,
  };
}

module.exports = {
  compareForecasts,
  DEFAULT_THRESHOLDS,
  POLICY_VERSION,
  _internals: { minuteDifference, firstWetHour, sustainedDelta },
};
