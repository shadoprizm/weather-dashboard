/**
 * Secondary panels: alerts, the activity planner, sun/moon, air quality,
 * the almanac and the multi-location comparison.
 */

import { esc } from '../dom.js';
import { describe } from '../wmo.js';
import { weatherIcon, moonPhaseIcon, glyph } from '../icons.js';
import * as fmt from '../format.js';
import {
  activityWindows, solarWindows, moonPhase, stargazingOutlook, daylightChange,
  computeWatches, aqiBand, rankLocations, almanacComparison, auroraOutlook,
} from '../insights.js';

/* -------------------------------------------------------------- alerts */

export function renderAlerts(vm) {
  const official = (vm.alerts && vm.alerts.alerts) || [];
  const watches = computeWatches({
    series: vm.series,
    nowIndex: vm.nowIndex,
    days: vm.days,
    todayIndex: vm.todayIndex,
    air: vm.air,
  });

  if (!official.length && !watches.length) return '';

  return `
    ${official.map((alert) => `
      <article class="alert alert-official is-${esc((alert.severity || 'unknown').toLowerCase())}">
        <header class="alert-head">
          <span class="alert-badge">Official · ${esc(alert.source)}</span>
          <h2 class="alert-title">${esc(alert.event)}</h2>
          ${alert.expires ? `<span class="alert-time">until ${esc(fmt.timeLabel(alert.expires, vm.units))}</span>` : ''}
        </header>
        ${alert.headline ? `<p class="alert-headline">${esc(alert.headline)}</p>` : ''}
        <details class="alert-details">
          <summary>Full text</summary>
          <p>${esc(alert.description || '')}</p>
          ${alert.instruction ? `<p class="alert-instruction">${esc(alert.instruction)}</p>` : ''}
          ${alert.area ? `<p class="alert-area">${esc(alert.area)}</p>` : ''}
        </details>
      </article>`).join('')}

    ${watches.map((watch) => `
      <article class="alert alert-computed is-${esc(watch.level)}">
        <header class="alert-head">
          <span class="alert-badge">Computed</span>
          <h2 class="alert-title">${esc(watch.title)}</h2>
          ${watch.when ? `<span class="alert-time">${esc(fmt.dayName(watch.when))}</span>` : ''}
        </header>
        <p class="alert-headline">${esc(watch.detail)}</p>
      </article>`).join('')}
  `;
}

/* ---------------------------------------------------------- activities */

export function renderActivities(vm) {
  const today = vm.days[vm.todayIndex];
  const solar = solarWindows(today);
  const ranked = activityWindows(vm.series, vm.nowIndex, { goldenHours: solar.goldenHours });

  if (!ranked.length) return '';

  return `
    <header class="panel-head">
      <h2>Best time to…</h2>
      <p class="panel-sub">Scored hour by hour across the next two days.</p>
    </header>
    <ul class="activity-grid">
      ${ranked.map((activity) => {
        const window = activity.window;
        const band = activity.bestScore >= 75 ? 'good'
          : activity.bestScore >= 55 ? 'fair'
            : activity.bestScore >= 35 ? 'poor' : 'bad';

        const when = window
          ? `${fmt.dayName(window.start.time)} ${fmt.hourLabel(window.start.time, vm.units)}–${fmt.hourLabel(window.end.time, vm.units)}`
          : 'No good window in the next 48h';

        return `
          <li class="activity" data-band="${band}">
            <div class="activity-top">
              <span class="activity-icon">${glyph(activity.icon, { size: 18 })}</span>
              <h3 class="activity-label">${esc(activity.label)}</h3>
              <span class="activity-score">${activity.bestScore}</span>
            </div>
            <p class="activity-when">${esc(when)}</p>
            <p class="activity-blurb">${esc(activity.blurb)}</p>
            <div class="activity-meter" aria-hidden="true">
              <span style="width:${activity.bestScore}%"></span>
            </div>
          </li>`;
      }).join('')}
    </ul>
  `;
}

/* ---------------------------------------------------------- sun & moon */

export function renderAstro(vm) {
  const today = vm.days[vm.todayIndex];
  if (!today) return '';

  const solar = solarWindows(today);
  const moon = moonPhase(new Date());
  const stars = stargazingOutlook(vm.series, vm.nowIndex, moon);
  const daylight = daylightChange(vm.days, vm.todayIndex);
  const aurora = vm.space && vm.space.available
    ? auroraOutlook(vm.space.kp, vm.place.latitude)
    : null;

  const goldenEvening = solar.golden
    ? `${fmt.timeLabel(toIso(solar.golden.evening[0]), vm.units)}–${fmt.timeLabel(toIso(solar.golden.evening[1]), vm.units)}`
    : '--';

  return `
    <header class="panel-head">
      <h2>Sun &amp; moon</h2>
    </header>

    <div class="astro-sun">
      <div class="astro-item">
        ${glyph('sunrise', { size: 20 })}
        <div>
          <p class="astro-label">Sunrise</p>
          <p class="astro-value">${esc(fmt.timeLabel(today.sunrise, vm.units))}</p>
        </div>
      </div>
      <div class="astro-arc" aria-hidden="true">
        <div class="astro-arc-line"></div>
        <div class="astro-arc-dot" style="--progress:${sunProgress(today, vm.current)}"></div>
      </div>
      <div class="astro-item astro-item-end">
        ${glyph('sunset', { size: 20 })}
        <div>
          <p class="astro-label">Sunset</p>
          <p class="astro-value">${esc(fmt.timeLabel(today.sunset, vm.units))}</p>
        </div>
      </div>
    </div>

    <ul class="astro-facts">
      <li><span>Day length</span><strong>${esc(fmt.duration(today.daylight))}</strong></li>
      ${daylight ? `<li><span>vs yesterday</span><strong class="${daylight.delta >= 0 ? 'is-warm' : 'is-cool'}">${esc(fmt.signedDuration(daylight.delta))}</strong></li>` : ''}
      <li><span>Golden hour</span><strong>${esc(goldenEvening)}</strong></li>
    </ul>

    <div class="astro-moon">
      ${moonPhaseIcon(moon.phase, { size: 62 })}
      <div>
        <p class="astro-label">${esc(moon.name)}</p>
        <p class="astro-value">${Math.round(moon.illumination * 100)}% illuminated</p>
        <p class="astro-note">Full moon in ${Math.round(moon.daysToFull)} days</p>
      </div>
    </div>

    ${stars ? `
      <div class="astro-stars" data-verdict="${esc(stars.verdict.toLowerCase())}">
        <p class="astro-label">Stargazing tonight</p>
        <p class="astro-value">${esc(stars.verdict)} · ${stars.score}/100</p>
        <p class="astro-note">Clearest around ${esc(fmt.hourLabel(stars.clearestHour.time, vm.units))}
          at ${esc(fmt.percent(stars.clearestHour.cloud))} cloud.</p>
      </div>` : ''}

    ${aurora ? `
      <div class="astro-aurora ${aurora.likely ? 'is-active' : ''}">
        <p class="astro-label">Aurora watch · Kp ${aurora.kp.toFixed(1)} (${esc(aurora.level)})</p>
        <p class="astro-note">
          ${aurora.likely
            ? 'Your latitude is inside the likely auroral oval tonight. Look north away from city lights.'
            : aurora.marginal
              ? 'Borderline — a photo exposure to the north may pick it up.'
              : `Visible above roughly ${Math.round(aurora.visibleAbove)}° latitude right now.`}
        </p>
      </div>` : ''}
  `;
}

function toIso(date) {
  if (!date) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sunProgress(day, current) {
  const sunrise = fmt.parseLocal(day.sunrise);
  const sunset = fmt.parseLocal(day.sunset);
  const now = fmt.parseLocal(current && current.time);
  if (!sunrise || !sunset || !now) return 0;
  const ratio = (now - sunrise) / (sunset - sunrise);
  return Math.min(1, Math.max(0, ratio));
}

/* --------------------------------------------------------- air quality */

const POLLUTANTS = [
  { key: 'pm2_5', label: 'PM2.5', unit: 'µg/m³' },
  { key: 'pm10', label: 'PM10', unit: 'µg/m³' },
  { key: 'ozone', label: 'Ozone', unit: 'µg/m³' },
  { key: 'nitrogen_dioxide', label: 'NO₂', unit: 'µg/m³' },
];

const POLLENS = [
  { key: 'birch_pollen', label: 'Birch' },
  { key: 'grass_pollen', label: 'Grass' },
  { key: 'ragweed_pollen', label: 'Ragweed' },
  { key: 'alder_pollen', label: 'Alder' },
  { key: 'mugwort_pollen', label: 'Mugwort' },
  { key: 'olive_pollen', label: 'Olive' },
];

export function renderAir(vm) {
  const air = vm.air && vm.air.current;
  if (!air) {
    return `<header class="panel-head"><h2>Air quality</h2></header>
      <p class="panel-empty">No air quality data for this location.</p>`;
  }

  const index = air.us_aqi ?? air.european_aqi;
  const band = aqiBand(index);
  const scale = air.us_aqi !== null && air.us_aqi !== undefined ? 'US AQI' : 'European AQI';

  const pollens = POLLENS
    .map((p) => ({ ...p, value: air[p.key] }))
    .filter((p) => p.value !== null && p.value !== undefined && p.value > 0);

  return `
    <header class="panel-head">
      <h2>Air quality</h2>
      <p class="panel-sub">${esc(scale)}</p>
    </header>

    <div class="aqi" data-tone="${band ? esc(band.tone) : 'unknown'}">
      <p class="aqi-value">${index === null || index === undefined ? '--' : Math.round(index)}</p>
      <p class="aqi-label">${esc(band ? band.label : 'Unknown')}</p>
      <div class="aqi-scale" aria-hidden="true">
        <div class="aqi-scale-marker" style="left:${Math.min(100, (index || 0) / 3)}%"></div>
      </div>
    </div>

    <ul class="aqi-pollutants">
      ${POLLUTANTS.map((p) => `
        <li>
          <span>${esc(p.label)}</span>
          <strong>${air[p.key] === null || air[p.key] === undefined ? '--' : Math.round(air[p.key])}
            <small>${esc(p.unit)}</small></strong>
        </li>`).join('')}
    </ul>

    ${pollens.length ? `
      <div class="pollen">
        <p class="astro-label">Pollen (grains/m³)</p>
        <ul class="pollen-list">
          ${pollens.map((p) => `<li><span>${esc(p.label)}</span><strong>${Math.round(p.value)}</strong></li>`).join('')}
        </ul>
      </div>` : ''}
  `;
}

/* ------------------------------------------------------------- almanac */

export function renderAlmanac(vm) {
  const almanac = vm.almanac;
  const today = vm.days[vm.todayIndex];

  if (!almanac || !almanac.available) {
    return `<header class="panel-head"><h2>Almanac</h2></header>
      <p class="panel-empty">Historical records for this location are still loading, or unavailable.</p>`;
  }

  const comparison = almanacComparison(almanac, today);

  return `
    <header class="panel-head">
      <h2>Almanac</h2>
      <p class="panel-sub">${almanac.years} years of records for ${esc(fmt.dayNumber(almanac.date))} (±${almanac.windowDays} days)</p>
    </header>

    ${comparison ? `
      <p class="almanac-verdict ${comparison.highDelta >= 0 ? 'is-warm' : 'is-cool'}">
        Today is <strong>${esc(comparison.verdict)}</strong>
        (${esc(fmt.tempDelta(comparison.highDelta, vm.units))} on the high,
        ${esc(fmt.tempDelta(comparison.lowDelta, vm.units))} on the low).
      </p>` : ''}

    <ul class="almanac-grid">
      <li><span>Normal high</span><strong>${esc(fmt.temp(almanac.normalHigh, vm.units))}</strong></li>
      <li><span>Normal low</span><strong>${esc(fmt.temp(almanac.normalLow, vm.units))}</strong></li>
      <li>
        <span>Record high</span>
        <strong>${esc(fmt.temp(almanac.recordHigh.value, vm.units))}
          <small>${esc(almanac.recordHigh.date.slice(0, 4))}</small></strong>
      </li>
      <li>
        <span>Record low</span>
        <strong>${esc(fmt.temp(almanac.recordLow.value, vm.units))}
          <small>${esc(almanac.recordLow.date.slice(0, 4))}</small></strong>
      </li>
      <li><span>Typical rainfall</span><strong>${esc(fmt.precip(almanac.normalPrecip, vm.units))}</strong></li>
      <li><span>Odds of a wet day</span><strong>${esc(fmt.percent((almanac.wetDayOdds || 0) * 100))}</strong></li>
    </ul>

    ${comparison && comparison.nearRecordHigh ? '<p class="almanac-flag">Today is within striking distance of the record high.</p>' : ''}
    ${comparison && comparison.nearRecordLow ? '<p class="almanac-flag">Today is within striking distance of the record low.</p>' : ''}
  `;
}

/* ------------------------------------------------------------- compare */

export function renderCompare(vm) {
  const ranked = rankLocations(vm.comparisons || []);

  if (ranked.length < 2) {
    return `<header class="panel-head"><h2>Your locations</h2></header>
      <p class="panel-empty">Save a second location to compare them side by side.</p>`;
  }

  const best = ranked[0];

  return `
    <header class="panel-head">
      <h2>Your locations, ranked</h2>
      <p class="panel-sub">Nicest place to be outside right now: <strong>${esc(best.place.name)}</strong></p>
    </header>
    <ol class="compare-list">
      ${ranked.map((entry, i) => `
        <li>
          <button type="button" class="compare-row" data-action="select-place" data-id="${esc(entry.place.id)}">
            <span class="c-rank">${i + 1}</span>
            ${weatherIcon(entry.condition.icon, { size: 26, className: 'c-icon', title: entry.condition.label })}
            <span class="c-name">${esc(entry.place.name)}</span>
            <span class="c-temp">${esc(fmt.temp(entry.current.temperature_2m, vm.units))}</span>
            <span class="c-meter" aria-hidden="true"><span style="width:${entry.score}%"></span></span>
            <span class="c-score">${entry.score}</span>
          </button>
        </li>`).join('')}
    </ol>
  `;
}
