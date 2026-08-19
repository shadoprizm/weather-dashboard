'use strict';

/**
 * `/weather` — the index of every city that has a page.
 *
 * This is the hub that makes the whole catalogue crawlable: one internal link
 * per city, grouped by country and region so it reads as a directory rather
 * than a link dump, and it is the page a search engine follows to find the
 * rest of the site.
 */

const site = require('../site');
const seo = require('../seo');
const cities = require('../cities');
const { renderDocument, escapeHtml } = require('./shell');

function group(list) {
  const byRegion = new Map();
  for (const city of list) {
    const key = city.region || city.country;
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key).push(city);
  }
  return [...byRegion.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([region, group2]) => ({
      region,
      cities: group2.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function renderIndexPage() {
  const countries = cities.byCountry();

  const body = countries.map((country) => `
    <section class="panel panel-directory">
      <header class="panel-head">
        <h2 id="country-${escapeHtml(country.code.toLowerCase())}">${escapeHtml(country.name)}</h2>
        <p class="panel-sub">${country.cities.length} ${country.cities.length === 1 ? 'city' : 'cities'}</p>
      </header>
      ${group(country.cities).map((region) => `
        <div class="directory-region">
          <h3>${escapeHtml(region.region)}</h3>
          <ul class="directory-list">
            ${region.cities.map((city) => `
              <li><a href="${escapeHtml(seo.cityPath(city))}">${escapeHtml(city.name)} weather</a></li>`).join('')}
          </ul>
        </div>`).join('')}
    </section>`).join('');

  const intro = `
    <section class="panel panel-hero panel-intro">
      <h1>Weather by city</h1>
      <p class="lede">
        Every city below has a full forecast page: current conditions, an
        hour-by-hour table, a 14-day outlook, live radar, air quality, sunrise
        and sunset, official alerts and 20-year normals — with a plain-English
        read on what the day actually holds.
      </p>
      <p>
        Somewhere not listed? The dashboard searches everywhere on Earth —
        <a href="/">open ${escapeHtml(site.name)}</a> and type any place name. We publish a
        page for a city once it is somewhere people actually look for, rather
        than generating one for every coordinate on the map.
      </p>
    </section>`;

  const head = seo.headTags({
    title: `Weather by City — Forecasts for ${cities.CITIES.length} Cities | ${site.name}`,
    description:
      `Fast, ad-free weather for ${cities.CITIES.length} cities across Canada, the United States ` +
      'and beyond. Hourly and 14-day forecasts, live radar, air quality and official alerts.',
    canonical: site.url('/weather'),
    image: site.url('/api/og'),
    imageAlt: `${site.name} — weather by city`,
    jsonLd: [
      seo.websiteJsonLd(),
      seo.breadcrumbJsonLd([
        { name: site.name, path: '/' },
        { name: 'Weather', path: '/weather' },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Weather by city',
        url: site.url('/weather'),
        about: cities.CITIES.slice(0, 50).map((city) => ({
          '@type': 'Place',
          name: city.label,
          url: site.url(seo.cityPath(city)),
        })),
      },
    ],
  });

  return renderDocument({
    head,
    // The directory has no forecast of its own: hide the dashboard's panels
    // rather than shipping empty skeletons a crawler would have to read past.
    mounts: {
      alerts: '',
      hero: intro,
      hourly: '', details: '', air: '', daily: '', activities: '', astro: '',
      almanac: '', compare: '',
      'page-detail': body,
      'page-context': '',
    },
    tabs: false,
    bootstrap: { page: 'directory' },
  });
}

module.exports = { renderIndexPage };
