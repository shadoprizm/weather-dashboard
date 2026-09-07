/**
 * Silent, device-local forecast watches.
 *
 * This is the product beta for the deterministic monitoring rules. It does
 * not create an account, contact a server, request notification permission or
 * claim to run while the browser is closed. A compact forecast baseline and
 * candidate events live only in localStorage.
 */

const STORAGE_KEY = 'weatherview.watch-beta.v1';
const MAX_WATCHES = 10;
const MAX_EVENTS = 20;
const WINDOW_HOURS = 36;

export const WATCH_PRESETS = Object.freeze({
  all: {
    label: 'Any major change',
    description: 'Rain timing or chance, snow, freezing, strong gusts, or a hazardous condition.',
  },
  rain: {
    label: 'Rain or snow',
    description: 'A large chance change, a three-hour timing move, or 2 cm more or less snow.',
  },
  freezing: {
    label: 'Freezing conditions',
    description: 'Two forecast hours cross 0 °C, or freezing precipitation appears or disappears.',
  },
  wind: {
    label: 'Strong wind',
    description: 'Gusts cross 50 km/h or change by at least 20 km/h for two hours.',
  },
});

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function read(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    return parsed && parsed.version === 1 && parsed.watches ? parsed : { version: 1, watches: {} };
  } catch (error) {
    return { version: 1, watches: {} };
  }
}

function write(store, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    return false;
  }
}

export function watchKey(place) {
  return `${Number(place.latitude).toFixed(3)},${Number(place.longitude).toFixed(3)}`;
}

export function getWatch(place, storage) {
  return read(storage).watches[watchKey(place)] || null;
}

export function listWatches(storage) {
  return Object.values(read(storage).watches);
}

export function normalizeForecast(data, { hours = WINDOW_HOURS } = {}) {
  const hourly = data?.hourly || {};
  const start = Number.isInteger(data?.index?.hourly) && data.index.hourly >= 0 ? data.index.hourly : 0;
  const times = Array.isArray(hourly.time) ? hourly.time.slice(start, start + hours) : [];
  const value = (field, index) => finite(hourly[field]?.[index]);

  return {
    fetchedAt: data?.fetchedAt || new Date().toISOString(),
    hours: times.map((localTime, offset) => {
      const index = start + offset;
      return {
        localTime,
        tempC: value('temperature_2m', index),
        precipMm: value('precipitation', index),
        precipProbabilityPct: value('precipitation_probability', index),
        snowCm: value('snowfall', index),
        windGustKph: value('wind_gusts_10m', index),
        weatherCode: value('weather_code', index),
      };
    }),
  };
}

function minuteNumber(localTime) {
  const match = String(localTime || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return match
    ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60000
    : null;
}

function minuteDifference(before, after) {
  const left = minuteNumber(before);
  const right = minuteNumber(after);
  return left === null || right === null ? null : right - left;
}

function adjacent(left, right) {
  return minuteDifference(left?.localTime, right?.localTime) === 60;
}

function pairs(previous, current) {
  const old = new Map(previous.hours.map((hour) => [hour.localTime, hour]));
  return current.hours
    .filter((hour) => old.has(hour.localTime))
    .map((hour) => ({ localTime: hour.localTime, previous: old.get(hour.localTime), current: hour }));
}

function sustainedDelta(overlap, field, threshold) {
  let winner = null;
  for (let start = 0; start < overlap.length - 1; start += 1) {
    const first = overlap[start];
    const second = overlap[start + 1];
    if (!adjacent(first, second)) continue;
    const deltas = [first, second].map((pair) => {
      const before = finite(pair.previous[field]);
      const after = finite(pair.current[field]);
      return before === null || after === null ? null : after - before;
    });
    if (deltas.some((delta) => delta === null || Math.abs(delta) < threshold)) continue;
    if (Math.sign(deltas[0]) !== Math.sign(deltas[1])) continue;
    const strongest = Math.abs(deltas[1]) > Math.abs(deltas[0]) ? second : first;
    const delta = Math.abs(deltas[1]) > Math.abs(deltas[0]) ? deltas[1] : deltas[0];
    if (!winner || Math.abs(delta) > Math.abs(winner.delta)) {
      winner = { localTime: strongest.localTime, delta };
    }
  }
  return winner;
}

function firstPersistent(hours, predicate, required = 2) {
  for (let start = 0; start < hours.length; start += 1) {
    if (!predicate(hours[start])) continue;
    let count = 1;
    while (count < required && predicate(hours[start + count]) && adjacent(hours[start + count - 1], hours[start + count])) {
      count += 1;
    }
    if (count >= required) return hours[start].localTime;
  }
  return null;
}

function isWet(hour) {
  return (finite(hour?.precipMm) || 0) >= 0.2 ||
    (finite(hour?.snowCm) || 0) > 0 ||
    (finite(hour?.precipProbabilityPct) || 0) >= 50;
}

function isHazard(hour) {
  const code = finite(hour?.weatherCode);
  return code !== null && (code >= 95 || [56, 57, 66, 67].includes(code));
}

function total(hours, field) {
  return hours.reduce((sum, hour) => sum + (finite(hour[field]) || 0), 0);
}

function event(kind, values) {
  const direction = values.after === true ? 'started'
    : values.after === false ? 'ended'
      : finite(values.delta ?? values.deltaMinutes) >= 0 ? 'increased' : 'decreased';
  const numericAnchor = finite(values.after) === null ? finite(values.before) : finite(values.after);
  const anchor = values.localTime || values.afterTime || values.beforeTime ||
    (numericAnchor === null ? '' : numericAnchor);
  return {
    kind,
    ...values,
    eventKey: [kind, anchor, direction].join('|'),
  };
}

export function compareWatchForecasts(previous, current) {
  const overlap = pairs(previous, current);
  if (!overlap.length) return [];
  const oldHours = overlap.map((pair) => pair.previous);
  const newHours = overlap.map((pair) => pair.current);
  const changes = [];

  const probability = sustainedDelta(overlap, 'precipProbabilityPct', 30);
  if (probability) changes.push(event('precip-probability', probability));

  const beforeWet = firstPersistent(oldHours, isWet);
  const afterWet = firstPersistent(newHours, isWet);
  const timing = minuteDifference(beforeWet, afterWet);
  if (Boolean(beforeWet) !== Boolean(afterWet)) {
    changes.push(event('precip-transition', {
      localTime: afterWet || beforeWet,
      before: Boolean(beforeWet),
      after: Boolean(afterWet),
    }));
  } else if (beforeWet && afterWet && Math.abs(timing) >= 180) {
    changes.push(event('precip-timing', { beforeTime: beforeWet, afterTime: afterWet, deltaMinutes: timing }));
  }

  const beforeSnow = total(oldHours, 'snowCm');
  const afterSnow = total(newHours, 'snowCm');
  const snowDelta = afterSnow - beforeSnow;
  if (Math.abs(snowDelta) >= 2) {
    changes.push(event('snow-total', { before: beforeSnow, after: afterSnow, delta: snowDelta }));
  }

  const freezing = (hour) => finite(hour?.tempC) !== null && hour.tempC <= 0;
  const beforeFreezingAt = firstPersistent(oldHours, freezing);
  const afterFreezingAt = firstPersistent(newHours, freezing);
  if (Boolean(beforeFreezingAt) !== Boolean(afterFreezingAt)) {
    changes.push(event('freezing-threshold', {
      localTime: afterFreezingAt || beforeFreezingAt,
      before: Boolean(beforeFreezingAt),
      after: Boolean(afterFreezingAt),
    }));
  }

  const gust = sustainedDelta(overlap, 'windGustKph', 20);
  if (gust) changes.push(event('wind-gust', gust));
  const beforeStrongWind = firstPersistent(oldHours, (hour) => (finite(hour?.windGustKph) || 0) >= 50);
  const afterStrongWind = firstPersistent(newHours, (hour) => (finite(hour?.windGustKph) || 0) >= 50);
  if (Boolean(beforeStrongWind) !== Boolean(afterStrongWind)) {
    changes.push(event('wind-threshold', {
      localTime: afterStrongWind || beforeStrongWind,
      before: Boolean(beforeStrongWind),
      after: Boolean(afterStrongWind),
    }));
  }

  const beforeHazardAt = firstPersistent(oldHours, isHazard, 1);
  const afterHazardAt = firstPersistent(newHours, isHazard, 1);
  if (Boolean(beforeHazardAt) !== Boolean(afterHazardAt)) {
    changes.push(event('hazard', {
      localTime: afterHazardAt || beforeHazardAt,
      before: Boolean(beforeHazardAt),
      after: Boolean(afterHazardAt),
    }));
  }

  return changes;
}

function matchesPreset(change, preset) {
  if (preset === 'all') return true;
  if (preset === 'rain') return ['precip-probability', 'precip-transition', 'precip-timing', 'snow-total'].includes(change.kind);
  if (preset === 'freezing') return ['freezing-threshold', 'hazard'].includes(change.kind);
  if (preset === 'wind') return ['wind-gust', 'wind-threshold'].includes(change.kind);
  return false;
}

export function saveWatch({ place, preset = 'all', data }, storage) {
  const selectedPreset = WATCH_PRESETS[preset] ? preset : 'all';
  const store = read(storage);
  const key = watchKey(place);
  if (!store.watches[key] && Object.keys(store.watches).length >= MAX_WATCHES) {
    throw new Error(`This beta supports up to ${MAX_WATCHES} watches on one device.`);
  }
  const existing = store.watches[key];
  const now = new Date().toISOString();
  store.watches[key] = {
    schemaVersion: 1,
    key,
    place: {
      name: String(place.name),
      admin1: place.admin1 || null,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
    },
    preset: selectedPreset,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastCheckedAt: data?.fetchedAt || existing?.lastCheckedAt || null,
    baseline: data ? normalizeForecast(data) : existing?.baseline || null,
    events: existing?.preset === selectedPreset ? existing.events || [] : [],
  };
  if (!write(store, storage)) throw new Error('This browser could not save the watch.');
  return store.watches[key];
}

export function removeWatch(place, storage) {
  const store = read(storage);
  const key = watchKey(place);
  const existed = Boolean(store.watches[key]);
  delete store.watches[key];
  write(store, storage);
  return existed;
}

export function evaluateAndRecord({ place, data }, storage) {
  const store = read(storage);
  const key = watchKey(place);
  const watch = store.watches[key];
  if (!watch) return { watch: null, newEvents: [] };

  const current = normalizeForecast(data);
  const candidates = watch.baseline
    ? compareWatchForecasts(watch.baseline, current).filter((change) => matchesPreset(change, watch.preset))
    : [];
  const known = new Set((watch.events || []).map((item) => item.eventKey));
  const checkedAt = data?.fetchedAt || new Date().toISOString();
  const newEvents = candidates
    .filter((change) => !known.has(change.eventKey))
    .map((change) => ({ ...change, detectedAt: checkedAt }));

  watch.baseline = current;
  watch.lastCheckedAt = checkedAt;
  watch.updatedAt = new Date().toISOString();
  watch.events = [...newEvents, ...(watch.events || [])].slice(0, MAX_EVENTS);
  write(store, storage);
  return { watch, newEvents };
}

export function describeWatchEvent(change) {
  const absolute = Math.abs(Math.round(change.delta || 0));
  switch (change.kind) {
    case 'precip-probability':
      return `Precipitation chance ${change.delta > 0 ? 'rose' : 'fell'} by ${absolute} points near ${change.localTime}.`;
    case 'precip-timing':
      return `Expected precipitation moved ${Math.abs(Math.round(change.deltaMinutes / 60))} hours ${change.deltaMinutes > 0 ? 'later' : 'earlier'}.`;
    case 'precip-transition':
      return `Persistent precipitation was ${change.after ? 'added to' : 'removed from'} the next 36 hours near ${change.localTime}.`;
    case 'snow-total':
      return `Forecast snow ${change.delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(change.delta).toFixed(1)} cm.`;
    case 'freezing-threshold':
      return `Freezing conditions were ${change.after ? 'added to' : 'removed from'} the next 36 hours near ${change.localTime}.`;
    case 'wind-gust':
      return `Forecast gusts ${change.delta > 0 ? 'rose' : 'fell'} by ${absolute} km/h near ${change.localTime}.`;
    case 'wind-threshold':
      return `Gusts ${change.after ? 'crossed above' : 'fell below'} 50 km/h near ${change.localTime}.`;
    case 'hazard':
      return `A thunderstorm or freezing-precipitation signal ${change.after ? 'appeared' : 'disappeared'} near ${change.localTime}.`;
    default:
      return 'A material forecast change was detected.';
  }
}

export const _internals = { STORAGE_KEY, read, firstPersistent, sustainedDelta };
