'use strict';

const { fetchJson } = require('../upstream');

const TIMELINE_ENDPOINT =
  'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

const ELEMENTS = [
  'datetime', 'datetimeEpoch', 'temp', 'tempmax', 'tempmin', 'feelslike',
  'feelslikemax', 'feelslikemin',
  'humidity', 'dew', 'precip', 'precipprob', 'snow', 'snowdepth',
  'preciptype', 'windgust', 'windspeed', 'winddir', 'pressure', 'cloudcover',
  'visibility', 'uvindex', 'sunrise', 'sunset', 'conditions', 'icon', 'description',
].join(',');

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timelineUrl({ lat, lon, apiKey }) {
  if (!apiKey) throw new Error('VISUAL_CROSSING_API_KEY is required');
  const location = encodeURIComponent(`${lat},${lon}`);
  const url = new URL(`${TIMELINE_ENDPOINT}/${location}`);
  url.searchParams.set('unitGroup', 'metric');
  url.searchParams.set('include', 'current,hours,days,alerts');
  url.searchParams.set('elements', ELEMENTS);
  url.searchParams.set('iconSet', 'icons2');
  url.searchParams.set('contentType', 'json');
  url.searchParams.set('key', apiKey);
  return url.toString();
}

function redactedUrl(url) {
  const safe = new URL(url);
  if (safe.searchParams.has('key')) safe.searchParams.set('key', '[redacted]');
  return safe.toString();
}

function localDateTime(date, time) {
  if (!date || !time) return null;
  return `${date}T${String(time).slice(0, 5)}`;
}

function precipTypes(item) {
  return Array.isArray(item?.preciptype)
    ? item.preciptype.map((value) => String(value).toLowerCase())
    : [];
}

/** Translate Visual Crossing's condition/icon vocabulary into WMO codes. */
function wmoCode(item = {}) {
  const icon = String(item.icon || '').toLowerCase();
  const condition = String(item.conditions || '').toLowerCase();
  const types = precipTypes(item);
  const precip = finite(item.precip) || 0;
  const snow = finite(item.snow) || 0;
  const words = `${icon} ${condition} ${types.join(' ')}`;

  if (/hail/.test(words)) return 96;
  if (/thunder/.test(words)) return 95;
  if (/freezing|ice/.test(words)) return precip >= 2 ? 67 : 66;
  if (/snow/.test(words) || snow > 0) {
    if (/shower/.test(words)) return snow >= 1 ? 86 : 85;
    return snow >= 2 ? 75 : snow >= 0.5 ? 73 : 71;
  }
  if (/shower/.test(words)) return precip >= 4 ? 82 : precip >= 1 ? 81 : 80;
  if (/rain|drizzle/.test(words) || types.includes('rain')) {
    return precip >= 4 ? 65 : precip >= 1 ? 63 : 61;
  }
  if (/fog|mist/.test(words)) return 45;
  if (/partly/.test(words)) return 2;
  if (/cloud|overcast|wind/.test(words)) return 3;
  return 0;
}

function isDay(item = {}) {
  const icon = String(item.icon || '').toLowerCase();
  if (icon.endsWith('-night')) return 0;
  if (icon.endsWith('-day')) return 1;
  return 1;
}

function liquidFor(item, { showersOnly = false } = {}) {
  const types = precipTypes(item);
  const isLiquid = types.some((type) => ['rain', 'freezingrain', 'ice'].includes(type));
  const isShower = String(item?.icon || '').toLowerCase().includes('shower');
  if (!isLiquid || (showersOnly && !isShower)) return 0;
  return finite(item.precip) || 0;
}

function timeSeconds(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 : null;
}

function daylightSeconds(day) {
  const sunrise = timeSeconds(day.sunrise);
  const sunset = timeSeconds(day.sunset);
  return sunrise === null || sunset === null ? null : Math.max(0, sunset - sunrise);
}

function hourlyArrays(days) {
  const result = {
    time: [], temperature_2m: [], relative_humidity_2m: [], dew_point_2m: [],
    apparent_temperature: [], precipitation_probability: [], precipitation: [],
    rain: [], showers: [], snowfall: [], weather_code: [], pressure_msl: [],
    cloud_cover: [], visibility: [], wind_speed_10m: [], wind_direction_10m: [],
    wind_gusts_10m: [], uv_index: [], is_day: [],
  };

  for (const day of days) {
    for (const hour of Array.isArray(day.hours) ? day.hours : []) {
      result.time.push(localDateTime(day.datetime, hour.datetime));
      result.temperature_2m.push(finite(hour.temp));
      result.relative_humidity_2m.push(finite(hour.humidity));
      result.dew_point_2m.push(finite(hour.dew));
      result.apparent_temperature.push(finite(hour.feelslike));
      result.precipitation_probability.push(finite(hour.precipprob));
      result.precipitation.push(finite(hour.precip));
      result.rain.push(liquidFor(hour));
      result.showers.push(liquidFor(hour, { showersOnly: true }));
      result.snowfall.push(finite(hour.snow));
      result.weather_code.push(wmoCode(hour));
      result.pressure_msl.push(finite(hour.pressure));
      result.cloud_cover.push(finite(hour.cloudcover));
      result.visibility.push(finite(hour.visibility) === null ? null : finite(hour.visibility) * 1000);
      result.wind_speed_10m.push(finite(hour.windspeed));
      result.wind_direction_10m.push(finite(hour.winddir));
      result.wind_gusts_10m.push(finite(hour.windgust));
      result.uv_index.push(finite(hour.uvindex));
      result.is_day.push(isDay(hour));
    }
  }
  return result;
}

function dailyArrays(days) {
  return {
    time: days.map((day) => day.datetime || null),
    weather_code: days.map(wmoCode),
    temperature_2m_max: days.map((day) => finite(day.tempmax)),
    temperature_2m_min: days.map((day) => finite(day.tempmin)),
    apparent_temperature_max: days.map((day) => finite(day.feelslikemax)),
    apparent_temperature_min: days.map((day) => finite(day.feelslikemin)),
    sunrise: days.map((day) => localDateTime(day.datetime, day.sunrise)),
    sunset: days.map((day) => localDateTime(day.datetime, day.sunset)),
    daylight_duration: days.map(daylightSeconds),
    // Visual Crossing's core Timeline response does not expose measured
    // sunshine duration. Keep it unknown instead of inventing a proxy.
    sunshine_duration: days.map(() => null),
    uv_index_max: days.map((day) => finite(day.uvindex)),
    precipitation_sum: days.map((day) => finite(day.precip)),
    rain_sum: days.map((day) => liquidFor(day)),
    showers_sum: days.map((day) => liquidFor(day, { showersOnly: true })),
    snowfall_sum: days.map((day) => finite(day.snow)),
    precipitation_hours: days.map((day) =>
      (Array.isArray(day.hours) ? day.hours : []).filter((hour) => (finite(hour.precip) || 0) >= 0.1).length
    ),
    precipitation_probability_max: days.map((day) => finite(day.precipprob)),
    wind_speed_10m_max: days.map((day) => finite(day.windspeed)),
    wind_gusts_10m_max: days.map((day) => finite(day.windgust)),
    wind_direction_10m_dominant: days.map((day) => finite(day.winddir)),
  };
}

/** Visual Crossing payload expressed in the contract the current UI consumes. */
function toOpenMeteoPayload(raw) {
  const days = Array.isArray(raw.days) ? raw.days.slice(0, 16) : [];
  const currentRaw = raw.currentConditions || null;
  const currentDate = days[0]?.datetime || null;
  const currentTime = currentRaw && currentDate
    ? `${currentDate}T${String(currentRaw.datetime || '00:00').slice(0, 2)}:00`
    : null;

  const current = currentRaw ? {
    time: currentTime,
    interval: 900,
    temperature_2m: finite(currentRaw.temp),
    relative_humidity_2m: finite(currentRaw.humidity),
    apparent_temperature: finite(currentRaw.feelslike),
    is_day: isDay(currentRaw),
    precipitation: finite(currentRaw.precip),
    rain: liquidFor(currentRaw),
    showers: liquidFor(currentRaw, { showersOnly: true }),
    snowfall: finite(currentRaw.snow),
    weather_code: wmoCode(currentRaw),
    cloud_cover: finite(currentRaw.cloudcover),
    pressure_msl: finite(currentRaw.pressure),
    surface_pressure: null,
    wind_speed_10m: finite(currentRaw.windspeed),
    wind_direction_10m: finite(currentRaw.winddir),
    wind_gusts_10m: finite(currentRaw.windgust),
  } : null;

  return {
    latitude: finite(raw.latitude),
    longitude: finite(raw.longitude),
    elevation: finite(raw.elevation),
    generationtime_ms: null,
    utc_offset_seconds: finite(raw.tzoffset) === null ? null : finite(raw.tzoffset) * 3600,
    timezone: raw.timezone || null,
    timezone_abbreviation: raw.timezone || null,
    current,
    current_units: {
      time: 'iso8601', interval: 'seconds', temperature_2m: '°C',
      relative_humidity_2m: '%', apparent_temperature: '°C', is_day: '',
      precipitation: 'mm', rain: 'mm', showers: 'mm', snowfall: 'cm',
      weather_code: 'wmo code', cloud_cover: '%', pressure_msl: 'hPa',
      surface_pressure: 'hPa', wind_speed_10m: 'km/h', wind_direction_10m: '°',
      wind_gusts_10m: 'km/h',
    },
    hourly: hourlyArrays(days),
    hourly_units: {
      time: 'iso8601', temperature_2m: '°C', relative_humidity_2m: '%',
      dew_point_2m: '°C', apparent_temperature: '°C', precipitation_probability: '%',
      precipitation: 'mm', rain: 'mm', showers: 'mm', snowfall: 'cm',
      weather_code: 'wmo code', pressure_msl: 'hPa', cloud_cover: '%',
      visibility: 'm', wind_speed_10m: 'km/h', wind_direction_10m: '°',
      wind_gusts_10m: 'km/h', uv_index: '', is_day: '',
    },
    daily: dailyArrays(days),
    daily_units: {
      time: 'iso8601', weather_code: 'wmo code', temperature_2m_max: '°C',
      temperature_2m_min: '°C', apparent_temperature_max: '°C',
      apparent_temperature_min: '°C', sunrise: 'iso8601', sunset: 'iso8601',
      daylight_duration: 's', sunshine_duration: 's', uv_index_max: '',
      precipitation_sum: 'mm', rain_sum: 'mm', showers_sum: 'mm',
      snowfall_sum: 'cm', precipitation_hours: 'h',
      precipitation_probability_max: '%', wind_speed_10m_max: 'km/h',
      wind_gusts_10m_max: 'km/h', wind_direction_10m_dominant: '°',
    },
    queryCost: finite(raw.queryCost),
  };
}

function normalizeHour(hour, date) {
  return {
    localTime: localDateTime(date, hour.datetime),
    timeEpoch: finite(hour.datetimeEpoch),
    tempC: finite(hour.temp),
    apparentC: finite(hour.feelslike),
    humidityPct: finite(hour.humidity),
    dewPointC: finite(hour.dew),
    precipMm: finite(hour.precip),
    precipProbabilityPct: finite(hour.precipprob),
    precipTypes: Array.isArray(hour.preciptype) ? hour.preciptype : [],
    snowCm: finite(hour.snow),
    windKph: finite(hour.windspeed),
    windGustKph: finite(hour.windgust),
    windDirectionDeg: finite(hour.winddir),
    pressureHpa: finite(hour.pressure),
    cloudCoverPct: finite(hour.cloudcover),
    visibilityKm: finite(hour.visibility),
    uvIndex: finite(hour.uvindex),
    condition: hour.conditions || null,
    icon: hour.icon || null,
  };
}

function normalizeDay(day) {
  return {
    date: day.datetime || null,
    timeEpoch: finite(day.datetimeEpoch),
    highC: finite(day.tempmax),
    lowC: finite(day.tempmin),
    tempC: finite(day.temp),
    apparentC: finite(day.feelslike),
    precipMm: finite(day.precip),
    precipProbabilityPct: finite(day.precipprob),
    precipTypes: Array.isArray(day.preciptype) ? day.preciptype : [],
    snowCm: finite(day.snow),
    windKph: finite(day.windspeed),
    windGustKph: finite(day.windgust),
    sunrise: day.sunrise || null,
    sunset: day.sunset || null,
    condition: day.conditions || null,
    icon: day.icon || null,
  };
}

function normalizeVisualCrossing(raw, { fetchedAt = new Date().toISOString() } = {}) {
  const days = Array.isArray(raw.days) ? raw.days.slice(0, 16) : [];
  const hours = days.flatMap((day) =>
    (Array.isArray(day.hours) ? day.hours : []).map((hour) => normalizeHour(hour, day.datetime))
  );

  const currentDate = days[0]?.datetime || null;
  const current = raw.currentConditions
    ? normalizeHour(raw.currentConditions, currentDate)
    : null;

  return {
    provider: 'visual-crossing',
    fetchedAt,
    queryCost: finite(raw.queryCost),
    location: {
      latitude: finite(raw.latitude),
      longitude: finite(raw.longitude),
      timezone: raw.timezone || null,
      utcOffsetSeconds: finite(raw.tzoffset) === null ? null : finite(raw.tzoffset) * 3600,
      resolvedAddress: raw.resolvedAddress || raw.address || null,
    },
    current,
    hours,
    days: days.map(normalizeDay),
    alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
  };
}

async function fetchForecast({ lat, lon, apiKey = process.env.VISUAL_CROSSING_API_KEY }) {
  const url = timelineUrl({ lat, lon, apiKey });
  const raw = await fetchJson(url, { timeoutMs: 15000 });
  return normalizeVisualCrossing(raw);
}

async function fetchOpenMeteoCompatible({ lat, lon, apiKey = process.env.VISUAL_CROSSING_API_KEY }) {
  const url = timelineUrl({ lat, lon, apiKey });
  const raw = await fetchJson(url, { timeoutMs: 15000 });
  return toOpenMeteoPayload(raw);
}

module.exports = {
  fetchForecast,
  fetchOpenMeteoCompatible,
  normalizeVisualCrossing,
  toOpenMeteoPayload,
  timelineUrl,
  redactedUrl,
  _internals: {
    ELEMENTS, normalizeHour, normalizeDay, wmoCode, hourlyArrays, dailyArrays,
    daylightSeconds,
  },
};
