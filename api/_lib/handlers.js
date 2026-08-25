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
const alertRegistry = require('./alerts');
const visualCrossing = require('./weather-providers/visual-crossing');

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const BIGDATACLOUD_REVERSE =
  'https://api.bigdatacloud.net/data/reverse-geocode-client';
const RAINVIEWER_INDEX = 'https://api.rainviewer.com/public/weather-maps.json';
const NOAA_KP = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';

/**
 * Open-Meteo's geocoder is good at place names and surprisingly literal about
 * unpunctuated region qualifiers: `Summerside PEI` returns nothing while
 * `Summerside, Prince Edward Island` works. Recognise the common Canadian
 * forms so the location picker accepts the way people actually type them.
 */
const CANADIAN_REGIONS = [
  ['Alberta', 'AB', ['alberta', 'ab']],
  ['British Columbia', 'BC', ['british columbia', 'bc']],
  ['Manitoba', 'MB', ['manitoba', 'mb']],
  ['New Brunswick', 'NB', ['new brunswick', 'nb']],
  ['Newfoundland and Labrador', 'NL', ['newfoundland and labrador', 'newfoundland', 'labrador', 'nl', 'nfl', 'nfld']],
  ['Northwest Territories', 'NT', ['northwest territories', 'north west territories', 'nwt', 'nt']],
  ['Nova Scotia', 'NS', ['nova scotia', 'ns']],
  ['Nunavut', 'NU', ['nunavut', 'nu']],
  ['Ontario', 'ON', ['ontario', 'on']],
  ['Prince Edward Island', 'PE', ['prince edward island', 'pei', 'pe']],
  ['Quebec', 'QC', ['quebec', 'québec', 'qc', 'pq']],
  ['Saskatchewan', 'SK', ['saskatchewan', 'sk']],
  ['Yukon', 'YT', ['yukon territory', 'yukon', 'yt']],
].map(([name, code, aliases]) => ({ name, code, aliases }));

function normalizeLookupText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const REGION_ALIASES = CANADIAN_REGIONS
  .flatMap((region) => region.aliases.map((alias) => ({
    alias: normalizeLookupText(alias),
    words: normalizeLookupText(alias).split(' ').length,
    region,
  })))
  // Try `Prince Edward Island` before the shorter aliases.
  .sort((a, b) => b.words - a.words || b.alias.length - a.alias.length);

/** Build ordered upstream queries and retain enough context to rank matches. */
function geocodePlan(value) {
  const term = String(value || '').trim().replace(/\s+/g, ' ');
  if (!term) return { term: '', queries: [], city: '', qualifier: '', region: null };

  const tokens = term.split(/\s+/);
  const normalizedTokens = tokens.map(normalizeLookupText);
  let city = '';
  let qualifier = '';
  let region = null;

  for (const candidate of REGION_ALIASES) {
    const tail = normalizedTokens.slice(-candidate.words).join(' ');
    if (tail !== candidate.alias || tokens.length <= candidate.words) continue;
    city = tokens.slice(0, -candidate.words).join(' ').replace(/[\s,]+$/, '');
    qualifier = tokens.slice(-candidate.words).join(' ');
    region = candidate.region;
    break;
  }

  if (!city && term.includes(',')) {
    const comma = term.indexOf(',');
    city = term.slice(0, comma).trim();
    qualifier = term.slice(comma + 1).trim();
  }

  // Unknown two/three-letter region abbreviations still get a city-only
  // fallback. Ranking remains stable, so users can choose the right result.
  if (!city && tokens.length > 1 && /^[A-Z]{2,3}[.]?$/.test(tokens.at(-1))) {
    city = tokens.slice(0, -1).join(' ').replace(/[\s,]+$/, '');
    qualifier = tokens.at(-1);
  }

  const queries = [];
  const add = (name) => {
    if (name && !queries.some((item) => normalizeLookupText(item) === normalizeLookupText(name))) {
      queries.push(name);
    }
  };

  // The canonical comma form is the most reliable upstream request when a
  // Canadian province/territory was recognised.
  if (region && city) add(`${city}, ${region.name}`);
  add(term);
  if (city) add(city);

  return { term, queries, city, qualifier, region };
}

function rankGeocodeResults(results, plan) {
  if (!plan.region) return results;

  return results
    .map((place, index) => {
      let score = 0;
      if (place.countryCode === 'CA') score += 100;
      if (normalizeLookupText(place.admin1) === normalizeLookupText(plan.region.name)) score += 200;
      return { place, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.place);
}

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

function configuredWeatherProvider() {
  return process.env.WEATHER_PROVIDER === 'visual-crossing'
    ? 'visual-crossing'
    : 'open-meteo';
}

async function fetchWeather({ lat, lon, openMeteoUrl, provider = configuredWeatherProvider() }) {
  if (provider !== 'visual-crossing') {
    return {
      data: await fetchJson(openMeteoUrl),
      provider: 'open-meteo',
      fallback: false,
      queryCost: null,
    };
  }

  try {
    const data = await visualCrossing.fetchOpenMeteoCompatible({ lat, lon });
    return {
      data,
      provider: 'visual-crossing',
      fallback: false,
      queryCost: data.queryCost,
    };
  } catch (error) {
    // Keep the public forecast useful during a provider outage or free-tier
    // throttle. The response exposes that a fallback happened so the source
    // label remains honest and the trial can distinguish provider failures.
    return {
      data: await fetchJson(openMeteoUrl),
      provider: 'open-meteo',
      fallback: true,
      queryCost: null,
    };
  }
}

/* --------------------------------------------------------------- forecast */

/**
 * The dashboard's primary payload: current conditions, 48h+ of hourly data,
 * 16 days of daily data, and air quality, in one round trip.
 */
async function forecast(query) {
  const { lat, lon } = coords(query);
  const requestedProvider = configuredWeatherProvider();
  const key = `forecast:v2:${requestedProvider}:${lat},${lon}`;

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
    const [weatherResult, air] = await Promise.all([
      fetchWeather({ lat, lon, openMeteoUrl: forecastUrl, provider: requestedProvider }),
      fetchJsonSoft(airUrl, null),
    ]);
    const weather = weatherResult.data;

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
      weatherProvider: weatherResult.provider,
      weatherProviderFallback: weatherResult.fallback,
      weatherProviderQueryCost: weatherResult.queryCost,
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

  const plan = geocodePlan(term);
  const key = `geocode:v2:${term.toLowerCase()}`;
  let body = cache.get(key);

  if (body === undefined) {
    let rawResults = [];

    for (const name of plan.queries) {
      const data = await fetchJson(
        buildUrl(OPEN_METEO_GEOCODE, {
          name,
          count: 10,
          language: query.language || 'en',
          format: 'json',
        })
      );
      rawResults = Array.isArray(data.results) ? data.results : [];
      if (rawResults.length) break;
    }

    const results = rawResults.map((place) => ({
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

    body = { results: rankGeocodeResults(results, plan) };
    // A real result is geographically stable. An empty result may just be a
    // transient upstream quirk, so do not make it sticky for a full day.
    cache.set(key, body, body.results.length ? 86400 : 300);
  }

  return { status: 200, body, maxAge: body.results.length ? 86400 : 300 };
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

/**
 * Official government alerts, merged across every provider whose coverage
 * area contains the point. Regions with no provider return an empty list and
 * the client falls back to the locally computed watches in `js/insights.js`,
 * which work everywhere. See `api/_lib/alerts/` to add a country.
 */
async function alerts(query) {
  const { lat, lon } = coords(query);
  const key = `alerts:${lat},${lon}`;

  const body = await cache.memo(key, 180, () => alertRegistry.collect(lat, lon));

  return { status: 200, body, maxAge: 180 };
}

/* ------------------------------------------------------------------ radar */

/** RainViewer's recent radar frames, plus forecast frames when supplied. */
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

/**
 * Liveness, plus an optional alert-provider probe.
 *
 * `/api/health?probe=1&lat=&lon=` reports what each alert provider can
 * actually see, which is the only way to tell "no warnings in effect" apart
 * from "the upstream feed broke" -- they return identical alert lists.
 */
async function health(query = {}) {
  const body = { status: 'ok', cache: cache.stats(), time: new Date().toISOString() };

  if (query.probe) {
    const lat = Number.parseFloat(query.lat);
    const lon = Number.parseFloat(query.lon);
    const point = Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat, lon }
      : { lat: 45.4215, lon: -75.6972 };

    body.point = point;
    body.alertProviders = await alertRegistry.diagnose(point.lat, point.lon);
  }

  return { status: 200, body, maxAge: 0 };
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
  _internals: {
    geocodePlan, rankGeocodeResults, normalizeLookupText,
    configuredWeatherProvider, fetchWeather,
  },
};
