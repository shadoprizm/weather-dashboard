/**
 * Server-rendering tests for the pages under /weather.
 *
 * The upstream is stubbed with the same synthetic forecast the view tests use,
 * so this exercises the whole document path -- view model, views, shell
 * injection, metadata, structured data -- offline and in milliseconds.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildFixture } = await import(new URL('./fixture.mjs', import.meta.url).href);

// Stub the upstream before anything reads it. The renderer calls these through
// the module object, so replacing the properties is enough.
const handlers = require('../api/_lib/handlers');
handlers.forecast = async () => ({ status: 200, body: buildFixture(), maxAge: 300 });
handlers.alerts = async () => ({
  status: 200,
  maxAge: 180,
  body: {
    alerts: [{
      id: 'test-1', event: 'Severe Thunderstorm Watch', headline: 'Conditions favour storms',
      description: 'Storms possible this afternoon.', severity: 'Severe', area: 'City of Toronto',
      sender: 'ECCC', source: 'ECCC', url: 'https://weather.gc.ca/', onset: null, expires: null,
    }],
    sources: ['eccc'],
    coverage: 'official',
  },
});
handlers.almanac = async () => ({
  status: 200,
  maxAge: 86400,
  body: {
    available: true, date: '2026-08-17', windowDays: 3, years: 20,
    normalHigh: 26.1, normalLow: 16.4, normalPrecip: 2.3, wetDayOdds: 0.31,
    recordHigh: { value: 36.2, date: '2016-08-16' },
    recordLow: { value: 8.1, date: '2009-08-18' },
  },
});

const pages = require('../api/_lib/pages');
const seo = require('../api/_lib/seo');
const cities = require('../api/_lib/cities');
const site = require('../api/_lib/site');

/* --- catalogue ---------------------------------------------------------- */

assert.ok(cities.CITIES.length > 100, 'catalogue should be substantial');
assert.equal(cities.bySlug('toronto').name, 'Toronto');
assert.equal(cities.bySlug('TORONTO').name, 'Toronto', 'slug lookup is case-insensitive');
assert.equal(cities.bySlug('nowhere'), null);
assert.equal(cities.bySlug('portland-or').region, 'Oregon');
assert.equal(cities.bySlug('portland-me').region, 'Maine');
assert.equal(cities.nearest(43.70, -79.40).city.slug, 'toronto');
assert.equal(cities.nearest(0, 0), null, 'a point in the ocean matches nothing');
for (const city of cities.CITIES) {
  assert.match(city.slug, /^[a-z0-9-]+$/, `${city.name} has a URL-safe slug`);
  assert.ok(Math.abs(city.latitude) <= 90 && Math.abs(city.longitude) <= 180, `${city.name} coordinates`);
}

/* --- overview page ------------------------------------------------------ */

const overview = await pages.cityPage({ slug: 'toronto' });
assert.equal(overview.status, 200);
assert.match(overview.contentType, /text\/html/);
assert.ok(overview.maxAge > 0, 'city pages are cacheable at the edge');

const html = overview.body;
assert.match(html, /<title>Toronto, ON Weather — Hourly &amp; 10-Day Forecast \| WeatherView<\/title>/);
assert.match(html, /<link rel="canonical" href="https:\/\/www\.weatherview\.cloud\/weather\/toronto">/);
assert.match(html, /<h1 class="hero-place">Toronto Weather<\/h1>/);

// The forecast itself must be in the HTML, not fetched afterwards.
assert.match(html, /hero-temp/, 'current conditions are server-rendered');
assert.match(html, /Severe Thunderstorm Watch/, 'official alerts are server-rendered');
assert.match(html, /panel-questions/, 'the plain-English answers are server-rendered');
assert.ok(!html.includes('skeleton-hero'), 'no loading skeleton survives on a rendered page');
assert.match(html, /id="page-context"[\s\S]*?Weather near Toronto/, 'internal links to nearby cities');
assert.match(html, /href="\/weather\/hamilton"/, 'nearby cities link by slug');
assert.match(html, /href="\/weather\/toronto\/hourly"/, 'sections cross-link');

// Structured data has to parse, and has to match the page.
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1].replace(/\\u003c/g, '<')));
const types = blocks.map((block) => block['@type']);
assert.deepEqual(types, ['BreadcrumbList', 'Place', 'FAQPage']);
assert.equal(blocks[1].geo.latitude, 43.6532);
assert.ok(blocks[2].mainEntity.length >= 3, 'the FAQ block carries the questions');
for (const entry of blocks[2].mainEntity) {
  assert.ok(html.includes(entry.acceptedAnswer.text.replace(/&/g, '&amp;')),
    'every structured answer is visible on the page');
}

/* --- section pages ------------------------------------------------------ */

const hourly = await pages.cityPage({ slug: 'toronto', section: 'hourly' });
assert.match(hourly.body, /<title>Toronto, ON Hourly Weather — Next 48 Hours/);
assert.match(hourly.body, /<link rel="canonical" href="https:\/\/www\.weatherview\.cloud\/weather\/toronto\/hourly">/);
assert.match(hourly.body, /Hour-by-hour forecast for Toronto/);
assert.match(hourly.body, /id="tab-today"[^>]*aria-selected="true"/);

const tenDay = await pages.cityPage({ slug: 'toronto', section: '10-day' });
assert.match(tenDay.body, /<title>Toronto, ON 10-Day Weather Forecast/);
assert.match(tenDay.body, /\d+-day forecast for Toronto/);
assert.match(tenDay.body, /id="tab-week"[^>]*aria-selected="true"/);
assert.match(tenDay.body, /id="view-week"[^>]*tabindex="0">/, 'the week panel is open');

const radar = await pages.cityPage({ slug: 'toronto', section: 'radar' });
assert.match(radar.body, /<title>Toronto, ON Weather Radar/);
assert.match(radar.body, /Rain and snow timing for Toronto/);
assert.match(radar.body, /id="tab-radar"[^>]*aria-selected="true"/);

// Each section must carry something the others do not, or it is a duplicate.
assert.ok(!overview.body.includes('Hour-by-hour forecast for Toronto'));
assert.ok(!hourly.body.includes('Rain and snow timing for Toronto'));
assert.ok(!tenDay.body.includes("Hour-by-hour forecast for Toronto"));

/* --- imperial units for US cities --------------------------------------- */

const chicago = await pages.cityPage({ slug: 'chicago' });
assert.match(chicago.body, /°F|mph/, 'US pages render in imperial by default');

/* --- unknown slugs are honest 404s -------------------------------------- */

const missing = await pages.cityPage({ slug: 'not-a-city' });
assert.equal(missing.status, 404, 'an unpublished city is a real 404, not a soft one');
assert.match(missing.body, /<meta name="robots" content="noindex, follow">/);
assert.equal((await pages.cityPage({ slug: 'toronto', section: 'bogus' })).status, 404);

/* --- the directory ------------------------------------------------------ */

const index = await pages.cityIndex();
assert.equal(index.status, 200);
assert.match(index.body, /<h1>Weather by city<\/h1>/);
// Countries we cover without a region breakdown must not repeat their own name
// as a subheading under themselves.
assert.ok(!/<h2 id="country-gb">United Kingdom<\/h2>[\s\S]{0,400}<h3>United Kingdom<\/h3>/.test(index.body),
  'no region subheading that just repeats the country');
assert.match(index.body, /<h3>Ontario<\/h3>/, 'countries with regions keep them');
for (const city of cities.CITIES) {
  assert.ok(index.body.includes(`href="${seo.cityPath(city)}"`), `${city.name} is linked from /weather`);
}

/* --- sitemap and robots ------------------------------------------------- */

const sitemap = await pages.sitemap();
assert.match(sitemap.contentType, /application\/xml/);
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.equal(new Set(locs).size, locs.length, 'no duplicate URLs in the sitemap');
assert.equal(locs.length, 3 + cities.CITIES.length * seo.SECTION_ORDER.length);
for (const loc of locs) assert.ok(loc.startsWith(site.origin), `${loc} is absolute`);
assert.ok(locs.includes(site.url('/weather/toronto/10-day')));

const robots = await pages.robots();
assert.match(robots.body, /^User-agent: \*$/m);
assert.match(robots.body, new RegExp(`^Sitemap: ${site.origin}/sitemap\\.xml$`, 'm'));

/* --- the hydration bootstrap -------------------------------------------- */

function bootstrapOf(html) {
  const match = html.match(/<script type="application\/json" id="wv-bootstrap">([\s\S]*?)<\/script>/);
  assert.ok(match, 'every server-rendered page hands the client its context');
  return JSON.parse(match[1].replace(/\\u003c/g, '<'));
}

const overviewBoot = bootstrapOf(overview.body);
assert.equal(overviewBoot.page, 'city');
assert.equal(overviewBoot.slug, 'toronto');
assert.equal(overviewBoot.heading, 'Toronto Weather', 'the H1 survives hydration');
assert.equal(overviewBoot.place.id, undefined,
  'no id: the client derives one from coordinates so saving matches the search box');
assert.equal(overviewBoot.place.latitude, 43.6532);

// Two sections share the "Today" tab. Whichever is being viewed keeps its URL,
// so clicking to Week and back does not silently move the visitor.
assert.equal(overviewBoot.sectionPaths.today, '/weather/toronto');
assert.equal(bootstrapOf(hourly.body).sectionPaths.today, '/weather/toronto/hourly');
assert.equal(overviewBoot.sectionPaths.week, '/weather/toronto/10-day');
assert.equal(overviewBoot.sectionPaths.radar, '/weather/toronto/radar');

// The directory and the builder must tell the client not to paint a forecast
// over them.
const directory = await pages.cityIndex();
assert.equal(bootstrapOf(directory.body).page, 'directory');
assert.equal(bootstrapOf(missing.body).page, 'not-found');

// ...and must not leave a dead tab bar above content that has no sections,
// nor a styled hero card wrapped around a page that brings its own panel.
assert.match(directory.body, /<nav class="tabs" role="tablist" hidden/);
assert.match(directory.body, /<section id="hero" aria-label="Page introduction">/);
assert.match(missing.body, /<section id="hero" aria-label="Page introduction">/);
assert.match(overview.body, /<section id="hero" class="panel panel-hero"/,
  'a city page keeps the hero card -- the forecast lives in it');
assert.ok(!/<nav class="tabs" role="tablist" hidden/.test(overview.body), 'city pages keep their tabs');

console.log('All page-rendering checks passed.');

/* --- the widget ---------------------------------------------------------- */

const { renderWidget, widgetOptions } = require('../api/_lib/render/widget');

assert.equal(widgetOptions({ city: 'toronto' }).place.name, 'Toronto');
assert.equal(widgetOptions({ city: 'chicago' }).units.temp, 'f', 'US widgets default to Fahrenheit');
assert.equal(widgetOptions({ city: 'chicago', units: 'metric' }).units.temp, 'c', 'and can be overridden');
assert.equal(widgetOptions({ city: 'toronto', days: '99' }).days, 7, 'days are clamped');
assert.equal(widgetOptions({ city: 'toronto', accent: 'javascript:x' }).accent, null, 'only hex accents');
assert.equal(widgetOptions({ city: 'toronto', accent: '00aaff' }).accent, '#00aaff');
assert.equal(widgetOptions({ lat: '43.65', lon: '-79.38' }).place.href, '/weather/toronto',
  'a coordinate near a published city links to that city');
assert.equal(widgetOptions({}).place, null);

const widget = await renderWidget({ city: 'toronto', days: '3' });
assert.equal(widget.status, 200);
assert.match(widget.body, /Weather powered by <a[^>]*>WeatherView<\/a>/, 'the credit link is not optional');
assert.match(widget.body, /<meta name="robots" content="noindex">/, 'widgets never compete with city pages');
assert.match(widget.body, /<meta http-equiv="refresh"/, 'the widget refreshes itself');
assert.match(widget.body, /href="https:\/\/www\.weatherview\.cloud\/weather\/toronto"/);
assert.ok(!widget.body.includes('<script'), 'a plain embed runs no script at all');
assert.equal((widget.body.match(/class="wv-day"/g) || []).length, 3);

const embedded = await renderWidget({ city: 'toronto', embed: '1' });
assert.match(embedded.body, /<script src="\/js\/widget-frame\.js">/, 'the embed loader opts in to auto-sizing');

assert.equal((await renderWidget({})).status, 400, 'a widget with no place says so');

/* --- the widget builder -------------------------------------------------- */

const widgets = await pages.widgetsPage();
assert.equal(widgets.status, 200);
assert.match(widgets.body, /<h1>Put the weather on your website. Free.<\/h1>/);
assert.match(widgets.body, /id="widget-builder"/);
assert.match(widgets.body, /<link rel="canonical" href="https:\/\/www\.weatherview\.cloud\/widgets">/);
assert.ok(widgets.body.includes('value="toronto"'), 'every published city is offerable');
assert.match(widgets.body, /<nav class="tabs" role="tablist" hidden/, 'no dead tab bar');
assert.match(widgets.body, /<section id="hero" aria-label="Page introduction">/, 'no nested card');

/* --- share cards --------------------------------------------------------- */

const { ogCard } = require('../api/_lib/og');
const card = await ogCard({ city: 'toronto' });
assert.equal(card.contentType, 'image/png');
assert.ok(Buffer.isBuffer(card.body));
assert.deepEqual([...card.body.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a real PNG');
// Width and height live in the IHDR chunk, at a fixed offset for our encoder.
assert.equal(card.body.readUInt32BE(16), 1200);
assert.equal(card.body.readUInt32BE(20), 630);
assert.ok(card.maxAge > 0, 'social crawlers hit this in bursts; it must cache');

await assert.rejects(() => ogCard({}), /required/);
await assert.rejects(() => ogCard({ city: 'atlantis' }), /Unknown city/);

console.log('All widget, builder and share-card checks passed.');
