/**
 * Full data tables for the section pages.
 *
 * The dashboard shows the hourly strip and the daily outlook as compact,
 * scrollable graphics — right for a screen you glance at. The section URLs
 * (`/weather/toronto/hourly`, `/weather/toronto/10-day`) exist because people
 * search for exactly that, and they earn their own URL by carrying something
 * the overview genuinely does not: every reading, in a real table, readable
 * without JavaScript and legible to a crawler.
 *
 * Pure functions from view model to HTML string, like every other view.
 */

import { esc } from '../dom.js';
import { describe } from '../wmo.js';
import { weatherIcon, windArrow } from '../icons.js';
import * as fmt from '../format.js';
import { precipTiming, comfortScore, comfortLabel } from '../insights.js';

/** Group hours into calendar days so the table can carry day headings. */
function groupByDay(hours) {
  const groups = [];
  for (const hour of hours) {
    const day = hour.time.slice(0, 10);
    if (!groups.length || groups[groups.length - 1].day !== day) {
      groups.push({ day, hours: [] });
    }
    groups[groups.length - 1].hours.push(hour);
  }
  return groups;
}

function precipCell(hour, units) {
  const frozen = (hour.snowfall || 0) > 0;
  const amount = frozen ? fmt.snow(hour.snowfall, units) : fmt.precip(hour.precip, units);
  if (!hour.precip && !hour.snowfall) return '<span class="muted">—</span>';
  return esc(amount);
}

/**
 * Hour-by-hour for the next two days: temperature, feels-like, chance and
 * amount of precipitation, wind with gusts, humidity, cloud and UV.
 */
export function renderHourlyTable(vm, { hours = 48 } = {}) {
  const { units } = vm;
  const window = vm.next48.slice(0, hours);
  if (!window.length) return '';

  const rows = groupByDay(window).map((group) => `
    <tbody>
      <tr class="table-daybreak">
        <th colspan="8" scope="colgroup">${esc(fmt.dayName(group.day, { long: true }))} ${esc(fmt.dayNumber(group.day))}</th>
      </tr>
      ${group.hours.map((hour) => {
        const condition = describe(hour.code, hour.isDay);
        return `
        <tr>
          <th scope="row">${esc(fmt.hourLabel(hour.time, units))}</th>
          <td class="cell-condition">
            ${weatherIcon(condition.icon, { size: 22, title: condition.label })}
            <span>${esc(condition.label)}</span>
          </td>
          <td>${esc(fmt.temp(hour.temp, units))}</td>
          <td>${esc(fmt.temp(hour.feels, units))}</td>
          <td>${esc(fmt.percent(hour.pop))}</td>
          <td>${precipCell(hour, units)}</td>
          <td class="cell-wind">
            ${windArrow(hour.windDir)}
            ${esc(fmt.wind(hour.wind, units))}${hour.gust && hour.gust > hour.wind + 10 ? esc(` (gusts ${fmt.wind(hour.gust, units)})`) : ''}
          </td>
          <td>${esc(fmt.percent(hour.humidity))}</td>
        </tr>`;
      }).join('')}
    </tbody>`).join('');

  return `
    <section class="panel panel-table">
      <header class="panel-head">
        <h2>Hour-by-hour forecast for ${esc(vm.place.name)}</h2>
        <p class="panel-sub">Every hour for the next ${window.length} hours, local time.</p>
      </header>
      <div class="table-scroll">
        <table class="data-table">
          <caption class="visually-hidden">Hourly weather forecast for ${esc(vm.place.name)}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Conditions</th>
              <th scope="col">Temp</th>
              <th scope="col">Feels</th>
              <th scope="col">Chance</th>
              <th scope="col">Amount</th>
              <th scope="col">Wind</th>
              <th scope="col">Humidity</th>
            </tr>
          </thead>
          ${rows}
        </table>
      </div>
    </section>`;
}

/** The extended outlook as a table: one row per day, every daily field. */
export function renderDailyTable(vm) {
  const { units, days, todayIndex } = vm;
  const window = days.slice(todayIndex, todayIndex + 14);
  if (!window.length) return '';

  const rows = window.map((day, offset) => {
    const condition = describe(day.code, 1);
    const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : fmt.dayName(day.time, { long: true });

    return `
      <tr>
        <th scope="row">
          <span class="cell-day">${esc(label)}</span>
          <span class="cell-date">${esc(fmt.dayNumber(day.time))}</span>
        </th>
        <td class="cell-condition">
          ${weatherIcon(condition.icon, { size: 26, title: condition.label })}
          <span>${esc(condition.label)}</span>
        </td>
        <td>${esc(fmt.temp(day.high, units))}</td>
        <td>${esc(fmt.temp(day.low, units))}</td>
        <td>${esc(fmt.percent(day.popMax))}</td>
        <td>${day.precipSum ? esc(fmt.precip(day.precipSum, units)) : '<span class="muted">—</span>'}</td>
        <td>${day.snowSum ? esc(fmt.snow(day.snowSum, units)) : '<span class="muted">—</span>'}</td>
        <td class="cell-wind">
          ${windArrow(day.windDir)}
          ${esc(fmt.wind(day.windMax, units))}
        </td>
        <td>${day.uvMax === null ? '<span class="muted">—</span>' : esc(String(Math.round(day.uvMax)))}</td>
        <td>${esc(fmt.timeLabel(day.sunrise, units))}</td>
        <td>${esc(fmt.timeLabel(day.sunset, units))}</td>
      </tr>`;
  }).join('');

  return `
    <section class="panel panel-table">
      <header class="panel-head">
        <h2>${esc(String(window.length))}-day forecast for ${esc(vm.place.name)}</h2>
        <p class="panel-sub">Daily highs and lows, precipitation, wind, UV and daylight.</p>
      </header>
      <div class="table-scroll">
        <table class="data-table">
          <caption class="visually-hidden">Extended daily forecast for ${esc(vm.place.name)}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Conditions</th>
              <th scope="col">High</th>
              <th scope="col">Low</th>
              <th scope="col">Chance</th>
              <th scope="col">Rain</th>
              <th scope="col">Snow</th>
              <th scope="col">Wind</th>
              <th scope="col">UV</th>
              <th scope="col">Sunrise</th>
              <th scope="col">Sunset</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

/**
 * What the radar page says when the map has not loaded (or cannot): where the
 * precipitation actually is in time, which is the question the radar is being
 * opened to answer.
 */
export function renderRadarSummary(vm) {
  const { units, series, nowIndex } = vm;
  const timing = precipTiming(series, nowIndex, 24);
  const next = vm.next48.slice(0, 12);

  let verdict;
  if (!timing) verdict = 'No precipitation data is available for this location right now.';
  else if (timing.state === 'active') {
    verdict = timing.openEnded
      ? 'Precipitation is falling now and continues through the next day.'
      : `Precipitation is falling now and should ease around ${fmt.hourLabel(timing.endsAt, units)}.`;
  } else if (timing.state === 'incoming') {
    verdict = `Dry now. ${timing.type === 'snow' ? 'Snow' : 'Rain'} is most likely to arrive around ${fmt.hourLabel(timing.startsAt, units)}` +
      (timing.endsAt ? `, easing by ${fmt.hourLabel(timing.endsAt, units)}.` : ' and lingering into the evening.');
  } else {
    verdict = 'Nothing on the way: the next 24 hours look dry.';
  }

  const strip = next.map((hour) => `
    <li class="nowcast-hour ${(hour.pop || 0) >= 50 ? 'is-wet' : ''}">
      <span class="nowcast-time">${esc(fmt.hourLabel(hour.time, units))}</span>
      <span class="nowcast-pop">${esc(fmt.percent(hour.pop))}</span>
      <span class="nowcast-amount">${hour.precip ? esc(fmt.precip(hour.precip, units)) : ''}</span>
    </li>`).join('');

  return `
    <section class="panel">
      <header class="panel-head">
        <h2>Rain and snow timing for ${esc(vm.place.name)}</h2>
        <p class="panel-sub">The radar shows where precipitation is. This shows when it reaches you.</p>
      </header>
      <p class="radar-verdict">${esc(verdict)}</p>
      <ul class="nowcast-strip">${strip}</ul>
    </section>`;
}

/**
 * The plain-English answer block. Real questions, answered from the actual
 * forecast rather than boilerplate — the thing a weather page is for.
 */
export function renderQuestions(vm) {
  const questions = forecastQuestions(vm);
  if (!questions.length) return '';

  return `
    <section class="panel panel-questions">
      <header class="panel-head">
        <h2>${esc(vm.place.name)} weather questions, answered</h2>
      </header>
      <dl class="qa">
        ${questions.map((qa) => `
          <div class="qa-item">
            <dt>${esc(qa.question)}</dt>
            <dd>${esc(qa.answer)}</dd>
          </div>`).join('')}
      </dl>
    </section>`;
}

/**
 * The question/answer pairs behind the block above, as data.
 *
 * Exported separately because the server also emits them as FAQ structured
 * data, and the two must never drift apart — the answer a crawler is given has
 * to be the answer on the page.
 */
export function forecastQuestions(vm) {
  const { units, days, todayIndex, current, series, nowIndex } = vm;
  const today = days[todayIndex];
  const tomorrow = days[todayIndex + 1];
  const place = vm.place.name;
  const out = [];
  if (!current || !today) return out;

  const timing = precipTiming(series, nowIndex, 24);
  if (timing && timing.state === 'active') {
    out.push({
      question: `Is it raining in ${place} right now?`,
      answer: timing.openEnded
        ? `Yes — precipitation is falling in ${place} and the models keep it going through the next day.`
        : `Yes — precipitation is falling in ${place} and should ease around ${fmt.hourLabel(timing.endsAt, units)}.`,
    });
  } else if (timing && timing.state === 'incoming') {
    out.push({
      question: `Will it rain in ${place} today?`,
      answer: `It is dry now. ${timing.type === 'snow' ? 'Snow' : 'Rain'} is most likely around ` +
        `${fmt.hourLabel(timing.startsAt, units)}` +
        (timing.endsAt ? `, easing by ${fmt.hourLabel(timing.endsAt, units)}.` : ', lingering into the evening.') +
        ` The day peaks at a ${fmt.percent(today.popMax)} chance.`,
    });
  } else {
    out.push({
      question: `Will it rain in ${place} today?`,
      answer: `No — the next 24 hours in ${place} look dry, with the chance of precipitation peaking at ${fmt.percent(today.popMax)}.`,
    });
  }

  out.push({
    question: `How warm does it get in ${place} today?`,
    answer: `${place} reaches a high of ${fmt.temp(today.high, units, { withUnit: true })} and drops to ` +
      `${fmt.temp(today.low, units, { withUnit: true })} overnight. Right now it is ` +
      `${fmt.temp(current.temperature_2m, units, { withUnit: true })} and feels like ` +
      `${fmt.temp(current.apparent_temperature, units, { withUnit: true })}.`,
  });

  const best = bestWindow(vm);
  if (best) {
    out.push({
      question: `What is the best time to be outside in ${place} today?`,
      answer: `${fmt.hourLabel(best.time, units)} looks like the pick — ` +
        `${fmt.temp(best.temp, units, { withUnit: true })}, ${describe(best.code, best.isDay).label.toLowerCase()}, ` +
        `wind ${fmt.wind(best.wind, units)}. Outdoor comfort scores ${comfortScore(best)} out of 100 ` +
        `(${comfortLabel(comfortScore(best)).toLowerCase()}).`,
    });
  }

  if (tomorrow) {
    const delta = tomorrow.high - today.high;
    const direction = Math.abs(delta) < 1.5 ? 'about the same as today'
      : delta > 0 ? `${fmt.tempDelta(delta, units)} warmer than today`
      : `${fmt.tempDelta(Math.abs(delta), units)} cooler than today`;
    out.push({
      question: `What is the weather in ${place} tomorrow?`,
      answer: `${describe(tomorrow.code, 1).label}, with a high of ${fmt.temp(tomorrow.high, units, { withUnit: true })} ` +
        `and a low of ${fmt.temp(tomorrow.low, units, { withUnit: true })} — ${direction}. ` +
        `Chance of precipitation peaks at ${fmt.percent(tomorrow.popMax)}.`,
    });
  }

  if (today.sunrise && today.sunset) {
    out.push({
      question: `What time is sunrise and sunset in ${place}?`,
      answer: `The sun rises at ${fmt.timeLabel(today.sunrise, units)} and sets at ` +
        `${fmt.timeLabel(today.sunset, units)}, giving ${fmt.duration(today.daylight)} of daylight.`,
    });
  }

  return out;
}

/** The most pleasant daylight hour left today, by the comfort score. */
function bestWindow(vm) {
  const todayDate = vm.days[vm.todayIndex] && vm.days[vm.todayIndex].time;
  const candidates = vm.next48
    .filter((hour) => hour.time.startsWith(todayDate) && hour.isDay)
    .filter((hour) => comfortScore(hour) !== null);
  if (!candidates.length) return null;
  return candidates.reduce((best, hour) => (comfortScore(hour) > comfortScore(best) ? hour : best));
}
