'use strict';

/**
 * Document handlers: the HTML and text responses that are not JSON.
 *
 * Same contract as `handlers.js` — a plain query object in, a
 * `{ status, body, contentType, maxAge }` out — so the local server and the
 * Vercel functions mount identical code.
 */

const site = require('./site');
const seo = require('./seo');
const cities = require('./cities');
const stories = require('./stories');
const { renderCityPage } = require('./render/city');
const { renderIndexPage } = require('./render/index-page');
const { renderWidgetsPage } = require('./render/widgets-page');
const { renderGuidePage } = require('./render/guide-page');
const { renderStoriesIndex, renderStoryPage } = require('./render/stories-page');
const { renderSitemap, renderRobots } = require('./render/sitemap');
const { renderDocument, escapeHtml } = require('./render/shell');

const HTML = 'text/html; charset=utf-8';

/**
 * A city we do not publish.
 *
 * Deliberately a real 404 with a real suggestion rather than a redirect to the
 * home page: a soft 404 teaches a crawler that every made-up slug is a valid
 * page, which is exactly how a site ends up with thousands of junk URLs.
 */
function notFound(slug) {
  const guess = cities.CITIES.filter((city) =>
    city.slug.startsWith(String(slug || '').slice(0, 3))).slice(0, 6);

  const head = seo.headTags({
    title: `Page not found | ${site.name}`,
    description: 'That city does not have a page here yet.',
    canonical: site.url('/weather'),
    robots: 'noindex, follow',
  });

  const body = `
    <section class="panel panel-hero panel-intro">
      <h1>No page for that place — yet</h1>
      <p class="lede">
        ${site.name} publishes a page for a city once it is somewhere people
        actually look for, rather than generating one for every point on the map.
        ${escapeHtml(String(slug || ''))} is not one of them.
      </p>
      <p>
        The dashboard still covers it: <a href="/">open ${escapeHtml(site.name)}</a> and search for
        any place on Earth, or browse <a href="/weather">every city we publish</a>.
      </p>
      ${guess.length ? `<ul class="directory-list">${guess.map((city) =>
        `<li><a href="${escapeHtml(seo.cityPath(city))}">${escapeHtml(city.label)}</a></li>`).join('')}</ul>` : ''}
    </section>`;

  return {
    status: 404,
    contentType: HTML,
    maxAge: 0,
    body: renderDocument({
      head,
      mounts: {
        alerts: '', hero: body, hourly: '', details: '', air: '', daily: '',
        activities: '', astro: '', almanac: '', compare: '',
        'page-detail': '', 'page-context': '',
      },
      tabs: false,
      heroPanel: false,
      bootstrap: { page: 'not-found' },
    }),
  };
}

/** `/weather/{slug}` and `/weather/{slug}/{section}`. */
async function cityPage(query = {}) {
  const slug = String(query.slug || '').toLowerCase();
  if (!slug) return cityIndex();

  const city = cities.bySlug(slug);
  if (!city) return notFound(slug);

  const section = String(query.section || 'overview').toLowerCase() || 'overview';
  if (!seo.isSection(section)) return notFound(`${slug}/${section}`);

  const { html } = await renderCityPage(city, section);

  return {
    status: 200,
    contentType: HTML,
    body: html,
    // Five minutes at the edge, served stale for twenty while it revalidates:
    // the forecast underneath only moves every few minutes, and a page that is
    // already in the CDN is a page that renders instantly.
    maxAge: 300,
  };
}

/** `/weather` — the directory. */
async function cityIndex() {
  return { status: 200, contentType: HTML, body: renderIndexPage(), maxAge: 3600 };
}

/** `/widgets` — the widget builder and its documentation. */
async function widgetsPage() {
  return { status: 200, contentType: HTML, body: renderWidgetsPage(), maxAge: 3600 };
}

/** `/weather-guide` — sourced explanations of the forecast's key numbers. */
async function guidePage() {
  return { status: 200, contentType: HTML, body: renderGuidePage(), maxAge: 86400 };
}

function storyNotFound(slug) {
  const head = seo.headTags({
    title: `Weather story not found | ${site.name}`,
    description: 'That weather story is not published.',
    canonical: site.url('/weather-stories'),
    robots: 'noindex, follow',
  });
  const hero = `
    <section class="panel panel-hero panel-intro">
      <h1>That story is not published</h1>
      <p class="lede">There is no public weather story at “${escapeHtml(String(slug || ''))}”. Drafts remain private until they have been checked against their source data.</p>
      <p><a href="/weather-stories">Browse current weather stories</a> or <a href="/weather">check a live city forecast</a>.</p>
    </section>`;
  return {
    status: 404,
    contentType: HTML,
    maxAge: 0,
    body: renderDocument({
      head,
      mounts: {
        alerts: '', hero,
        hourly: '', details: '', air: '', daily: '', activities: '', astro: '', almanac: '', compare: '',
        'page-detail': '', 'page-context': '',
      },
      tabs: false,
      heroPanel: false,
      bootstrap: { page: 'story-not-found' },
    }),
  };
}

/** `/weather-stories` — only timely, reviewed stories. */
async function storiesIndex() {
  const published = stories.publishedStories();
  return { status: 200, contentType: HTML, body: renderStoriesIndex(published), maxAge: 3600 };
}

/** `/weather-stories/{slug}` — drafts are deliberately indistinguishable from missing pages. */
async function weatherStoryPage(query = {}) {
  const slug = String(query.slug || '').toLowerCase();
  if (!slug) return storiesIndex();
  const story = stories.bySlug(slug);
  if (!story) return storyNotFound(slug);
  return { status: 200, contentType: HTML, body: renderStoryPage(story), maxAge: 3600 };
}

async function sitemap() {
  return {
    status: 200,
    contentType: 'application/xml; charset=utf-8',
    body: renderSitemap(),
    maxAge: 3600,
  };
}

async function robots() {
  return {
    status: 200,
    contentType: 'text/plain; charset=utf-8',
    body: renderRobots(),
    maxAge: 3600,
  };
}

module.exports = {
  cityPage,
  cityIndex,
  widgetsPage,
  guidePage,
  storiesIndex,
  weatherStoryPage,
  sitemap,
  robots,
  notFound,
  storyNotFound,
};
