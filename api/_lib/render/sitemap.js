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

function urlEntry({ loc, changefreq, priority }) {
  return `  <url>\n    <loc>${loc}</loc>\n` +
    `    <changefreq>${changefreq}</changefreq>\n` +
    `    <priority>${priority}</priority>\n  </url>`;
}

function renderSitemap() {
  const entries = [
    urlEntry({ loc: site.url('/'), changefreq: 'hourly', priority: '1.0' }),
    urlEntry({ loc: site.url('/weather'), changefreq: 'daily', priority: '0.8' }),
    urlEntry({ loc: site.url('/widgets'), changefreq: 'monthly', priority: '0.5' }),
  ];

  for (const city of cities.CITIES) {
    for (const section of seo.SECTION_ORDER) {
      entries.push(urlEntry({
        loc: site.url(seo.cityPath(city, section)),
        // The forecast on every one of these changes through the day; saying
        // so is the honest signal, and it is the reason the pages exist.
        changefreq: 'hourly',
        priority: section === 'overview' ? '0.9' : '0.7',
      }));
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries.join('\n')}\n</urlset>\n`;
}

function renderRobots() {
  return [
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
