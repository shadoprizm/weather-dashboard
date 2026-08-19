/**
 * The core forecast views: hero, briefing, hourly strip, detail tiles and the
 * extended daily outlook.
 *
 * Every view is a pure function from view-model to an HTML string. Nothing
 * here touches the network or global state, which keeps re-rendering on a unit
 * change trivially cheap.
 */

import { esc } from '../dom.js';
import { describe } from '../wmo.js';
import { weatherIcon, windArrow, glyph } from '../icons.js';
import * as fmt from '../format.js';
import {
  comfortScore, comfortLabel, pressureTrend, buildNarrative,
  almanacComparison, dryStreak,
} from '../insights.js';

/* ---------------------------------------------------------------- hero */

export function renderHero(vm) {
  const { current, place, units, days, todayIndex, almanac, updatedAt } = vm;
  if (!current) return errorPanel('Current conditions are unavailable.');

  const condition = describe(current.weather_code, current.is_day);
  const today = days[todayIndex];
  const comparison = almanacComparison(almanac, today);

  const score = comfortScore({
    temp: current.temperature_2m,
    feels: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    pop: 0,
    precip: current.precipitation,
    wind: current.wind_speed_10m,
    gust: current.wind_gusts_10m,
    uv: 0,
  });

  const localTime = fmt.localClock(vm.utcOffsetSeconds, units);

  return `
    <div class="hero">
      <div class="hero-head">
        <h1 class="hero-place">${esc(vm.heading || place.name)}</h1>
        <p class="hero-meta">
          <span>${esc(place.admin1 || place.country || '')}</span>
          <span class="dot" aria-hidden="true">·</span>
          <span>${esc(localTime)} local</span>
          ${updatedAt ? `<span class="dot" aria-hidden="true">·</span><span class="hero-updated">updated ${esc(fmt.relative(updatedAt))}</span>` : ''}
        </p>
      </div>

      <div class="hero-body">
        <div class="hero-now">
          ${weatherIcon(condition.icon, { size: 108, className: 'hero-icon', title: condition.label })}
          <div class="hero-readout">
            <p class="hero-temp">${esc(fmt.temp(current.temperature_2m, units))}</p>
            <p class="hero-condition">${esc(condition.label)}</p>
            <p class="hero-feels">Feels like ${esc(fmt.temp(current.apparent_temperature, units))}</p>
          </div>
        </div>

        <div class="hero-side">
          ${today ? `
            <div class="hero-range">
              <span class="range-high">${esc(fmt.temp(today.high, units))}</span>
              <span class="range-sep" aria-hidden="true">/</span>
              <span class="range-low">${esc(fmt.temp(today.low, units))}</span>
              <span class="range-label">today's high / low</span>
            </div>` : ''}

          ${comparison ? `
            <p class="hero-normal ${comparison.highDelta >= 0 ? 'is-warm' : 'is-cool'}">
              ${esc(fmt.tempDelta(comparison.highDelta, units))} vs normal
              <span>— ${esc(comparison.verdict)}</span>
            </p>` : ''}

          <div class="comfort" data-band="${comfortBand(score)}">
            <div class="comfort-ring" style="--pct: ${score}">
              <span class="comfort-value">${score}</span>
            </div>
            <div class="comfort-copy">
              <p class="comfort-label">${esc(comfortLabel(score))}</p>
              <p class="comfort-sub">Outdoor comfort right now</p>
            </div>
          </div>
        </div>
      </div>

      ${renderBriefingBody(vm)}

      <ul class="hero-stats">
        ${stat('wind', 'Wind', `${fmt.wind(current.wind_speed_10m, units)} ${fmt.compass(current.wind_direction_10m)}`)}
        ${stat('drop', 'Humidity', fmt.percent(current.relative_humidity_2m))}
        ${stat('cloud', 'Cloud', fmt.percent(current.cloud_cover))}
        ${today ? stat('uv', 'UV peak', today.uvMax === null ? '--' : String(Math.round(today.uvMax))) : ''}
        ${today ? stat('humidity', 'Rain chance', fmt.percent(today.popMax)) : ''}
      </ul>
    </div>
  `;
}

function stat(icon, label, value) {
  return `<li class="hero-stat">
    ${glyph(icon, { size: 16 })}
    <span class="stat-label">${esc(label)}</span>
    <span class="stat-value">${esc(value)}</span>
  </li>`;
}

function comfortBand(score) {
  if (score >= 70) return 'good';
  if (score >= 45) return 'fair';
  if (score >= 25) return 'poor';
  return 'bad';
}

/* ------------------------------------------------------------ briefing */

/**
 * The briefing body: prose plus a couple of context chips.
 *
 * Rendered inside the hero rather than as its own panel — "what is it doing
 * and what is it about to do" is one thought, and the hub should read as one
 * card. Still exported separately so it can be tested in isolation.
 */
export function renderBriefingBody(vm) {
  const sentences = buildNarrative({
    current: vm.current,
    series: vm.series,
    nowIndex: vm.nowIndex,
    days: vm.days,
    todayIndex: vm.todayIndex,
    placeName: vm.place.name,
    units: vm.units,
  });

  if (!sentences.length) return '';

  const streak = dryStreak(vm.series, vm.nowIndex);
  const trend = pressureTrend(vm.series, vm.nowIndex);

  return `
    <div class="briefing">
      <p class="briefing-text">${sentences.map((s) => esc(s)).join(' ')}</p>
      <ul class="briefing-chips">
        ${trend ? `<li class="chip">Pressure ${esc(trend.direction)} ${esc(trend.rate)}
          <span>${esc(fmt.pressure(trend.current, vm.units))}</span></li>` : ''}
        ${streak.hours >= 6 ? `<li class="chip">${streak.capped ? '48h+' : `${streak.hours}h`} since rain</li>` : ''}
        ${trend && trend.sensitive ? '<li class="chip chip-flag">Sharp pressure swing</li>' : ''}
      </ul>
    </div>
  `;
}

/** Standalone panel form, kept for anyone rendering the briefing on its own. */
export function renderBriefing(vm) {
  const body = renderBriefingBody(vm);
  if (!body) return '';
  return `
    <header class="panel-head">
      <h2>The briefing</h2>
      <p class="panel-sub">Written from the raw forecast, not a press release.</p>
    </header>
    ${body}
  `;
}

/* -------------------------------------------------------------- hourly */

const COL_WIDTH = 66;
const CURVE_HEIGHT = 92;

/**
 * The hourly strip: a temperature curve drawn over aligned columns, with
 * precipitation probability bars beneath.
 */
export function renderHourly(vm) {
  const { units, selectedDay } = vm;
  const hours = selectedDay ? vm.dayHours : vm.next48;
  if (!hours || !hours.length) return errorPanel('Hourly data is unavailable.');

  const temps = hours.map((h) => h.temp).filter((t) => Number.isFinite(t));
  if (!temps.length) return errorPanel('Hourly temperatures are unavailable.');

  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const width = hours.length * COL_WIDTH;
  const padding = 26;

  const points = hours.map((hour, i) => {
    const x = i * COL_WIDTH + COL_WIDTH / 2;
    const span = max - min || 1;
    const y = padding + (1 - (hour.temp - min) / span) * (CURVE_HEIGHT - padding * 1.5);
    return { x, y, hour };
  });

  const line = smoothPath(points);
  const area = `${line} L ${points[points.length - 1].x} ${CURVE_HEIGHT} L ${points[0].x} ${CURVE_HEIGHT} Z`;

  const maxPop = Math.max(10, ...hours.map((h) => h.pop || 0));

  return `
    <header class="panel-head">
      <h2>${selectedDay ? esc(fmt.dayName(selectedDay, { long: true })) : 'Next 48 hours'}</h2>
      <div class="panel-tools">
        ${selectedDay
          ? '<button type="button" class="ghost-button" data-action="clear-day">Back to next 48h</button>'
          : '<p class="panel-sub">Scroll sideways — or pick a day below.</p>'}
      </div>
    </header>

    <div class="hourly-scroll" tabindex="0" role="group" aria-label="Hourly forecast, scrollable">
      <div class="hourly-track" style="width:${width}px">
        <svg class="hourly-curve" width="${width}" height="${CURVE_HEIGHT}"
             viewBox="0 0 ${width} ${CURVE_HEIGHT}" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--curve-top)"/>
              <stop offset="100%" stop-color="var(--curve-bottom)"/>
            </linearGradient>
          </defs>
          <path class="curve-area" d="${area}" fill="url(#curve-fill)"/>
          <path class="curve-line" d="${line}"/>
          ${points.map((p) => `<circle class="curve-dot" cx="${p.x}" cy="${p.y}" r="2.6"/>`).join('')}
          ${points.map((p) => `<text class="curve-label" x="${p.x}" y="${p.y - 11}" text-anchor="middle">${fmt.tempValue(p.hour.temp, units) ?? '--'}°</text>`).join('')}
        </svg>

        <div class="hourly-cols">
          ${hours.map((hour, i) => hourColumn(hour, i, units, maxPop)).join('')}
        </div>
      </div>
    </div>
  `;
}

function hourColumn(hour, index, units, maxPop) {
  const condition = describe(hour.code, hour.isDay);
  const pop = hour.pop || 0;
  const barHeight = Math.round((pop / maxPop) * 100);
  const isNow = index === 0;
  const dayBreak = hour.date && hour.date.getHours() === 0;

  return `
    <div class="hourly-col ${isNow ? 'is-now' : ''} ${dayBreak ? 'is-daybreak' : ''}">
      <p class="h-time">${isNow ? 'Now' : esc(fmt.hourLabel(hour.time, units))}</p>
      ${dayBreak ? `<p class="h-daylabel">${esc(fmt.dayName(hour.time))}</p>` : ''}
      ${weatherIcon(condition.icon, { size: 30, className: 'h-icon', title: condition.label })}
      <div class="h-curve-space" style="height:${CURVE_HEIGHT}px"></div>
      <div class="h-precip" title="${esc(`${Math.round(pop)}% chance`)}">
        <div class="h-precip-bar" style="height:${barHeight}%"></div>
      </div>
      <p class="h-pop ${pop >= 30 ? 'is-wet' : ''}">${pop ? `${Math.round(pop)}%` : ''}</p>
      <p class="h-wind">
        ${windArrow(hour.windDir, { size: 13 })}
        ${esc(fmt.wind(hour.wind, units, { withUnit: false }))}
      </p>
    </div>
  `;
}

/** Catmull-Rom style smoothing so the curve reads as a temperature trend. */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

/* ------------------------------------------------------------- details */

export function renderDetails(vm) {
  const { current, units, series, nowIndex, days, todayIndex } = vm;
  if (!current) return '';

  const now = series[nowIndex] || {};
  const today = days[todayIndex] || {};
  const trend = pressureTrend(series, nowIndex);

  const tiles = [
    {
      icon: 'thermometer', label: 'Feels like',
      value: fmt.temp(current.apparent_temperature, units),
      note: describeFeels(current.temperature_2m, current.apparent_temperature),
    },
    {
      icon: 'drop', label: 'Dew point',
      value: fmt.temp(now.dewPoint, units),
      note: describeDewPoint(now.dewPoint),
    },
    {
      icon: 'wind', label: 'Wind',
      value: fmt.wind(current.wind_speed_10m, units),
      note: `Gusting ${fmt.wind(current.wind_gusts_10m, units)} from ${fmt.compass(current.wind_direction_10m)}`,
    },
    {
      icon: 'gauge', label: 'Pressure',
      value: fmt.pressure(current.pressure_msl, units),
      note: trend ? `${capitalize(trend.direction)} ${trend.rate}` : '—',
    },
    {
      icon: 'eye', label: 'Visibility',
      value: fmt.distance(now.visibility, units),
      note: describeVisibility(now.visibility),
    },
    {
      icon: 'uv', label: 'UV index',
      value: now.uv === null || now.uv === undefined ? '--' : String(Math.round(now.uv)),
      note: `Peaks at ${today.uvMax === null || today.uvMax === undefined ? '--' : Math.round(today.uvMax)} today`,
    },
    {
      icon: 'cloud', label: 'Cloud cover',
      value: fmt.percent(current.cloud_cover),
      note: today.sunshine ? `${fmt.duration(today.sunshine)} of sunshine today` : '—',
    },
    {
      icon: 'humidity', label: 'Precipitation today',
      value: (today.snowSum || 0) > 0.2
        ? fmt.snow(today.snowSum, units)
        : fmt.precip(today.precipSum, units),
      note: today.precipHours ? `Over about ${Math.round(today.precipHours)}h` : 'None expected',
    },
  ];

  return `
    <header class="panel-head">
      <h2>Conditions in detail</h2>
    </header>
    <ul class="tile-grid">
      ${tiles.map((tile) => `
        <li class="tile">
          <span class="tile-icon">${glyph(tile.icon, { size: 20 })}</span>
          <p class="tile-label">${esc(tile.label)}</p>
          <p class="tile-value">${esc(tile.value)}</p>
          <p class="tile-note">${esc(tile.note)}</p>
        </li>`).join('')}
    </ul>
  `;
}

function describeFeels(actual, apparent) {
  if (actual === null || apparent === null) return '—';
  const delta = apparent - actual;
  if (delta <= -6) return 'Wind chill is doing real work';
  if (delta <= -2) return 'Colder than the thermometer says';
  if (delta >= 5) return 'Humidity is making it worse';
  if (delta >= 2) return 'Warmer than the thermometer says';
  return 'About what it looks like';
}

function describeDewPoint(dew) {
  if (dew === null || dew === undefined) return '—';
  if (dew >= 24) return 'Oppressive';
  if (dew >= 20) return 'Muggy';
  if (dew >= 16) return 'Noticeably humid';
  if (dew >= 10) return 'Comfortable';
  if (dew >= 0) return 'Dry and pleasant';
  return 'Very dry air';
}

function describeVisibility(metres) {
  if (metres === null || metres === undefined) return '—';
  if (metres >= 20000) return 'Crystal clear';
  if (metres >= 10000) return 'Clear';
  if (metres >= 4000) return 'Slight haze';
  if (metres >= 1000) return 'Reduced — mist or precipitation';
  return 'Fog — drive carefully';
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : '';
}

/* --------------------------------------------------------------- daily */

export function renderDaily(vm) {
  const { days, todayIndex, units, selectedDay } = vm;
  const forecast = days.slice(todayIndex, todayIndex + 14);
  if (!forecast.length) return errorPanel('Extended forecast is unavailable.');

  const lows = forecast.map((d) => d.low).filter((v) => v !== null);
  const highs = forecast.map((d) => d.high).filter((v) => v !== null);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;

  return `
    <header class="panel-head">
      <h2>Next 14 days</h2>
      <p class="panel-sub">Pick a day to load its hour-by-hour detail.</p>
    </header>
    <ol class="daily-list">
      ${forecast.map((day, i) => {
        const condition = describe(day.code, 1);
        const left = ((day.low - min) / span) * 100;
        const width = ((day.high - day.low) / span) * 100;
        const isSelected = selectedDay === day.time;

        return `
          <li>
            <button type="button" class="daily-row ${isSelected ? 'is-selected' : ''}"
                    data-action="select-day" data-day="${esc(day.time)}"
                    aria-pressed="${isSelected}">
              <span class="d-name">${i === 0 ? 'Today' : esc(fmt.dayName(day.time))}</span>
              <span class="d-date">${esc(fmt.dayNumber(day.time))}</span>
              ${weatherIcon(condition.icon, { size: 30, className: 'd-icon', title: condition.label })}
              <span class="d-pop ${(day.popMax || 0) >= 30 ? 'is-wet' : ''}">
                ${day.popMax ? `${Math.round(day.popMax)}%` : ''}
              </span>
              <span class="d-low">${esc(fmt.temp(day.low, units))}</span>
              <span class="d-bar" aria-hidden="true">
                <span class="d-bar-fill" style="left:${left}%; width:${Math.max(width, 3)}%"></span>
              </span>
              <span class="d-high">${esc(fmt.temp(day.high, units))}</span>
            </button>
          </li>`;
      }).join('')}
    </ol>
  `;
}

export function errorPanel(message) {
  return `<p class="panel-error">${esc(message)}</p>`;
}
