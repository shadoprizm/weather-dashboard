'use strict';

/**
 * Request handlers shared by the Vercel serverless functions in `api/*.js` and
 * the local Express server in `server.js`.
 *
 * Each handler takes a plain query object and resolves to
 * `{ status, body, maxAge }`, where `maxAge` is the CDN cache lifetime in
 * seconds. Keeping them transport-agnostic means local dev and production run
 * literally the same code.
 */

const { fetchJson, fetchJsonSoft, buildUrl, UpstreamError } = require('./upstream');
const cache = require('./cache');

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const BIGDATACLOUD_REVERSE =
  'https://api.bigdatacloud.net/data/reverse-geocode-client';
const NWS_ALERTS = 'https://api.weather.gov/alerts/active';
const RAINVIEWER_INDEX = 'https://api.rainviewer.com/public/weather-maps.json';
const NOAA_KP = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';

// Everything is fetched in metric and converted in the browser, so the unit
// toggle is instant and one cache entry serves every visitor.
const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
];

const HOURLY_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'pressure_msl',
  'cloud_cover',
  'visibility',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'uv_index',
  'is_day',
];

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'sunrise',
  'sunset',
  'daylight_duration',
  'sunshine_duration',
  'uv_index_max',
  'precipitation_sum',
  'rain_sum',
  'showers_sum',
  'snowfall_sum',
  'precipitation_hours',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
];

const AIR_CURRENT_FIELDS = [
  'european_aqi',
  'us_aqi',
  'pm10',
  'pm2_5',
  'carbon_monoxide',
  'nitrogen_dioxide',
  'sulphur_dioxide',
  'ozone',
  'dust',
  'uv_index',
  'alder_pollen',
  'birch_pollen',
  'grass_pollen',
  'mugwort_pollen',
  'olive_pollen',
  'ragweed_pollen',
];

/* ------------------------------------------------------------------ utils */

function badRequest(message) {
  const error = new UpstreamError(message, 400);
  return error;
}

/** Parse and validate a coordinate pair, throwing a 400 on anything odd. */
function coords(query) {
  const lat = Number.parseFloat(query.lat);
  const lon = Number.parseFloat(query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw badRequest('lat and lon are required and must be numbers');
  }
  if (lat < -90 || lat > 90) throw badRequest('lat must be between -90 and 90');
  if (lon < -180 || lon > 180) throw badRequest('lon must be between -180 and 180');

  // ~11 m of precision is far more than a forecast grid needs, and rounding
  // collapses near-identical requests onto the same cache key.
  return { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) };
}

/** Index of the array entry matching `value`, or -1. */
function indexOfTime(times, value) {
  if (!Array.isArray(times) || !value) return -1;
  return times.indexOf(value);
}

/* --------------------------------------------------------------- forecast */

/**
 * The dashboard's primary payload: current conditions, 48h+ of hourly data,
 * 16 days of daily data, and air quality, in one round trip.
 */
async function forecast(query) {
  const { lat, lon } = coords(query);
  const key = `forecast:${lat},${lon}`;

  const body = await cache.memo(key, 300, async () => {
    const forecastUrl = buildUrl(OPEN_METEO, {
      latitude: lat,
      longitude: lon,
      current: CURRENT_FIELDS,
      hourly: HOURLY_FIELDS,
      daily: DAILY_FIELDS,
      timezone: 'auto',
      forecast_days: 16,
      // Two days of history power the pressure trend and the dry-spell counter.
      past_days: 2,
      wind_speed_unit: 'kmh',
      temperature_unit: 'celsius',
      precipitation_unit: 'mm',
    });

    const airUrl = buildUrl(OPEN_METEO_AIR, {
      latitude: lat,
      longitude: lon,
      current: AIR_CURRENT_FIELDS,
      hourly: ['us_aqi', 'european_aqi', 'pm2_5'],
      timezone: 'auto',
      forecast_days: 3,
    });

    // Air quality is a nice-to-have: soft-fetch so an outage there still
    // leaves a fully working forecast.
    const [weather, air] = await Promise.all([
      fetchJson(forecastUrl),
      fetchJsonSoft(airUrl, null),
    ]);

    const currentTime = weather.current && weather.current.time;
    const hourlyIndex = indexOfTime(weather.hourly && weather.hourly.time, currentTime);
    const dailyIndex = indexOfTime(
      weather.daily && weather.daily.time,
      currentTime ? currentTime.slice(0, 10) : null
    );

    return {
      location: {
        latitude: weather.latitude,
        longitude: weather.longitude,
        elevation: weather.elevation,
        timezone: weather.timezone,
        timezoneAbbreviation: weather.timezone_abbreviation,
        utcOffsetSeconds: weather.utc_offset_seconds,
      },
      current: weather.current || null,
      currentUnits: weather.current_units || null,
      hourly: weather.hourly || null,
      hourlyUnits: weather.hourly_units || null,
      daily: weather.daily || null,
      dailyUnits: weather.daily_units || null,
      // Where "now" sits inside the hourly/daily arrays, which start in the
      // past because of `past_days`.
      index: { hourly: hourlyIndex, daily: dailyIndex },
      air: air ? { current: air.current || null, hourly: air.hourly || null } : null,
      fetchedAt: new Date().toISOString(),
    };
  });

  return { status: 200, body, maxAge: 300 };
}

/* ------------------------------------------------------- geocode / reverse */

/** Place search for the location picker. */
async function geocode(query) {
  const term = String(query.q || query.name || '').trim();
  if (term.length < 2) {
    return { status: 200, body: { results: [] }, maxAge: 0 };
  }

  const key = `geocode:${term.toLowerCase()}`;
  const body = await cache.memo(key, 86400, async () => {
    const data = await fetchJson(
      buildUrl(OPEN_METEO_GEOCODE, {
        name: term,
        count: 10,
        language: query.language || 'en',
        format: 'json',
      })
    );

    const results = (data.results || []).map((place) => ({
      id: place.id,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      country: place.country,
      countryCode: place.country_code,
      admin1: place.admin1,
      admin2: place.admin2,
      timezone: place.timezone,
      population: place.population,
      elevation: place.elevation,
    }));

    return { results };
  });

  return { status: 200, body, maxAge: 86400 };
}

/** Turn the browser's geolocation fix into a place name. */
async function reverse(query) {
  const { lat, lon } = coords(query);
  const key = `reverse:${lat},${lon}`;

  const body = await cache.memo(key, 86400, async () => {
    const data = await fetchJsonSoft(
      buildUrl(BIGDATACLOUD_REVERSE, {
        latitude: lat,
        longitude: lon,
        localityLanguage: 'en',
      }),
      null
    );

    if (!data) return { name: null, admin1: null, country: null };

    return {
      name: data.city || data.locality || data.principalSubdivision || null,
      admin1: data.principalSubdivision || null,
      country: data.countryName || null,
      countryCode: data.countryCode || null,
    };
  });

  return { status: 200, body, maxAge: 86400 };
}

/* ----------------------------------------------------------------- alerts */

const SEVERITY_RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };

/**
 * Official government alerts.
 *
 * Only the US National Weather Service is wired up today -- it is a clean,
 * key-free, point-queryable API. Other regions return an empty list, and the
 * client falls back to the locally computed watches in `js/insights.js`, which
 * work everywhere. See README "Alert coverage" for the state of play.
 */
async function alerts(query) {
  const { lat, lon } = coords(query);
  const key = `alerts:${lat},${lon}`;

  const body = await cache.memo(key, 180, async () => {
    const data = await fetchJsonSoft(
      buildUrl(NWS_ALERTS, { point: `${lat},${lon}`, status: 'actual' }),
      null,
      { headers: { Accept: 'application/geo+json' } }
    );

    if (!data || !Array.isArray(data.features)) {
      return { alerts: [], sources: [], coverage: 'unavailable' };
    }

    const items = data.features
      .map((feature) => feature.properties || {})
      .map((p) => ({
        id: p.id,
        event: p.event,
        headline: p.headline,
        description: p.description,
        instruction: p.instruction,
        severity: p.severity || 'Unknown',
        urgency: p.urgency,
        certainty: p.certainty,
        area: p.areaDesc,
        sender: p.senderName,
        onset: p.onset || p.effective,
        expires: p.ends || p.expires,
        source: 'NWS',
      }))
      .sort(
        (a, b) =>
          (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
      );

    return { alerts: items, sources: ['NWS'], coverage: 'us' };
  });

  return { status: 200, body, maxAge: 180 };
}

/* ------------------------------------------------------------------ radar */

/** RainViewer's frame index: past radar plus a short nowcast. */
async function radar() {
  const body = await cache.memo('radar:index', 120, async () => {
    const data = await fetchJsonSoft(RAINVIEWER_INDEX, null);
    if (!data || !data.radar) return { available: false, host: null, frames: [] };

    const past = (data.radar.past || []).map((f) => ({ ...f, kind: 'past' }));
    const nowcast = (data.radar.nowcast || []).map((f) => ({ ...f, kind: 'forecast' }));

    return {
      available: past.length > 0,
      host: data.host,
      generated: data.generated,
      frames: [...past, ...nowcast].map((f) => ({
        time: f.time,
        path: f.path,
        kind: f.kind,
      })),
    };
  });

  return { status: 200, body, maxAge: 120 };
}

/* ---------------------------------------------------------------- almanac */

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * How today compares with the same calendar day across the last 20 years:
 * normals, records, and typical rainfall. This is what turns "18 degrees" into
 * "18 degrees, which is 4 warmer than normal for August 17".
 */
async function almanac(query) {
  const { lat, lon } = coords(query);
  // The client passes the location's local date so the comparison lines up
  // with the day the user is actually looking at.
  const target = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '')
    ? query.date
    : new Date().toISOString().slice(0, 10);

  const key = `almanac:${lat},${lon}:${target}`;

  const body = await cache.memo(key, 86400, async () => {
    // The archive lags real time by a few days; back off to stay inside it.
    const end = new Date(Date.now() - 7 * 86400000);
    const endDate = end.toISOString().slice(0, 10);
    const startDate = `${end.getUTCFullYear() - 20}-01-01`;

    const data = await fetchJsonSoft(
      buildUrl(OPEN_METEO_ARCHIVE, {
        latitude: lat,
        longitude: lon,
        start_date: startDate,
        end_date: endDate,
        daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'],
        timezone: 'auto',
      }),
      null,
      { timeoutMs: 20000 }
    );

    if (!data || !data.daily || !Array.isArray(data.daily.time)) {
      return { available: false };
    }

    const { time, temperature_2m_max: highs, temperature_2m_min: lows } = data.daily;
    const precip = data.daily.precipitation_sum;

    const [, month, day] = target.split('-');
    const windowDays = 3; // +/- 3 days smooths out single-day noise
    const targetDayOfYear = Date.UTC(2001, Number(month) - 1, Number(day));

    const samples = [];
    for (let i = 0; i < time.length; i += 1) {
      const [y, m, d] = time[i].split('-');
      const asRefYear = Date.UTC(2001, Number(m) - 1, Number(d));
      let deltaDays = Math.round((asRefYear - targetDayOfYear) / 86400000);
      // Wrap around the year boundary so late-December works.
      if (deltaDays > 182) deltaDays -= 365;
      if (deltaDays < -182) deltaDays += 365;
      if (Math.abs(deltaDays) > windowDays) continue;

      samples.push({
        year: Number(y),
        date: time[i],
        high: highs ? highs[i] : null,
        low: lows ? lows[i] : null,
        precip: precip ? precip[i] : null,
      });
    }

    const highValues = samples.map((s) => s.high).filter((v) => v !== null);
    const lowValues = samples.map((s) => s.low).filter((v) => v !== null);
    const precipValues = samples.map((s) => s.precip).filter((v) => v !== null);

    if (!highValues.length || !lowValues.length) return { available: false };

    const recordHigh = samples
      .filter((s) => s.high !== null)
      .reduce((best, s) => (s.high > best.high ? s : best));
    const recordLow = samples
      .filter((s) => s.low !== null)
      .reduce((best, s) => (s.low < best.low ? s : best));

    return {
      available: true,
      date: target,
      windowDays,
      years: new Set(samples.map((s) => s.year)).size,
      normalHigh: mean(highValues),
      normalLow: mean(lowValues),
      normalPrecip: mean(precipValues),
      wetDayOdds: precipValues.length
        ? precipValues.filter((v) => v >= 1).length / precipValues.length
        : null,
      recordHigh: { value: recordHigh.high, date: recordHigh.date },
      recordLow: { value: recordLow.low, date: recordLow.date },
    };
  });

  return { status: 200, body, maxAge: 86400 };
}

/* ----------------------------------------------------------- space weather */

/** Planetary K index, for the aurora watch card. */
async function space() {
  const body = await cache.memo('space:kp', 900, async () => {
    const data = await fetchJsonSoft(NOAA_KP, null);
    if (!Array.isArray(data) || !data.length) return { available: false };

    const latest = data[data.length - 1];
    const kp = Number(
      latest.kp_index !== undefined ? latest.kp_index : latest.estimated_kp
    );
    if (!Number.isFinite(kp)) return { available: false };

    return { available: true, kp, observedAt: latest.time_tag || null };
  });

  return { status: 200, body, maxAge: 900 };
}

/* ----------------------------------------------------------------- health */

async function health() {
  return {
    status: 200,
    body: { status: 'ok', cache: cache.stats(), time: new Date().toISOString() },
    maxAge: 0,
  };
}

module.exports = {
  forecast,
  geocode,
  reverse,
  alerts,
  radar,
  almanac,
  space,
  health,
};
