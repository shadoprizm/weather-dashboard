'use strict';

/**
 * The XML sitemap, generated from the city catalogue.
 *
 * Generated rather than hand-maintained for one reason: a sitemap that lists a
 * URL which 404s, or omits one that exists, costs more than not having one.
 * Deriving it from the same list the router uses makes both impossible.
 */

const site = require('./../site');
const seo = require('./../seo');
const cities = require('./../cities');
const stories = require('./../stories');

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return `  <url>\n    <loc>${loc}</loc>\n` +
    (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
    `    <changefreq>${changefreq}</changefreq>\n` +
    `    <priority>${priority}</priority>\n  </url>`;
}

function renderSitemap({ now = new Date(), storyList = null } = {}) {
  // Forecasts change throughout the day. The sitemap is edge-cached for an
  // hour, so this timestamp accurately describes the current published batch
  // without claiming second-by-second churn.
  const forecastLastmod = new Date(now).toISOString().replace(/:\d{2}\.\d{3}Z$/, ':00Z');
  const entries = [
    urlEntry({ loc: site.url('/'), lastmod: forecastLastmod, changefreq: 'hourly', priority: '1.0' }),
    urlEntry({ loc: site.url('/weather'), lastmod: forecastLastmod, changefreq: 'daily', priority: '0.8' }),
    urlEntry({ loc: site.url('/widgets'), changefreq: 'monthly', priority: '0.5' }),
    urlEntry({ loc: site.url('/weather-guide'), lastmod: '2026-08-19', changefreq: 'monthly', priority: '0.7' }),
  ];

  for (const city of cities.CITIES) {
    for (const section of seo.SECTION_ORDER) {
      entries.push(urlEntry({
        loc: site.url(seo.cityPath(city, section)),
        lastmod: forecastLastmod,
        // The forecast on every one of these changes through the day; saying
        // so is the honest signal, and it is the reason the pages exist.
        changefreq: 'hourly',
        priority: section === 'overview' ? '0.9' : '0.7',
      }));
    }
  }

  const currentStories = storyList || stories.publishedStories({ now });
  if (currentStories.length) {
    entries.push(urlEntry({
      loc: site.url('/weather-stories'),
      lastmod: currentStories[0].publishedAt,
      changefreq: 'daily',
      priority: '0.7',
    }));
    for (const story of currentStories) {
      entries.push(urlEntry({
        loc: site.url(stories.storyPath(story)),
        lastmod: story.publishedAt,
        changefreq: 'weekly',
        priority: '0.6',
      }));
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries.join('\n')}\n</urlset>\n`;
}

function renderRobots() {
  return [
    '# Search and answer engines are welcome to index public forecast pages.',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'Disallow: /api/',
    'Allow: /api/og',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    'Disallow: /api/',
    'Allow: /api/og',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    'Disallow: /api/',
    'Allow: /api/og',
    '',
    'User-agent: *',
    'Allow: /',
    // Nothing here is secret; these simply have no business in an index.
    'Disallow: /api/',
    'Allow: /api/og',
    '',
    `Sitemap: ${site.url('/sitemap.xml')}`,
    '',
  ].join('\n');
}

module.exports = { renderSitemap, renderRobots };
