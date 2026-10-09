import { esc } from '../dom.js';
import * as fmt from '../format.js';
import { ACTIVITIES } from '../insights.js';
import { planActivity, PLAN_DURATIONS } from '../planning.js';

export function planReasons(window, activity, units) {
  const feels = window.minFeels === window.maxFeels ? fmt.temp(window.minFeels, units, { withUnit: true })
    : `${fmt.temp(window.minFeels, units)}–${fmt.temp(window.maxFeels, units, { withUnit: true })}`;
  const reasons = [`Feels like ${feels}`, `Highest hourly rain chance ${fmt.percent(window.maxRainChance)}`, `Wind up to ${fmt.wind(window.maxWind, units)}`];
  if (activity.id === 'stargaze') reasons.push(`Cloud cover up to ${fmt.percent(window.maxCloud)}`);
  return reasons;
}

export function renderPlanner(vm) {
  const plan = planActivity(vm, vm.planPreferences);
  const prefs = plan.preferences;
  const warning = vm.alerts?.alerts?.some(a => ['Extreme', 'Severe'].includes(a.severity));
  return `
    <header class="panel-head"><h2>Make an outdoor plan</h2>
      <p class="panel-sub">Choose an activity and how long you need. Find a good fit in the next 48 hours.</p></header>
    <div class="plan-controls">
      <label>Activity<select id="plan-activity" data-plan="activity">${ACTIVITIES.map(a => `<option value="${a.id}"${prefs.activity === a.id ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label>
      <label>Duration<select id="plan-duration" data-plan="duration">${PLAN_DURATIONS.map(d => `<option value="${d}"${prefs.duration === d ? ' selected' : ''}>${d < 60 ? `${d} minutes` : `${d / 60} ${d === 60 ? 'hour' : 'hours'}`}</option>`).join('')}</select></label>
      <label>Time of day<select id="plan-time" data-plan="timeOfDay">${[['daylight','Daylight'],['any','Any time'],['night','Night']].map(([id,label]) => `<option value="${id}"${prefs.timeOfDay === id ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    </div>
    <p class="plan-preferences">Your choices are saved on this device. All times are local to ${esc(vm.place.name)}.</p>
    ${warning ? '<p class="plan-caution">Official warnings are active. Read the bulletin above before making outdoor plans.</p>' : ''}
    <div class="plan-results" aria-live="polite" aria-atomic="true">
      ${plan.windows.length ? `<ol class="plan-windows">${plan.windows.map((w, index) => {
        const when = `${fmt.dayName(w.start)} ${fmt.dayNumber(w.start)}, ${fmt.timeLabel(w.start, vm.units)}–${w.start.slice(0,10) !== w.end.slice(0,10) ? `${fmt.dayName(w.end)} ` : ''}${fmt.timeLabel(w.end, vm.units)}`;
        return `<li class="plan-window" data-band="${w.band}"><p class="plan-fit">${index === 0 ? 'Best fit' : 'Another option'} · ${w.band === 'good' ? 'Good' : 'Fair'} conditions</p>
          <h3>${esc(when)}</h3><ul class="plan-reasons">${planReasons(w, plan.activity, vm.units).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
          <button type="button" class="ghost-button" data-action="plan-calendar" data-start="${esc(w.start)}" data-end="${esc(w.end)}">Add to calendar</button></li>`;
      }).join('')}</ol>` : `<p class="plan-empty">${plan.status === 'unavailable' ? 'Not enough complete hourly data to suggest a time. Try refreshing the forecast.' : `No full ${prefs.duration}-minute window fits these conditions. Try a shorter duration or another time of day.`}</p>`}
    </div>
    <details class="plan-method"><summary>How these suggestions work</summary>
      <p>${esc(plan.activity.blurb)}. We compare feels-like temperature, hourly precipitation chance and wind using the forecast. Every hour of an outing must meet the activity's minimum score; the highest average fit comes first. Suggestions start on the next available whole hour.</p>
      <p>Garden work, laundry and golden-hour photos need daylight; stargazing needs darkness. Photos also need a forecast hour near sunrise or sunset. Weather can change. Check the latest forecast and official warnings before going out.</p>
    </details>`;
}
