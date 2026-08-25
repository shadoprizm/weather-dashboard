'use strict';

/**
 * The embeddable widget.
 *
 * A hotel, a marina, a ski hill or a community association wants today's
 * weather on their page and does not want to build it. Giving that away costs
 * one small server-rendered document and earns a link and a credit on every
 * site that takes it — which is the cheapest distribution there is.
 *
 * Rendered entirely on the server and refreshed by a meta refresh. A plain
 * `<iframe>` embed runs no JavaScript at all; the `embed.js` convenience
 * loader adds one small script *inside the frame* purely to report its height.
 * Nothing is stored, and no third party sees the host site's visitors. That is
 * what makes it something a cautious webmaster will actually paste in.
 */

const site = require('../site');
const seo = require('../seo');
const cities = require('../cities');
const handlers = require('../handlers');
const { load } = require('./views');
const { escapeHtml } = require('./shell');

const METRIC = { temp: 'c', wind: 'kmh', precip: 'mm', pressure: 'hpa', distance: 'km', clock: '12' };
const IMPERIAL = { temp: 'f', wind: 'mph', precip: 'in', pressure: 'inhg', distance: 'mi', clock: '12' };

const REFRESH_SECONDS = 900;

/** Parse and clamp everything a host site can put in the URL. */
function widgetOptions(query = {}) {
  const theme = ['light', 'dark', 'auto'].includes(query.theme) ? query.theme : 'auto';
  const days = Math.max(0, Math.min(7, Number.parseInt(query.days, 10) || 3));
  const embed = query.embed === '1' || query.embed === 1 || query.embed === true;
  const accent = /^#?[0-9a-f]{6}$/i.test(String(query.accent || ''))
    ? `#${String(query.accent).replace('#', '')}`
    : null;

  let place = null;
  if (query.city) {
    const city = cities.bySlug(query.city);
    if (city) {
      place = {
        name: city.name,
        region: city.region || city.country,
        latitude: city.latitude,
        longitude: city.longitude,
        href: seo.cityPath(city),
        units: city.countryCode === 'US' ? IMPERIAL : METRIC,
      };
    }
  }

  if (!place) {
    const lat = Number.parseFloat(query.lat);
    const lon = Number.parseFloat(query.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const near = cities.nearest(lat, lon, { withinKm: 25 });
      place = {
        name: String(query.name || (near && near.city.name) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`).slice(0, 40),
        region: near ? near.city.region : null,
        latitude: lat,
        longitude: lon,
        href: near ? seo.cityPath(near.city) : `/?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
        units: METRIC,
      };
    }
  }

  const units = query.units === 'imperial' ? IMPERIAL
    : query.units === 'metric' ? METRIC
    : place && place.units;

  return { place, theme, days, accent, embed, units: units || METRIC };
}

function styles(theme, accent) {
  const brand = accent || '#3b82f6';
  return `
    :root {
      color-scheme: ${theme === 'auto' ? 'light dark' : theme};
      --bg: #ffffff; --panel: #f1f5f9; --text: #0f172a; --muted: #64748b;
      --line: #e2e8f0; --brand: ${brand};
    }
    ${theme === 'dark' ? ':root {' : theme === 'auto' ? '@media (prefers-color-scheme: dark) { :root {' : '.never {'}
      --bg: #0b1220; --panel: #162034; --text: #e8eefc; --muted: #93a4c4; --line: #24304a;
    ${theme === 'dark' ? '}' : theme === 'auto' ? '} }' : '}'}

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--bg); }
    body {
      font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    .wv { display: block; padding: 14px 16px 10px; text-decoration: none; color: inherit; }
    .wv-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .wv-place { font-weight: 650; font-size: 15px; letter-spacing: .01em; }
    .wv-region { color: var(--muted); font-size: 12px; }
    .wv-now { display: flex; align-items: baseline; gap: 10px; margin-top: 6px; }
    .wv-temp { font-size: 40px; font-weight: 300; letter-spacing: -.02em; line-height: 1; }
    .wv-cond { color: var(--muted); font-size: 13px; }
    .wv-range { font-size: 13px; color: var(--muted); margin-top: 2px; }
    .wv-days { display: flex; gap: 6px; margin-top: 12px; }
    .wv-day {
      flex: 1; background: var(--panel); border-radius: 10px; padding: 8px 4px;
      text-align: center; min-width: 0;
    }
    .wv-day-name { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
    .wv-day-temp { font-size: 13px; margin-top: 4px; white-space: nowrap; }
    .wv-day-low { color: var(--muted); }
    .wv-icon { width: 20px; height: 20px; margin: 3px auto 0; display: block; }
    .wv-icon circle, .wv-icon line, .wv-icon rect, .wv-icon path {
      fill: none; stroke: var(--brand); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
    }
    .wv-icon .wi-cloud circle, .wv-icon .wi-cloud rect { fill: var(--brand); stroke: none; opacity: .9; }
    .wv-hero-icon { width: 40px; height: 40px; }
    .wv-foot {
      display: flex; justify-content: space-between; align-items: center;
      border-top: 1px solid var(--line); margin-top: 12px; padding: 8px 16px 10px;
      font-size: 11px; color: var(--muted);
    }
    .wv-foot a { color: var(--muted); text-decoration: none; font-weight: 600; }
    .wv-foot a:hover { color: var(--brand); text-decoration: underline; }
    .wv-alert {
      margin: 0 16px; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;
      background: color-mix(in srgb, #f97316 18%, transparent); color: #b45309;
    }
    @media (prefers-color-scheme: dark) { .wv-alert { color: #fdba74; } }
  `.replace(/\s+/g, ' ').trim();
}

async function renderWidget(query = {}) {
  const options = widgetOptions(query);

  if (!options.place) {
    return {
      status: 400,
      contentType: 'text/html; charset=utf-8',
      maxAge: 0,
      body: shell({
        theme: 'auto',
        accent: null,
        body: `<div class="wv"><p class="wv-cond">Add <code>?city=toronto</code> — or <code>?lat=&amp;lon=</code> — to this widget's URL. See <a href="${escapeHtml(site.url('/widgets'))}">${escapeHtml(site.displayHost)}/widgets</a>.</p></div>`,
        refresh: false,
      }),
    };
  }

  const mods = await load();
  const { viewmodel, wmo, format: fmt, icons } = mods;

  const { body: data } = await handlers.forecast({
    lat: String(options.place.latitude),
    lon: String(options.place.longitude),
  });

  const vm = viewmodel.buildViewModel({
    data,
    place: { name: options.place.name, admin1: options.place.region },
    units: options.units,
  });

  const current = vm.current;
  const today = vm.days[vm.todayIndex];
  const condition = current ? wmo.describe(current.weather_code, current.is_day) : null;
  const link = site.url(options.place.href);

  const days = options.days
    ? vm.days.slice(vm.todayIndex, vm.todayIndex + options.days).map((day, i) => `
        <div class="wv-day">
          <div class="wv-day-name">${escapeHtml(i === 0 ? 'Today' : fmt.dayName(day.time))}</div>
          ${icons.weatherIcon(wmo.describe(day.code, 1).icon, { size: 20, className: 'wv-icon' })}
          <div class="wv-day-temp">
            ${escapeHtml(fmt.temp(day.high, vm.units))}
            <span class="wv-day-low">${escapeHtml(fmt.temp(day.low, vm.units))}</span>
          </div>
        </div>`).join('')
    : '';

  const alert = vm.alerts && vm.alerts.alerts && vm.alerts.alerts.length
    ? `<p class="wv-alert">⚠ ${escapeHtml(vm.alerts.alerts[0].event)}</p>`
    : '';
  const sourceCredit = data.weatherProvider === 'visual-crossing'
    ? '<a href="https://www.visualcrossing.com/" target="_blank" rel="noopener">Weather Data Provided by Visual Crossing</a>'
    : '<a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo</a>';

  const body = `
    <a class="wv" href="${escapeHtml(link)}" target="_blank" rel="noopener">
      <div class="wv-top">
        <div>
          <div class="wv-place">${escapeHtml(options.place.name)}</div>
          ${options.place.region ? `<div class="wv-region">${escapeHtml(options.place.region)}</div>` : ''}
        </div>
        ${condition ? icons.weatherIcon(condition.icon, { size: 40, className: 'wv-icon wv-hero-icon', title: condition.label }) : ''}
      </div>
      <div class="wv-now">
        <span class="wv-temp">${escapeHtml(current ? fmt.temp(current.temperature_2m, vm.units) : '--')}</span>
        <span class="wv-cond">${escapeHtml(condition ? condition.label : 'Unavailable')}</span>
      </div>
      ${today ? `<div class="wv-range">
        ${escapeHtml(fmt.temp(today.high, vm.units))} / ${escapeHtml(fmt.temp(today.low, vm.units))}
        · ${escapeHtml(fmt.percent(today.popMax))} chance of precipitation
      </div>` : ''}
      ${days ? `<div class="wv-days">${days}</div>` : ''}
    </a>
    ${alert}
    <div class="wv-foot">
      <span>Updated ${escapeHtml(fmt.localClock(vm.utcOffsetSeconds, vm.units))} local</span>
      <span>${sourceCredit} · <a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(site.name)}</a></span>
    </div>`;

  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    maxAge: 300,
    body: shell({
      theme: options.theme,
      accent: options.accent,
      body,
      title: `${options.place.name} weather`,
      embed: options.embed,
    }),
  };
}

function shell({ theme, accent, body, title = 'Weather', refresh = true, embed = false }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${refresh ? `<meta http-equiv="refresh" content="${REFRESH_SECONDS}">` : ''}
<title>${escapeHtml(title)}</title>
<style>${styles(theme, accent)}</style>
</head>
<body>${body}${embed ? '<script src="/js/widget-frame.js"></' + 'script>' : ''}</body>
</html>`;
}

module.exports = { renderWidget, widgetOptions, REFRESH_SECONDS };
