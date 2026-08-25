import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const visualCrossing = require('../api/_lib/weather-providers/visual-crossing.js');
const openMeteo = require('../api/_lib/weather-providers/open-meteo.js');
const handlers = require('../api/_lib/handlers.js');

const visualRaw = {
  queryCost: 1,
  latitude: 43.65,
  longitude: -79.38,
  timezone: 'America/Toronto',
  tzoffset: -4,
  resolvedAddress: 'Toronto, ON, Canada',
  currentConditions: {
    datetime: '10:15:00', datetimeEpoch: 1787411700, temp: 22, feelslike: 23,
    humidity: 65, precip: 0, precipprob: 10, snow: 0, windspeed: 12,
    windgust: 20, winddir: 220, pressure: 1012, cloudcover: 40,
    icon: 'partly-cloudy-day', conditions: 'Partially cloudy',
  },
  days: [{
    datetime: '2026-08-22', datetimeEpoch: 1787371200, tempmax: 26, tempmin: 17,
    feelslikemax: 27, feelslikemin: 16, precip: 2.1, precipprob: 60,
    preciptype: ['rain'], snow: 0, windspeed: 15, windgust: 30, winddir: 230, uvindex: 6,
    sunrise: '06:27:00', sunset: '20:05:00', conditions: 'Partially cloudy', icon: 'partly-cloudy-day',
    hours: [{
      datetime: '10:00:00', datetimeEpoch: 1787410800, temp: 22, feelslike: 23,
      humidity: 65, dew: 15, precip: 0.2, precipprob: 55, preciptype: ['rain'],
      snow: 0, windspeed: 12, windgust: 20, winddir: 220, pressure: 1012,
      cloudcover: 40, visibility: 20, uvindex: 4, conditions: 'Rain', icon: 'rain',
    }],
  }],
  alerts: [],
};

const visual = visualCrossing.normalizeVisualCrossing(
  visualRaw,
  { fetchedAt: '2026-08-22T14:00:00Z' }
);

assert.equal(visual.provider, 'visual-crossing');
assert.equal(visual.queryCost, 1);
assert.equal(visual.location.utcOffsetSeconds, -14400);
assert.equal(visual.hours[0].localTime, '2026-08-22T10:00');
assert.equal(visual.hours[0].precipProbabilityPct, 55);
assert.deepEqual(visual.hours[0].precipTypes, ['rain']);
assert.equal(visual.current.localTime, '2026-08-22T10:15');
assert.equal(visual.current.dewPointC, null);

const compatible = visualCrossing.toOpenMeteoPayload(visualRaw);
assert.equal(compatible.current.time, '2026-08-22T10:00');
assert.equal(compatible.current.weather_code, 2);
assert.equal(compatible.hourly.time[0], '2026-08-22T10:00');
assert.equal(compatible.hourly.weather_code[0], 61);
assert.equal(compatible.hourly.visibility[0], 20000);
assert.equal(compatible.daily.weather_code[0], 63);
assert.equal(compatible.daily.daylight_duration[0], 49080);
assert.equal(compatible.daily.rain_sum[0], 2.1);
assert.equal(compatible.daily.precipitation_hours[0], 1);
assert.equal(compatible.queryCost, 1);

const secretUrl = visualCrossing.timelineUrl({ lat: 43.65, lon: -79.38, apiKey: 'secret-value' });
assert.ok(secretUrl.includes('secret-value'));
assert.ok(!visualCrossing.redactedUrl(secretUrl).includes('secret-value'));
assert.match(visualCrossing.redactedUrl(secretUrl), /key=%5Bredacted%5D/);
assert.throws(() => visualCrossing.timelineUrl({ lat: 1, lon: 2 }), /required/);

const open = openMeteo.normalizeOpenMeteo({
  latitude: 43.65,
  longitude: -79.38,
  timezone: 'America/Toronto',
  utc_offset_seconds: -14400,
  current: { time: '2026-08-22T10:15', temperature_2m: 21.5, snowfall: 0 },
  hourly: {
    time: ['2026-08-22T10:00'],
    temperature_2m: [21.5],
    apparent_temperature: [22],
    relative_humidity_2m: [67],
    dew_point_2m: [15],
    precipitation: [0.1],
    precipitation_probability: [50],
    snowfall: [0],
    wind_speed_10m: [10],
    wind_gusts_10m: [18],
    wind_direction_10m: [210],
    pressure_msl: [1013],
    cloud_cover: [50],
    visibility: [18000],
    uv_index: [3.5],
    weather_code: [61],
    is_day: [1],
  },
  daily: {
    time: ['2026-08-22'],
    temperature_2m_max: [25],
    temperature_2m_min: [16],
    precipitation_sum: [1.5],
    precipitation_probability_max: [55],
    snowfall_sum: [0],
    wind_speed_10m_max: [17],
    wind_gusts_10m_max: [28],
    sunrise: ['2026-08-22T06:27'],
    sunset: ['2026-08-22T20:05'],
    weather_code: [61],
  },
}, { fetchedAt: '2026-08-22T14:00:00Z' });

assert.equal(open.provider, 'open-meteo');
assert.equal(open.hours[0].localTime, visual.hours[0].localTime);
assert.equal(open.hours[0].visibilityKm, 18);
assert.equal(open.days[0].highC, 25);
assert.equal(open.current.apparentC, null);
assert.match(openMeteo.forecastUrl({ lat: 43.65, lon: -79.38 }), /forecast_days=8/);

const originalProvider = process.env.WEATHER_PROVIDER;
process.env.WEATHER_PROVIDER = 'visual-crossing';
assert.equal(handlers._internals.configuredWeatherProvider(), 'visual-crossing');
process.env.WEATHER_PROVIDER = 'anything-else';
assert.equal(handlers._internals.configuredWeatherProvider(), 'open-meteo');
if (originalProvider === undefined) delete process.env.WEATHER_PROVIDER;
else process.env.WEATHER_PROVIDER = originalProvider;

const originalVisualFetch = visualCrossing.fetchOpenMeteoCompatible;
visualCrossing.fetchOpenMeteoCompatible = async () => compatible;
const visualResult = await handlers._internals.fetchWeather({
  lat: 43.65,
  lon: -79.38,
  openMeteoUrl: 'https://example.test/open-meteo',
  provider: 'visual-crossing',
});
visualCrossing.fetchOpenMeteoCompatible = originalVisualFetch;
assert.equal(visualResult.provider, 'visual-crossing');
assert.equal(visualResult.fallback, false);
assert.equal(visualResult.queryCost, 1);

console.log('All weather-provider adapter tests passed.');
