/**
 * A synthetic provider-neutral payload in exactly the shape `/api/weather` returns.
 *
 * Used by the smoke tests, and handy for driving the UI offline while working
 * on layout. `hours` must be a multiple of 24.
 */
export function buildFixture({ hours = 96, startTemp = 18 } = {}) {
  const time = [], temperature_2m = [], apparent_temperature = [], relative_humidity_2m = [];
  const dew_point_2m = [], precipitation_probability = [], precipitation = [], rain = [];
  const showers = [], snowfall = [], weather_code = [], pressure_msl = [], cloud_cover = [];
  const visibility = [], wind_speed_10m = [], wind_direction_10m = [], wind_gusts_10m = [];
  const uv_index = [], is_day = [];

  const start = new Date('2026-08-16T00:00');
  for (let i = 0; i < hours; i += 1) {
    const d = new Date(start.getTime() + i * 3600000);
    const pad = (n) => String(n).padStart(2, '0');
    time.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`);
    const hour = d.getHours();
    const t = startTemp + Math.sin(((hour - 9) / 24) * 2 * Math.PI) * 7;
    temperature_2m.push(Number(t.toFixed(1)));
    apparent_temperature.push(Number((t - 1.4).toFixed(1)));
    relative_humidity_2m.push(60 + (hour % 7) * 3);
    dew_point_2m.push(Number((t - 5).toFixed(1)));
    const wet = i > 40 && i < 46;
    precipitation_probability.push(wet ? 80 : 10);
    precipitation.push(wet ? 1.4 : 0);
    rain.push(wet ? 1.4 : 0);
    showers.push(0);
    snowfall.push(0);
    weather_code.push(wet ? 63 : hour > 6 && hour < 20 ? 2 : 0);
    pressure_msl.push(1014 - i * 0.08);
    cloud_cover.push(wet ? 95 : 30);
    visibility.push(wet ? 4000 : 24000);
    wind_speed_10m.push(12 + (i % 5) * 2);
    wind_direction_10m.push((i * 17) % 360);
    wind_gusts_10m.push(26 + (i % 5) * 3);
    uv_index.push(hour > 8 && hour < 18 ? 5 : 0);
    is_day.push(hour >= 6 && hour < 20 ? 1 : 0);
  }

  const days = [], dTime = [];
  for (let d = 0; d < hours / 24; d += 1) {
    const date = new Date(start.getTime() + d * 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    dTime.push(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
    days.push(d);
  }

  return {
    weatherProvider: 'visual-crossing',
    weatherProviderFallback: false,
    weatherProviderQueryCost: 1,
    location: { latitude: 45.42, longitude: -75.7, timezone: 'America/Toronto', utcOffsetSeconds: -14400 },
    current: {
      time: time[26], temperature_2m: temperature_2m[26], relative_humidity_2m: 62,
      apparent_temperature: apparent_temperature[26], is_day: 1, precipitation: 0,
      weather_code: 2, cloud_cover: 30, pressure_msl: 1012, surface_pressure: 1000,
      wind_speed_10m: 14, wind_direction_10m: 270, wind_gusts_10m: 31,
    },
    hourly: {
      time, temperature_2m, apparent_temperature, relative_humidity_2m, dew_point_2m,
      precipitation_probability, precipitation, rain, showers, snowfall, weather_code,
      pressure_msl, cloud_cover, visibility, wind_speed_10m, wind_direction_10m,
      wind_gusts_10m, uv_index, is_day,
    },
    daily: {
      time: dTime,
      weather_code: days.map(() => 3),
      temperature_2m_max: days.map((d) => 24 + d),
      temperature_2m_min: days.map((d) => 13 + d),
      apparent_temperature_max: days.map((d) => 25 + d),
      apparent_temperature_min: days.map((d) => 12 + d),
      sunrise: dTime.map((t) => `${t}T06:12`),
      sunset: dTime.map((t) => `${t}T20:18`),
      daylight_duration: days.map((d) => 50760 - d * 130),
      sunshine_duration: days.map(() => 30000),
      uv_index_max: days.map(() => 7),
      precipitation_sum: days.map((d) => (d === 1 ? 8.4 : 0)),
      rain_sum: days.map((d) => (d === 1 ? 8.4 : 0)),
      snowfall_sum: days.map(() => 0),
      precipitation_hours: days.map((d) => (d === 1 ? 6 : 0)),
      precipitation_probability_max: days.map((d) => (d === 1 ? 80 : 15)),
      wind_speed_10m_max: days.map(() => 22),
      wind_gusts_10m_max: days.map(() => 44),
      wind_direction_10m_dominant: days.map(() => 250),
    },
    index: { hourly: 26, daily: 1 },
    air: { current: { us_aqi: 42, pm2_5: 7.1, pm10: 12, ozone: 60, nitrogen_dioxide: 9, grass_pollen: 14 } },
    fetchedAt: new Date().toISOString(),
  };
}
