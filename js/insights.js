/**
 * The insights engine.
 *
 * Everything here is derived locally from the forecast arrays -- no extra API
 * calls, no vendor "premium" tier. This is the layer that turns numbers into
 * the things people actually want to know: when the rain starts, whether the
 * afternoon is worth a bike ride, how today stacks up against a normal
 * August 17.
 */

import { describe, isFrozen, isThunder } from './wmo.js';
import { parseLocal } from './format.js';
import { clamp } from './dom.js';

/* ------------------------------------------------------- series building */

function at(array, index) {
  return Array.isArray(array) ? array[index] : null;
}

/** Flatten Open-Meteo's parallel hourly arrays into one array of objects. */
export function hourlySeries(data) {
  const h = data && data.hourly;
  if (!h || !Array.isArray(h.time)) return [];

  return h.time.map((time, i) => ({
    index: i,
    time,
    date: parseLocal(time),
    temp: at(h.temperature_2m, i),
    feels: at(h.apparent_temperature, i),
    humidity: at(h.relative_humidity_2m, i),
    dewPoint: at(h.dew_point_2m, i),
    pop: at(h.precipitation_probability, i),
    precip: at(h.precipitation, i),
    rain: at(h.rain, i),
    showers: at(h.showers, i),
    snowfall: at(h.snowfall, i),
    code: at(h.weather_code, i),
    pressure: at(h.pressure_msl, i),
    cloud: at(h.cloud_cover, i),
    visibility: at(h.visibility, i),
    wind: at(h.wind_speed_10m, i),
    gust: at(h.wind_gusts_10m, i),
    windDir: at(h.wind_direction_10m, i),
    uv: at(h.uv_index, i),
    isDay: at(h.is_day, i),
  }));
}

/** Flatten the daily arrays the same way. */
export function dailySeries(data) {
  const d = data && data.daily;
  if (!d || !Array.isArray(d.time)) return [];

  return d.time.map((time, i) => ({
    index: i,
    time,
    date: parseLocal(time),
    code: at(d.weather_code, i),
    high: at(d.temperature_2m_max, i),
    low: at(d.temperature_2m_min, i),
    feelsHigh: at(d.apparent_temperature_max, i),
    feelsLow: at(d.apparent_temperature_min, i),
    sunrise: at(d.sunrise, i),
    sunset: at(d.sunset, i),
    daylight: at(d.daylight_duration, i),
    sunshine: at(d.sunshine_duration, i),
    uvMax: at(d.uv_index_max, i),
    precipSum: at(d.precipitation_sum, i),
    rainSum: at(d.rain_sum, i),
    snowSum: at(d.snowfall_sum, i),
    precipHours: at(d.precipitation_hours, i),
    popMax: at(d.precipitation_probability_max, i),
    windMax: at(d.wind_speed_10m_max, i),
    gustMax: at(d.wind_gusts_10m_max, i),
    windDir: at(d.wind_direction_10m_dominant, i),
  }));
}

/** The forecast from "now" forward, trimmed to `hours`. */
export function upcoming(series, nowIndex, hours = 48) {
  const start = Math.max(0, nowIndex);
  return series.slice(start, start + hours);
}

/* ------------------------------------------------------------- comfort */

/**
 * A 0-100 "how pleasant is it to be outside" score.
 *
 * Deliberately opinionated: it targets the temperate band most people find
 * comfortable and penalises the things that actually ruin being outdoors --
 * precipitation, wind, mugginess, and harsh sun.
 */
export function comfortScore(hour) {
  if (!hour) return null;
  const t = hour.feels !== null && hour.feels !== undefined ? hour.feels : hour.temp;
  if (t === null || t === undefined) return null;

  let score = 100;

  if (t < 15) score -= Math.min(62, (15 - t) * 3.2);
  else if (t > 24) score -= Math.min(62, (t - 24) * 4.2);

  score -= Math.min(35, (hour.pop || 0) * 0.3 + (hour.precip || 0) * 6);
  score -= Math.min(24, Math.max(0, (hour.wind || 0) - 18) * 0.9);
  score -= Math.min(14, Math.max(0, (hour.gust || 0) - 40) * 0.5);

  // Humidity only bites once it is warm enough to matter.
  if (t > 22 && hour.humidity > 65) score -= Math.min(15, (hour.humidity - 65) * 0.4);
  score -= Math.min(10, Math.max(0, (hour.uv || 0) - 7) * 2);

  return clamp(Math.round(score), 0, 100);
}

export function comfortLabel(score) {
  if (score === null) return 'Unknown';
  if (score >= 85) return 'Perfect';
  if (score >= 70) return 'Great';
  if (score >= 55) return 'Pleasant';
  if (score >= 40) return 'Tolerable';
  if (score >= 25) return 'Unpleasant';
  return 'Stay in';
}

/* ------------------------------------------------------------ pressure */

/**
 * Pressure change over the last 3 hours, the classic short-term signal.
 * A fall steeper than ~2 hPa/3h is the range people with barometric
 * migraines tend to notice.
 */
export function pressureTrend(series, nowIndex) {
  const now = series[nowIndex];
  const past = series[nowIndex - 3];
  if (!now || !past || now.pressure === null || past.pressure === null) return null;

  const delta = now.pressure - past.pressure;
  const magnitude = Math.abs(delta);

  let direction = 'steady';
  if (delta >= 1) direction = 'rising';
  else if (delta <= -1) direction = 'falling';

  let rate = 'slowly';
  if (magnitude >= 3) rate = 'rapidly';
  else if (magnitude >= 1.6) rate = 'steadily';

  return {
    delta,
    direction,
    rate,
    current: now.pressure,
    // Sharp swings in either direction are what trigger sensitivity.
    sensitive: magnitude >= 2.5,
    outlook:
      direction === 'rising'
        ? 'Settling down -- clearer, calmer weather usually follows.'
        : direction === 'falling'
          ? 'Unsettled -- cloud, wind or precipitation often follow.'
          : 'No meaningful change in the last three hours.',
  };
}

/* --------------------------------------------------------- precip timing */

/** When does precipitation start or stop? Scans the next `hours` hours. */
export function precipTiming(series, nowIndex, hours = 24) {
  const window = upcoming(series, nowIndex, hours);
  if (!window.length) return null;

  const wet = (h) => (h.precip || 0) >= 0.1 || (h.pop || 0) >= 50;
  const rainingNow = wet(window[0]);

  if (rainingNow) {
    const stopIndex = window.findIndex((h, i) => i > 0 && !wet(h));
    return {
      state: 'active',
      endsAt: stopIndex > 0 ? window[stopIndex].time : null,
      // No dry hour in the window means it is wet for the whole period.
      openEnded: stopIndex === -1,
    };
  }

  const startIndex = window.findIndex(wet);
  if (startIndex === -1) return { state: 'dry', hours };

  const endIndex = window.findIndex((h, i) => i > startIndex && !wet(h));
  const peak = window
    .slice(startIndex, endIndex === -1 ? window.length : endIndex)
    .reduce((best, h) => ((h.precip || 0) > (best.precip || 0) ? h : best), window[startIndex]);

  return {
    state: 'incoming',
    startsAt: window[startIndex].time,
    endsAt: endIndex === -1 ? null : window[endIndex].time,
    peak,
    type: isFrozen(window[startIndex].code) ? 'snow' : 'rain',
  };
}

/** Hours since precipitation last fell (capped by the available history). */
export function dryStreak(series, nowIndex) {
  let hours = 0;
  for (let i = nowIndex; i >= 0; i -= 1) {
    if ((series[i].precip || 0) >= 0.1) break;
    hours += 1;
  }
  return { hours, capped: hours >= nowIndex };
}

/* ------------------------------------------------------------ narrative */

/**
 * A short plain-language briefing, in the register a person would use.
 * Returned as separate sentences so the UI can lay them out.
 */
export function buildNarrative(context) {
  const { current, series, nowIndex, days, todayIndex, placeName, units } = context;
  const sentences = [];
  if (!current) return sentences;

  const condition = describe(current.weather_code, current.is_day);
  const t = Math.round(current.temperature_2m);
  const feels = Math.round(current.apparent_temperature);
  const unit = units.temp === 'f' ? '°F' : '°C';
  const show = (celsius) =>
    Math.round(units.temp === 'f' ? celsius * 9 / 5 + 32 : celsius);

  sentences.push(
    `It is ${show(current.temperature_2m)}${unit} and ${condition.label.toLowerCase()} in ${placeName}` +
      (Math.abs(t - feels) >= 2 ? `, feeling more like ${show(current.apparent_temperature)}${unit}.` : '.')
  );

  const timing = precipTiming(series, nowIndex, 24);
  if (timing && timing.state === 'active') {
    sentences.push(
      timing.openEnded
        ? 'Precipitation is falling and looks set to continue through the next day.'
        : `Precipitation is falling and should ease around ${formatHour(timing.endsAt, units)}.`
    );
  } else if (timing && timing.state === 'incoming') {
    const peakAmount = timing.peak && timing.peak.precip ? timing.peak.precip : 0;
    const weight = peakAmount >= 4 ? 'Heavy' : peakAmount >= 1 ? 'Steady' : 'Light';
    sentences.push(
      `${weight} ${timing.type} moves in around ${formatHour(timing.startsAt, units)}` +
        (timing.endsAt ? `, clearing by ${formatHour(timing.endsAt, units)}.` : ' and lingers past the evening.')
    );
  } else if (timing) {
    sentences.push('Nothing wet on the radar for the next 24 hours.');
  }

  // Where the temperature is heading over the rest of the working day.
  const next6 = upcoming(series, nowIndex, 7);
  if (next6.length >= 6) {
    const change = next6[next6.length - 1].temp - next6[0].temp;
    if (Math.abs(change) >= 3) {
      sentences.push(
        `Temperatures ${change > 0 ? 'climb' : 'drop'} about ${Math.abs(Math.round(units.temp === 'f' ? change * 9 / 5 : change))}${unit === '°F' ? '°F' : '°C'} over the next six hours.`
      );
    }
  }

  const gust = current.wind_gusts_10m;
  if (gust >= 45) {
    sentences.push(
      `Wind is the story: gusts to ${Math.round(units.wind === 'mph' ? gust * 0.621371 : gust)} ${units.wind === 'mph' ? 'mph' : 'km/h'}.`
    );
  }

  const today = days[todayIndex];
  const tomorrow = days[todayIndex + 1];
  if (today && tomorrow) {
    const swing = tomorrow.high - today.high;
    const tomorrowCondition = describe(tomorrow.code, 1);
    sentences.push(
      `Tomorrow: ${tomorrowCondition.label.toLowerCase()}, high ${show(tomorrow.high)}${unit}` +
        (Math.abs(swing) >= 4
          ? `, ${Math.abs(Math.round(units.temp === 'f' ? swing * 9 / 5 : swing))} degrees ${swing > 0 ? 'warmer' : 'cooler'} than today.`
          : '.')
    );
  }

  return sentences;
}

function formatHour(iso, units) {
  const date = parseLocal(iso);
  if (!date) return 'later';
  const hour = date.getHours();
  if (units.clock === '24') return `${String(hour).padStart(2, '0')}:00`;
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${hour < 12 ? 'am' : 'pm'}`;
}

/* ---------------------------------------------------------- activities */

/**
 * Activity definitions.
 *
 * Each returns 0-100 for a single hour. `daylight` restricts an activity to
 * daytime hours; `night` to dark ones. Adding a new activity is a matter of
 * appending one object here -- nothing else needs to change.
 */
export const ACTIVITIES = [
  {
    id: 'run',
    label: 'Go for a run',
    icon: 'thermometer',
    blurb: 'Cool, calm and dry',
    score: (h) => {
      const t = h.feels ?? h.temp;
      let s = 100;
      s -= Math.abs(t - 11) * 3.4;                       // 11C is the sweet spot
      s -= (h.pop || 0) * 0.45 + (h.precip || 0) * 9;
      s -= Math.max(0, (h.wind || 0) - 20) * 1.1;
      s -= Math.max(0, (h.uv || 0) - 6) * 3;
      if (h.humidity > 80 && t > 18) s -= 12;
      return s;
    },
  },
  {
    id: 'walk',
    label: 'Walk the dog',
    icon: 'leaf',
    blurb: 'Mild, no downpours, no ice',
    score: (h) => {
      const t = h.feels ?? h.temp;
      let s = 100;
      s -= Math.abs(t - 16) * 2.4;
      s -= (h.pop || 0) * 0.4 + (h.precip || 0) * 8;
      s -= Math.max(0, (h.wind || 0) - 25) * 0.9;
      if (isFrozen(h.code)) s -= 25;                     // salted paws, icy paths
      if (t < -12) s -= 30;
      return s;
    },
  },
  {
    id: 'cycle',
    label: 'Ride a bike',
    icon: 'wind',
    blurb: 'Wind matters more than temperature',
    score: (h) => {
      const t = h.feels ?? h.temp;
      let s = 100;
      s -= Math.abs(t - 18) * 2.6;
      s -= Math.max(0, (h.wind || 0) - 12) * 1.9;        // headwinds dominate
      s -= Math.max(0, (h.gust || 0) - 30) * 1.2;
      s -= (h.pop || 0) * 0.5 + (h.precip || 0) * 10;
      if (isFrozen(h.code)) s -= 40;
      return s;
    },
  },
  {
    id: 'patio',
    label: 'Patio or BBQ',
    icon: 'sunrise',
    blurb: 'Warm, dry, and not too breezy',
    score: (h) => {
      const t = h.feels ?? h.temp;
      let s = 100;
      s -= Math.abs(t - 24) * 3.6;
      s -= (h.pop || 0) * 0.55 + (h.precip || 0) * 12;
      s -= Math.max(0, (h.wind || 0) - 16) * 1.6;
      s -= Math.max(0, (h.cloud || 0) - 70) * 0.2;
      return s;
    },
  },
  {
    id: 'garden',
    label: 'Garden work',
    icon: 'leaf',
    blurb: 'Mild and dry, sun optional',
    daylight: true,
    score: (h) => {
      const t = h.feels ?? h.temp;
      let s = 100;
      s -= Math.abs(t - 19) * 2.6;
      s -= (h.pop || 0) * 0.5 + (h.precip || 0) * 10;
      s -= Math.max(0, (h.wind || 0) - 25) * 0.8;
      s -= Math.max(0, (h.uv || 0) - 7) * 3;
      return s;
    },
  },
  {
    id: 'laundry',
    label: 'Line-dry laundry',
    icon: 'wind',
    blurb: 'Dry air plus a working breeze',
    daylight: true,
    score: (h) => {
      let s = 100;
      s -= (h.pop || 0) * 0.9 + (h.precip || 0) * 25;    // one shower ruins it
      s -= Math.max(0, (h.humidity || 0) - 55) * 0.8;
      s -= Math.max(0, 8 - (h.wind || 0)) * 3;           // needs some air movement
      s -= Math.max(0, (h.wind || 0) - 35) * 1.5;
      s -= Math.max(0, 12 - (h.temp ?? 0)) * 2;
      return s;
    },
  },
  {
    id: 'stargaze',
    label: 'Stargazing',
    icon: 'uv',
    blurb: 'Clear, dark and calm',
    night: true,
    score: (h) => {
      let s = 100;
      s -= (h.cloud || 0) * 0.85;                        // cloud is decisive
      s -= (h.pop || 0) * 0.4;
      s -= Math.max(0, (h.humidity || 0) - 80) * 0.7;    // haze and dew
      s -= Math.max(0, 5000 - (h.visibility ?? 20000)) / 200;
      s -= Math.max(0, -8 - (h.feels ?? h.temp ?? 0)) * 1.4;
      return s;
    },
  },
  {
    id: 'photo',
    label: 'Golden-hour photos',
    icon: 'sunset',
    blurb: 'Scattered cloud catches the light',
    daylight: true,
    score: (h, ctx) => {
      let s = 40;
      // Being inside the golden hour is most of the score.
      if (ctx && ctx.goldenHours && ctx.goldenHours.has(h.time)) s += 45;
      const cloud = h.cloud || 0;
      s += 20 - Math.abs(cloud - 40) * 0.5;              // 40% cloud is ideal
      s -= (h.precip || 0) * 12;
      s -= Math.max(0, (h.wind || 0) - 30) * 0.6;
      return s;
    },
  },
];

/**
 * Best window for each activity over the next `hours`.
 * Windows are contiguous runs of hours scoring at least `threshold`.
 */
export function activityWindows(series, nowIndex, context = {}, { hours = 48, threshold = 55 } = {}) {
  const window = upcoming(series, nowIndex, hours);
  if (!window.length) return [];

  return ACTIVITIES.map((activity) => {
    const scored = window.map((hour) => {
      const daylightOk = !activity.daylight || hour.isDay === 1;
      const nightOk = !activity.night || hour.isDay === 0;
      const raw = daylightOk && nightOk ? activity.score(hour, context) : -1;
      return { hour, score: raw < 0 ? 0 : clamp(Math.round(raw), 0, 100), eligible: daylightOk && nightOk };
    });

    // Find the highest-scoring contiguous run above the threshold.
    let best = null;
    let run = null;
    for (const entry of scored) {
      if (entry.eligible && entry.score >= threshold) {
        run = run
          ? { ...run, end: entry.hour, peak: Math.max(run.peak, entry.score), length: run.length + 1 }
          : { start: entry.hour, end: entry.hour, peak: entry.score, length: 1 };
        if (!best || run.peak > best.peak || (run.peak === best.peak && run.length > best.length)) {
          best = run;
        }
      } else {
        run = null;
      }
    }

    const peakHour = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]);

    return {
      ...activity,
      window: best,
      bestScore: peakHour.score,
      bestHour: peakHour.hour,
      nowScore: scored[0].eligible ? scored[0].score : null,
    };
  }).sort((a, b) => b.bestScore - a.bestScore);
}

/* ---------------------------------------------------------- sun and moon */

/** Golden-hour and blue-hour windows for a given day, as hour keys. */
export function solarWindows(day) {
  if (!day || !day.sunrise || !day.sunset) return { goldenHours: new Set(), golden: null, blue: null };

  const sunrise = parseLocal(day.sunrise);
  const sunset = parseLocal(day.sunset);
  const GOLDEN_MS = 55 * 60000;
  const BLUE_MS = 30 * 60000;

  const golden = {
    morning: [sunrise, new Date(sunrise.getTime() + GOLDEN_MS)],
    evening: [new Date(sunset.getTime() - GOLDEN_MS), sunset],
  };
  const blue = {
    morning: [new Date(sunrise.getTime() - BLUE_MS), sunrise],
    evening: [sunset, new Date(sunset.getTime() + BLUE_MS)],
  };

  // Snap to the hour keys used by the hourly series so the activity scorer
  // can test membership cheaply.
  const goldenHours = new Set();
  for (const [start, end] of [golden.morning, golden.evening]) {
    const cursor = new Date(start);
    cursor.setMinutes(0, 0, 0);
    while (cursor <= end) {
      goldenHours.add(toHourKey(cursor));
      cursor.setHours(cursor.getHours() + 1);
    }
  }

  return { golden, blue, goldenHours };
}

function toHourKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

const SYNODIC_MONTH = 29.530588853;
const PHASE_NAMES = [
  'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
  'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent',
];

/** Moon phase from the mean synodic cycle -- accurate to a few hours. */
export function moonPhase(date = new Date()) {
  const julian = date.getTime() / 86400000 + 2440587.5;
  const phase = (((julian - 2451550.1) / SYNODIC_MONTH) % 1 + 1) % 1;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const nameIndex = Math.round(phase * 8) % 8;

  return {
    phase,
    illumination,
    name: PHASE_NAMES[nameIndex],
    age: phase * SYNODIC_MONTH,
    daysToFull: ((0.5 - phase + 1) % 1) * SYNODIC_MONTH,
    daysToNew: ((1 - phase) % 1) * SYNODIC_MONTH,
  };
}

/** Tonight's viewing quality: cloud first, then moonlight. */
export function stargazingOutlook(series, nowIndex, moon) {
  const night = upcoming(series, nowIndex, 24).filter((h) => h.isDay === 0);
  if (!night.length) return null;

  const avgCloud = night.reduce((sum, h) => sum + (h.cloud || 0), 0) / night.length;
  const clearest = night.reduce((a, b) => ((b.cloud || 0) < (a.cloud || 0) ? b : a), night[0]);

  let score = 100 - avgCloud * 0.85 - moon.illumination * 25;
  score = clamp(Math.round(score), 0, 100);

  return {
    score,
    avgCloud,
    clearestHour: clearest,
    verdict:
      score >= 75 ? 'Excellent' : score >= 55 ? 'Decent' : score >= 35 ? 'Marginal' : 'Poor',
  };
}

/** Day length change against yesterday. */
export function daylightChange(days, todayIndex) {
  const today = days[todayIndex];
  const yesterday = days[todayIndex - 1];
  if (!today || !yesterday || today.daylight === null || yesterday.daylight === null) return null;
  return { seconds: today.daylight, delta: today.daylight - yesterday.daylight };
}

/* -------------------------------------------------------------- watches */

/**
 * Locally computed advisories.
 *
 * These are NOT official government warnings -- they are thresholds applied to
 * the forecast so the dashboard flags severe conditions everywhere on Earth,
 * including the many regions with no machine-readable alert feed. Where
 * official alerts exist they are shown above these, clearly labelled.
 */
export function computeWatches(context) {
  const { series, nowIndex, days, todayIndex, air } = context;
  const watches = [];
  const next48 = upcoming(series, nowIndex, 48);
  const nearDays = days.slice(todayIndex, todayIndex + 3);

  const add = (id, level, title, detail, when) =>
    watches.push({ id, level, title, detail, when: when || null });

  for (const day of nearDays) {
    const when = day.time;

    if (day.feelsHigh >= 35) add(`heat-${when}`, 'warning', 'Extreme heat', `Feels-like high near ${Math.round(day.feelsHigh)}°C. Limit exertion and check on people who live alone.`, when);
    else if (day.feelsHigh >= 30) add(`heat-${when}`, 'advisory', 'Heat advisory', `Feels-like high near ${Math.round(day.feelsHigh)}°C.`, when);

    if (day.feelsLow <= -30) add(`cold-${when}`, 'warning', 'Extreme cold', `Wind chill near ${Math.round(day.feelsLow)}°C. Exposed skin can freeze within minutes.`, when);
    else if (day.feelsLow <= -20) add(`cold-${when}`, 'advisory', 'Cold warning', `Wind chill near ${Math.round(day.feelsLow)}°C.`, when);

    if (day.gustMax >= 90) add(`wind-${when}`, 'warning', 'Damaging wind', `Gusts to ${Math.round(day.gustMax)} km/h. Expect branches down and power interruptions.`, when);
    else if (day.gustMax >= 65) add(`wind-${when}`, 'advisory', 'Strong wind', `Gusts to ${Math.round(day.gustMax)} km/h.`, when);

    if (day.snowSum >= 20) add(`snow-${when}`, 'warning', 'Heavy snowfall', `Around ${Math.round(day.snowSum)} cm expected.`, when);
    else if (day.snowSum >= 8) add(`snow-${when}`, 'advisory', 'Snowfall', `Around ${Math.round(day.snowSum)} cm expected.`, when);

    if (day.rainSum >= 40) add(`rain-${when}`, 'warning', 'Heavy rainfall', `Around ${Math.round(day.rainSum)} mm expected. Watch for ponding and flash flooding.`, when);
    else if (day.rainSum >= 20) add(`rain-${when}`, 'advisory', 'Rainfall', `Around ${Math.round(day.rainSum)} mm expected.`, when);

    if (day.uvMax >= 9) add(`uv-${when}`, 'advisory', 'Very high UV', `UV index peaks near ${Math.round(day.uvMax)}. Burn time under 15 minutes.`, when);
  }

  const freezing = next48.find((h) => isFrozen(h.code) && [56, 57, 66, 67].includes(h.code));
  if (freezing) add('icing', 'warning', 'Freezing rain', 'Ice accretion expected. Roads and walkways will be treacherous.', freezing.time);

  const storm = next48.find((h) => isThunder(h.code));
  if (storm) add('thunder', 'advisory', 'Thunderstorms', 'Storms in the forecast window. Lightning risk outdoors.', storm.time);

  const fog = next48.slice(0, 12).find((h) => (h.visibility ?? 99999) < 500);
  if (fog) add('fog', 'advisory', 'Dense fog', 'Visibility under 500 m. Slow down on the roads.', fog.time);

  // A frost advisory only makes sense if it is not already deep winter.
  const frostDay = nearDays.find((d) => d.low !== null && d.low <= 1 && d.low > -6);
  if (frostDay && (days[todayIndex] || {}).high > 8) {
    add('frost', 'advisory', 'Frost risk', `Overnight low near ${Math.round(frostDay.low)}°C. Cover tender plants.`, frostDay.time);
  }

  const aqi = air && air.current ? (air.current.us_aqi ?? air.current.european_aqi) : null;
  if (aqi !== null && aqi !== undefined) {
    if (aqi >= 150) add('air', 'warning', 'Unhealthy air', `Air quality index ${Math.round(aqi)}. Limit time outdoors.`, null);
    else if (aqi >= 100) add('air', 'advisory', 'Poor air quality', `Air quality index ${Math.round(aqi)}. Sensitive groups take care.`, null);
  }

  const order = { warning: 0, advisory: 1 };
  return watches.sort((a, b) => order[a.level] - order[b.level]);
}

/* ------------------------------------------------------- air quality */

const AQI_BANDS = [
  { max: 50,  label: 'Good',      tone: 'good' },
  { max: 100, label: 'Moderate',  tone: 'moderate' },
  { max: 150, label: 'Unhealthy for sensitive groups', tone: 'sensitive' },
  { max: 200, label: 'Unhealthy', tone: 'unhealthy' },
  { max: 300, label: 'Very unhealthy', tone: 'very' },
  { max: Infinity, label: 'Hazardous', tone: 'hazardous' },
];

export function aqiBand(value) {
  if (value === null || value === undefined) return null;
  return AQI_BANDS.find((band) => value <= band.max);
}

/* --------------------------------------------------------- comparisons */

/** Rank saved locations by how pleasant they are right now. */
export function rankLocations(entries) {
  return entries
    .filter((entry) => entry.data && entry.data.current)
    .map((entry) => {
      const current = entry.data.current;
      const pseudoHour = {
        temp: current.temperature_2m,
        feels: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        pop: current.precipitation > 0 ? 100 : 0,
        precip: current.precipitation,
        wind: current.wind_speed_10m,
        gust: current.wind_gusts_10m,
        uv: 0,
      };
      return {
        place: entry.place,
        current,
        score: comfortScore(pseudoHour),
        condition: describe(current.weather_code, current.is_day),
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** Today's numbers against the 20-year normal. */
export function almanacComparison(almanac, today) {
  if (!almanac || !almanac.available || !today) return null;

  const highDelta = today.high - almanac.normalHigh;
  const lowDelta = today.low - almanac.normalLow;

  let verdict = 'right about normal';
  const magnitude = Math.abs(highDelta);
  if (magnitude >= 10) verdict = highDelta > 0 ? 'extraordinarily warm' : 'extraordinarily cold';
  else if (magnitude >= 6) verdict = highDelta > 0 ? 'much warmer than normal' : 'much colder than normal';
  else if (magnitude >= 2.5) verdict = highDelta > 0 ? 'warmer than normal' : 'colder than normal';

  return {
    highDelta,
    lowDelta,
    verdict,
    nearRecordHigh: almanac.recordHigh && today.high >= almanac.recordHigh.value - 1.5,
    nearRecordLow: almanac.recordLow && today.low <= almanac.recordLow.value + 1.5,
  };
}

/** Aurora visibility from the planetary K index and latitude. */
export function auroraOutlook(kp, latitude) {
  if (!Number.isFinite(kp)) return null;
  // Approximate equatorward edge of the auroral oval by Kp.
  const visibleAbove = 66.5 - kp * 2.5;
  const absLatitude = Math.abs(latitude);

  return {
    kp,
    visibleAbove,
    likely: absLatitude >= visibleAbove,
    marginal: absLatitude >= visibleAbove - 4 && absLatitude < visibleAbove,
    level: kp >= 7 ? 'Severe storm' : kp >= 5 ? 'Geomagnetic storm' : kp >= 4 ? 'Active' : 'Quiet',
  };
}
