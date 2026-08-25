'use strict';

const { fetchJson, buildUrl } = require('../upstream');

const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_FIELDS = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
  'dew_point_2m', 'precipitation', 'rain', 'showers', 'snowfall',
  'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m',
  'wind_direction_10m', 'wind_gusts_10m', 'is_day',
];

const HOURLY_FIELDS = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
  'dew_point_2m', 'precipitation_probability', 'precipitation', 'rain',
  'showers', 'snowfall', 'weather_code', 'cloud_cover', 'pressure_msl',
  'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  'uv_index', 'is_day',
];

const DAILY_FIELDS = [
  'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum',
  'precipitation_probability_max', 'snowfall_sum', 'wind_speed_10m_max',
  'wind_gusts_10m_max', 'sunrise', 'sunset', 'weather_code',
];

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function valueAt(block, field, index) {
  return Array.isArray(block?.[field]) ? block[field][index] : null;
}

function forecastUrl({ lat, lon }) {
  return buildUrl(FORECAST_ENDPOINT, {
    latitude: lat,
    longitude: lon,
    current: CURRENT_FIELDS,
    hourly: HOURLY_FIELDS,
    daily: DAILY_FIELDS,
    forecast_days: 8,
    timezone: 'auto',
  });
}

function normalizeCurrent(current) {
  if (!current) return null;
  return {
    localTime: current.time || null,
    timeEpoch: null,
    tempC: finite(current.temperature_2m),
    apparentC: finite(current.apparent_temperature),
    humidityPct: finite(current.relative_humidity_2m),
    dewPointC: finite(current.dew_point_2m),
    precipMm: finite(current.precipitation),
    precipProbabilityPct: null,
    precipTypes: [],
    snowCm: finite(current.snowfall),
    windKph: finite(current.wind_speed_10m),
    windGustKph: finite(current.wind_gusts_10m),
    windDirectionDeg: finite(current.wind_direction_10m),
    pressureHpa: finite(current.pressure_msl),
    cloudCoverPct: finite(current.cloud_cover),
    visibilityKm: null,
    uvIndex: null,
    weatherCode: finite(current.weather_code),
    isDay: finite(current.is_day),
  };
}

function normalizeHour(hourly, index) {
  return {
    localTime: valueAt(hourly, 'time', index),
    timeEpoch: null,
    tempC: finite(valueAt(hourly, 'temperature_2m', index)),
    apparentC: finite(valueAt(hourly, 'apparent_temperature', index)),
    humidityPct: finite(valueAt(hourly, 'relative_humidity_2m', index)),
    dewPointC: finite(valueAt(hourly, 'dew_point_2m', index)),
    precipMm: finite(valueAt(hourly, 'precipitation', index)),
    precipProbabilityPct: finite(valueAt(hourly, 'precipitation_probability', index)),
    precipTypes: [],
    snowCm: finite(valueAt(hourly, 'snowfall', index)),
    windKph: finite(valueAt(hourly, 'wind_speed_10m', index)),
    windGustKph: finite(valueAt(hourly, 'wind_gusts_10m', index)),
    windDirectionDeg: finite(valueAt(hourly, 'wind_direction_10m', index)),
    pressureHpa: finite(valueAt(hourly, 'pressure_msl', index)),
    cloudCoverPct: finite(valueAt(hourly, 'cloud_cover', index)),
    visibilityKm: finite(valueAt(hourly, 'visibility', index)) === null
      ? null
      : finite(valueAt(hourly, 'visibility', index)) / 1000,
    uvIndex: finite(valueAt(hourly, 'uv_index', index)),
    weatherCode: finite(valueAt(hourly, 'weather_code', index)),
    isDay: finite(valueAt(hourly, 'is_day', index)),
  };
}

function normalizeDay(daily, index) {
  return {
    date: valueAt(daily, 'time', index),
    highC: finite(valueAt(daily, 'temperature_2m_max', index)),
    lowC: finite(valueAt(daily, 'temperature_2m_min', index)),
    precipMm: finite(valueAt(daily, 'precipitation_sum', index)),
    precipProbabilityPct: finite(valueAt(daily, 'precipitation_probability_max', index)),
    snowCm: finite(valueAt(daily, 'snowfall_sum', index)),
    windKph: finite(valueAt(daily, 'wind_speed_10m_max', index)),
    windGustKph: finite(valueAt(daily, 'wind_gusts_10m_max', index)),
    sunrise: valueAt(daily, 'sunrise', index),
    sunset: valueAt(daily, 'sunset', index),
    weatherCode: finite(valueAt(daily, 'weather_code', index)),
  };
}

function normalizeOpenMeteo(raw, { fetchedAt = new Date().toISOString() } = {}) {
  const hourCount = Array.isArray(raw.hourly?.time) ? raw.hourly.time.length : 0;
  const dayCount = Array.isArray(raw.daily?.time) ? raw.daily.time.length : 0;

  return {
    provider: 'open-meteo',
    fetchedAt,
    queryCost: 1,
    location: {
      latitude: finite(raw.latitude),
      longitude: finite(raw.longitude),
      timezone: raw.timezone || null,
      utcOffsetSeconds: finite(raw.utc_offset_seconds),
      resolvedAddress: null,
    },
    current: normalizeCurrent(raw.current),
    hours: Array.from({ length: hourCount }, (_, index) => normalizeHour(raw.hourly, index)),
    days: Array.from({ length: dayCount }, (_, index) => normalizeDay(raw.daily, index)),
    alerts: [],
  };
}

async function fetchForecast({ lat, lon }) {
  const raw = await fetchJson(forecastUrl({ lat, lon }), { timeoutMs: 15000 });
  return normalizeOpenMeteo(raw);
}

module.exports = {
  fetchForecast,
  forecastUrl,
  normalizeOpenMeteo,
  _internals: { CURRENT_FIELDS, HOURLY_FIELDS, DAILY_FIELDS, normalizeHour, normalizeDay },
};
