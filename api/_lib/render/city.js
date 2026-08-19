'use strict';

/**
 * The city pages: `/weather/{city}` and its sections.
 *
 * These are the pages search engines actually see, so they are rendered on the
 * server with the real forecast already in the HTML — a crawler (or anyone
 * with JavaScript off, or a slow connection) gets the complete answer in the
 * first response. The same markup then hydrates into the live dashboard.
 *
 * The strategy this implements is deliberately *not* "one thin page per
 * keyword". Each city has one substantial page plus three sections that carry
 * something the overview does not, and the whole catalogue is a curated list
 * of places people live rather than every coordinate the geocoder knows.
 */

const site = require('../site');
const seo = require('../seo');
const cities = require('../cities');
const handlers = require('../handlers');
const { renderDocument, escapeHtml } = require('./shell');
const { load } = require('./views');

const UNITS_BY_COUNTRY = {
  US: { temp: 'f', wind: 'mph', precip: 'in', pressure: 'inhg', distance: 'mi', clock: '12' },
};
const METRIC = { temp: 'c', wind: 'kmh', precip: 'mm', pressure: 'hpa', distance: 'km', clock: '12' };

/**
 * Secondary data must never hold the page hostage.
 *
 * The archive behind the almanac can take seconds on a cold cache and the
 * Canadian alert feed walks a directory listing. Both are worth having and
 * neither is worth a slow first byte, so they get a short leash here and the
 * client fills them in afterwards if the server came back empty.
 */
function withTimeout(promise, ms, fallback = null) {
  let timer;
  return Promise.race([
    promise.then((value) => { clearTimeout(timer); return value; }).catch(() => fallback),
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]);
}

async function gather(city) {
  const point = { lat: String(city.latitude), lon: String(city.longitude) };

  const forecast = await handlers.forecast(point);
  const data = forecast.body;
  const localDate = data.current ? data.current.time.slice(0, 10) : undefined;

  const [alerts, almanac] = await Promise.all([
    withTimeout(handlers.alerts(point).then((r) => r.body), 2500, null),
    withTimeout(handlers.almanac({ ...point, date: localDate }).then((r) => r.body), 2500, null),
  ]);

  return { data, alerts, almanac };
}

/** The few numbers the meta description and the share card both want. */
function summarize(vm, mods) {
  const { format: fmt, insights, wmo } = mods;
  const today = vm.days[vm.todayIndex];
  if (!vm.current || !today) return null;

  const timing = insights.precipTiming(vm.series, vm.nowIndex, 24);
  let rain = 'No precipitation expected in the next 24 hours.';
  if (timing && timing.state === 'active') {
    rain = timing.openEnded
      ? 'Precipitation is falling and continues into tomorrow.'
      : `Precipitation is falling and eases around ${fmt.hourLabel(timing.endsAt, vm.units)}.`;
  } else if (timing && timing.state === 'incoming') {
    rain = `${timing.type === 'snow' ? 'Snow' : 'Rain'} arrives around ${fmt.hourLabel(timing.startsAt, vm.units)}.`;
  }

  return {
    temperature: fmt.temp(vm.current.temperature_2m, vm.units, { withUnit: true }),
    condition: wmo.describe(vm.current.weather_code, vm.current.is_day).label,
    high: fmt.temp(today.high, vm.units, { withUnit: true }),
    low: fmt.temp(today.low, vm.units, { withUnit: true }),
    range: `reaches ${fmt.temp(today.high, vm.units, { withUnit: true })} and drops to ${fmt.temp(today.low, vm.units, { withUnit: true })}`,
    rain,
    pop: today.popMax,
  };
}

/* ------------------------------------------------------------- page parts */

/** Links to the other sections of the same city — and to the app. */
function sectionNav(city, active) {
  const items = seo.SECTION_ORDER.map((section) => {
    const href = seo.cityPath(city, section);
    const label = section === 'overview' ? 'Overview'
      : section === 'hourly' ? 'Hourly'
      : section === '10-day' ? '10-day'
      : 'Radar';
    return section === active
      ? `<li><span class="section-link is-active" aria-current="page">${escapeHtml(label)}</span></li>`
      : `<li><a class="section-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`;
  }).join('');

  return `<nav class="section-nav" aria-label="${escapeHtml(city.name)} forecast sections"><ul>${items}</ul></nav>`;
}

/** Nearby catalogue cities, which is how the crawler walks the region. */
function nearbyCities(city, limit = 8) {
  return cities.CITIES
    .filter((other) => other.slug !== city.slug)
    .map((other) => ({
      city: other,
      km: cities.distanceKm(city.latitude, city.longitude, other.latitude, other.longitude),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

function contextSection(city, section, { updatedAt, alerts }) {
  const nearby = nearbyCities(city).map(({ city: other, km }) => `
    <li><a href="${escapeHtml(seo.cityPath(other))}">${escapeHtml(other.name)}</a>
      <span class="nearby-distance">${Math.round(km)} km</span></li>`).join('');

  const PROVIDER_NAMES = { nws: 'the US National Weather Service', eccc: 'Environment and Climate Change Canada' };
  const named = ((alerts && alerts.sources) || []).map((id) => PROVIDER_NAMES[id]).filter(Boolean);
  const official = named.length
    ? `Official warnings for ${escapeHtml(city.name)} come from ${escapeHtml(named.join(' and '))}.`
    : 'No national weather service publishes point alerts here, so only computed watches are shown.';

  return `
    <section class="panel panel-context">
      <header class="panel-head"><h2>About this ${escapeHtml(city.name)} forecast</h2></header>
      <p>
        Updated ${escapeHtml(new Date(updatedAt || Date.now()).toISOString().replace('T', ' ').slice(0, 16))} UTC,
        and refreshed automatically every few minutes. Forecast data comes from Open-Meteo's
        multi-model blend; radar frames from RainViewer; the 20-year normals and records from
        the ERA5 reanalysis archive. ${official}
      </p>
      <p>
        Watches labelled <em>computed</em> are worked out on this site from forecast thresholds
        and are not official warnings — always defer to your national weather service.
      </p>
      ${sectionNav(city, section)}
    </section>

    <section class="panel panel-nearby">
      <header class="panel-head">
        <h2>Weather near ${escapeHtml(city.name)}</h2>
        <p class="panel-sub">Forecasts for the closest places we publish.</p>
      </header>
      <ul class="nearby-list">${nearby}</ul>
      <p class="panel-foot"><a href="/weather">Every city we cover →</a></p>
    </section>`;
}

/* ------------------------------------------------------------------ page */

async function renderCityPage(city, section = 'overview') {
  const mods = await load();
  const { viewmodel, forecast: views, panels, tables, wmo } = mods;

  const { data, alerts, almanac } = await gather(city);
  const units = UNITS_BY_COUNTRY[city.countryCode] || METRIC;

  const heading = seo.cityHeading(city, section);
  const vm = viewmodel.buildViewModel({
    data,
    place: {
      id: `city:${city.slug}`,
      name: city.name,
      admin1: city.region,
      country: city.country,
      countryCode: city.countryCode,
      latitude: city.latitude,
      longitude: city.longitude,
    },
    units,
    alerts,
    almanac,
  });
  vm.heading = heading;

  const summary = summarize(vm, mods);
  const canonical = site.url(seo.cityPath(city, section));
  const ogImage = site.url(`/api/og?city=${city.slug}`);

  const jsonLd = [
    seo.breadcrumbJsonLd([
      { name: site.name, path: '/' },
      { name: 'Weather', path: '/weather' },
      { name: city.name, path: seo.cityPath(city) },
      ...(section === 'overview' ? [] : [{ name: seo.SECTIONS[section].label, path: seo.cityPath(city, section) }]),
    ]),
    seo.placeJsonLd(city),
  ];

  const questions = tables.forecastQuestions(vm);
  if (section === 'overview') {
    const faq = seo.faqJsonLd(questions);
    if (faq) jsonLd.push(faq);
  }

  const head = seo.headTags({
    title: seo.cityTitle(city, section),
    description: seo.cityDescription(city, section, summary),
    canonical,
    image: ogImage,
    imageAlt: summary ? `${city.name}: ${summary.temperature}, ${summary.condition}` : `${city.name} weather`,
    jsonLd,
  });

  // Section pages carry the thing that justifies their existence: a full
  // table, or the radar's timing read. The overview carries the answers.
  const detail = section === 'hourly' ? tables.renderHourlyTable(vm)
    : section === '10-day' ? tables.renderDailyTable(vm)
    : section === 'radar' ? tables.renderRadarSummary(vm)
    : tables.renderQuestions(vm);

  const condition = vm.current ? wmo.skyTheme(vm.current.weather_code, vm.current.is_day) : 'clear-day';
  const theme = vm.current && vm.current.is_day ? 'light' : 'dark';

  const html = renderDocument({
    head,
    view: seo.SECTIONS[section].view,
    sky: condition,
    theme,
    mounts: {
      alerts: panels.renderAlerts(vm),
      hero: views.renderHero(vm),
      hourly: views.renderHourly(vm),
      details: views.renderDetails(vm),
      air: panels.renderAir(vm),
      daily: views.renderDaily(vm),
      activities: panels.renderActivities(vm),
      astro: panels.renderAstro(vm),
      almanac: panels.renderAlmanac(vm),
      'page-detail': detail,
      'page-context': contextSection(city, section, { updatedAt: data.fetchedAt, alerts }),
    },
    bootstrap: {
      page: 'city',
      slug: city.slug,
      section,
      basePath: seo.cityPath(city),
      // Two sections share the "today" tab (the overview and /hourly), so the
      // section actually being viewed claims that tab -- otherwise clicking
      // away and back would quietly move the visitor to the other URL.
      sectionPaths: {
        ...Object.fromEntries(
          seo.SECTION_ORDER.map((name) => [seo.SECTIONS[name].view, seo.cityPath(city, name)])
        ),
        [seo.SECTIONS[section].view]: seo.cityPath(city, section),
      },
      heading,
      units,
      // No id: the client derives one from the coordinates, so a city saved
      // from this page is the same entry as the one added from the search box.
      place: {
        name: city.name,
        admin1: city.region,
        country: city.country,
        countryCode: city.countryCode,
        latitude: city.latitude,
        longitude: city.longitude,
      },
    },
  });

  return { html, summary };
}

module.exports = { renderCityPage, nearbyCities, summarize, METRIC, UNITS_BY_COUNTRY };
