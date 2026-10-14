'use strict';

const tzLookup = require('tz-lookup');
const solar = require('suncalc');
const { UpstreamError } = require('../upstream');

const SOURCE = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
const AGENT = 'WeatherView/2.4 https://www.weatherview.cloud/weather-guide#app-support';
const records = new Map();
const pending = new Map();
const MAX_RECORDS = 500;
let shared;
function sharedCache() {
  if (process.env.VERCEL !== '1') return null;
  try { return shared || (shared = require('@vercel/functions').getCache({ namespace: 'weatherview-metno-v1' })); }
  catch { return null; }
}

function number(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function localTime(date, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function offset(date, zone) { return (Date.parse(`${localTime(date, zone)}:00Z`) - Math.floor(date.getTime() / 60000) * 60000) / 1000; }
function symbolCode(symbol = '') {
  if (symbol.includes('thunder')) return 95;
  if (symbol.includes('sleet')) return 67;
  if (symbol.includes('snow')) return symbol.includes('heavy') ? 75 : symbol.includes('light') ? 71 : 73;
  if (symbol.includes('rain')) return symbol.includes('heavy') ? 65 : symbol.includes('light') ? 61 : 63;
  if (symbol.includes('fog')) return 45;
  if (symbol.includes('partlycloudy')) return 2;
  if (symbol.includes('fair')) return 1;
  if (symbol.includes('cloudy')) return 3;
  return symbol.includes('clearsky') ? 0 : null;
}
function solarDay(date, lat, lon, zone) {
  const noon = new Date(`${date}T12:00:00Z`);
  noon.setTime(noon.getTime() - offset(noon, zone) * 1000);
  const times = solar.getTimes(noon, lat, lon);
  const valid = date => date instanceof Date && Number.isFinite(date.getTime());
  return {
    sunrise: valid(times.sunrise) ? localTime(times.sunrise, zone) : null,
    sunset: valid(times.sunset) ? localTime(times.sunset, zone) : null,
    daylight: valid(times.sunrise) && valid(times.sunset) ? (times.sunset - times.sunrise) / 1000
      : solar.getPosition(noon, lat, lon).altitude > 0 ? 86400 : 0,
  };
}
function finiteValues(values) { return values.filter(v => v !== null && Number.isFinite(v)); }
function extreme(values, method) { const v = finiteValues(values); return v.length ? Math[method](...v) : null; }

/** No fabricated hourly rain probabilities, gusts, visibility or observations. */
function normalize(raw, { lat, lon, now = Date.now(), fetchedAt = new Date().toISOString() }) {
  const zone = tzLookup(lat, lon);
  const rows = (raw.properties?.timeseries || []).map(item => {
    const instant = item.data?.instant?.details || {};
    const period = item.data?.next_1_hours || item.data?.next_6_hours || item.data?.next_12_hours;
    const hours = item.data?.next_1_hours ? 1 : item.data?.next_6_hours ? 6 : 12;
    const code = symbolCode(period?.summary?.symbol_code);
    const amount = number(period?.details?.precipitation_amount);
    const time = localTime(new Date(item.time), zone);
    return { time, epoch: Date.parse(item.time), hours,
      temp: number(instant.air_temperature), feels: number(instant.apparent_air_temperature),
      humidity: number(instant.relative_humidity), dew: number(instant.dew_point_temperature),
      wind: number(instant.wind_speed) === null ? null : instant.wind_speed * 3.6,
      gust: number(instant.wind_speed_of_gust) === null ? null : instant.wind_speed_of_gust * 3.6,
      direction: number(instant.wind_from_direction), pressure: number(instant.air_pressure_at_sea_level),
      cloud: number(instant.cloud_area_fraction), uv: number(instant.ultraviolet_index),
      // Only a probability for a one-hour period can populate an hourly probability.
      pop: hours === 1 ? number(period?.details?.probability_of_precipitation) : null,
      amount, rate: amount === null ? null : amount / hours, code,
    };
  }).filter(row => Number.isFinite(row.epoch));
  if (!rows.length) throw new UpstreamError('MET Norway returned no forecast periods', 502);
  const dates = [...new Set(rows.map(r => r.time.slice(0, 10)))];
  const days = dates.map(date => {
    const samples = rows.filter(r => r.time.startsWith(date));
    const sun = solarDay(date, lat, lon, zone);
    const localMidnight = new Date(`${date}T00:00:00Z`);
    const dayStart = localMidnight.getTime() - offset(localMidnight,zone) * 1000;
    const nextMidnight = new Date(localMidnight.getTime() + 86400000);
    const dayEnd = nextMidnight.getTime() - offset(nextMidnight,zone) * 1000;
    const periods = rows.map(r => ({ row:r, overlap:Math.max(0,Math.min(dayEnd,r.epoch+r.hours*3600000)-Math.max(dayStart,r.epoch)) })).filter(p=>p.overlap>0);
    return { date, ...sun, high: extreme(samples.map(r => r.temp), 'max'), low: extreme(samples.map(r => r.temp), 'min'),
      feelsHigh: extreme(samples.map(r => r.feels), 'max'), feelsLow: extreme(samples.map(r => r.feels), 'min'),
      wind: extreme(samples.map(r => r.wind), 'max'), gust: extreme(samples.map(r => r.gust), 'max'),
      uv: extreme(samples.map(r => r.uv), 'max'),
      // A daily probability cannot be inferred from hourly or six-hour probabilities.
      pop: null, code: extreme(samples.map(r => r.code), 'max'),
      // Split intervals crossing local midnight by their mean rate; never assign
      // the entire six-hour amount to the day on which the interval starts.
      precip: !periods.length || periods.some(p=>p.row.amount===null) ? null : periods.reduce((sum,p)=>sum+p.row.rate*p.overlap/3600000,0),
    };
  });
  let currentIndex = rows.reduce((best, row, i) => Math.abs(row.epoch - now) < Math.abs(rows[best].epoch - now) ? i : best, 0);
  const currentRow = rows[currentIndex];
  function dayFlag(row) {
    const day = days.find(d => row.time.startsWith(d.date));
    return day.sunrise && day.sunset ? Number(row.time >= day.sunrise && row.time < day.sunset) : Number(day.daylight > 0);
  }
  const hourly = Object.fromEntries(Object.entries({
    time: 'time', temperature_2m: 'temp', apparent_temperature: 'feels', relative_humidity_2m: 'humidity',
    dew_point_2m: 'dew', precipitation_probability: 'pop', precipitation: 'rate',
    weather_code: 'code', wind_speed_10m: 'wind', wind_gusts_10m: 'gust', wind_direction_10m: 'direction',
    pressure_msl: 'pressure', cloud_cover: 'cloud', uv_index: 'uv',
  }).map(([key, field]) => [key, rows.map(row => row[field])]));
  hourly.is_day = rows.map(dayFlag);
  hourly.visibility = rows.map(() => null);
  hourly.rain = rows.map(r => r.code >= 61 && r.code <= 65 ? r.rate : r.rate === 0 ? 0 : null);
  hourly.showers = rows.map(() => null); hourly.snowfall = rows.map(() => null);
  const daily = Object.fromEntries(Object.entries({
    time:'date', temperature_2m_max:'high', temperature_2m_min:'low', apparent_temperature_max:'feelsHigh',
    apparent_temperature_min:'feelsLow', weather_code:'code', precipitation_probability_max:'pop',
    precipitation_sum:'precip', wind_speed_10m_max:'wind', wind_gusts_10m_max:'gust',
    uv_index_max:'uv', sunrise:'sunrise', sunset:'sunset', daylight_duration:'daylight',
  }).map(([key, field]) => [key, days.map(day => day[field])]));
  for (const key of ['rain_sum','showers_sum','snowfall_sum','precipitation_hours','sunshine_duration','wind_direction_10m_dominant']) daily[key] = days.map(() => null);
  return {
    location: { latitude: lat, longitude: lon, timezone: zone, timezoneAbbreviation: zone, utcOffsetSeconds: offset(new Date(now), zone), elevation: raw.geometry?.coordinates?.[2] ?? null },
    current: { ...Object.fromEntries(Object.entries(hourly).map(([key, values]) => [key, values[currentIndex]])), interval: 3600 },
    hourly, daily, currentUnits: null, hourlyUnits: null, dailyUnits: null,
    index: { hourly: currentIndex, daily: dates.indexOf(currentRow.time.slice(0, 10)) },
    air: null, weatherProvider: 'met-no', weatherProviderFallback: false, weatherProviderQueryCost: null,
    fetchedAt, sourceUpdatedAt: raw.properties?.meta?.updated_at || null, currentIsForecast: true,
    forecastNote: 'Forecast estimates from MET Norway, normalized by WeatherView. Later periods may be six-hourly; daily ranges summarize available model samples and precipitation totals split cross-midnight intervals by their average rate. First and last days may be partial. Missing rain probabilities and other measurements are not inferred. Solar times are calculated locally.',
    weatherSource: { name: 'MET Norway', url: SOURCE, license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', modifications: 'WeatherView converts units and local times, summarizes daily model samples, and calculates solar times.' },
  };
}

async function fetchForecast({ lat, lon }) {
  lat = Number(lat.toFixed(4)); lon = Number(lon.toFixed(4));
  const key = `${lat},${lon}`;
  let record = records.get(key);
  if (record && record.expires > Date.now()) return { body: normalize(record.raw, { lat, lon, fetchedAt: record.fetchedAt }), maxAge: Math.max(1, Math.floor((record.expires - Date.now()) / 1000)) };
  if (!pending.has(key)) pending.set(key, (async () => {
    const external = sharedCache();
    if (!record && external) {
      try { record = await external.get(key); } catch { /* Keep the in-instance cache usable during cache outages. */ }
      if (record?.expires > Date.now()) { records.set(key,record); return record; }
    }
    const url = new URL(SOURCE); url.searchParams.set('lat',lat); url.searchParams.set('lon',lon);
    const headers = { 'User-Agent': AGENT, Accept: 'application/json' };
    if (record?.modified) headers['If-Modified-Since'] = record.modified;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (response.status !== 304 && !response.ok) throw new UpstreamError(`MET Norway forecast unavailable (${response.status})`, response.status === 429 ? 503 : 502);
    if (response.status === 304 && !record) throw new UpstreamError('No cached MET Norway forecast is available',502);
    const expires = Date.parse(response.headers.get('expires'));
    record = { raw: response.status === 304 ? record.raw : await response.json(),
      modified: response.headers.get('last-modified') || record?.modified,
      expires: Number.isFinite(expires) && expires > Date.now() ? expires : Date.now()+3600000,
      fetchedAt: response.status === 304 ? record.fetchedAt : new Date().toISOString() };
    if (records.size >= MAX_RECORDS) records.delete(records.keys().next().value);
    records.set(key, record);
    // Retain validators beyond freshness for a conditional request after Expires.
    if (external) { try { await external.set(key,record,{ttl:86400,name:'met-no-forecast'}); } catch { /* The CDN and in-instance cache still absorb traffic. */ } }
    return record;
  })().finally(() => pending.delete(key)));
  record = await pending.get(key);
  return { body: normalize(record.raw, { lat, lon, fetchedAt: record.fetchedAt }), maxAge: Math.max(1, Math.floor((record.expires-Date.now())/1000)) };
}

module.exports = { fetchForecast, normalize, _internals: { localTime, offset, solarDay, symbolCode, records, pending } };
