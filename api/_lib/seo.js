'use strict';

/**
 * Titles, descriptions, canonicals and structured data.
 *
 * Two rules run through this file:
 *
 * 1. **Say what the page is, in the words people search.** "Toronto Weather —
 *    Hourly & 10-Day Forecast" is not a cute title, and that is the point. A
 *    title is a promise about the content; the content here keeps it.
 * 2. **Never claim something the page does not show.** Every structured-data
 *    block below is generated from the same view model the page renders, so
 *    the answer a crawler is handed is the answer a visitor reads.
 */

const site = require('./site');
const { escapeHtml } = require('./render/shell');

/**
 * The section pages under a city.
 *
 * Each one exists because it is a distinct search intent *and* carries content
 * the overview does not — a full hourly table, a full daily table, the radar.
 * A section that could not justify both would just be a duplicate of the
 * overview under a second URL, which is the thing to avoid.
 */
const SECTIONS = {
  overview: { slug: '', view: 'today', label: 'Overview' },
  hourly: { slug: 'hourly', view: 'today', label: 'Hourly' },
  '10-day': { slug: '10-day', view: 'week', label: '10-day' },
  radar: { slug: 'radar', view: 'radar', label: 'Radar' },
};

const SECTION_ORDER = ['overview', 'hourly', '10-day', 'radar'];

function isSection(name) {
  return Object.prototype.hasOwnProperty.call(SECTIONS, name);
}

/** Canonical path for a city page, with or without a section. */
function cityPath(city, section = 'overview') {
  const suffix = SECTIONS[section] && SECTIONS[section].slug;
  return `/weather/${city.slug}${suffix ? `/${suffix}` : ''}`;
}

/** The H1 and <title> for a city section. */
function cityHeading(city, section) {
  switch (section) {
    case 'hourly': return `${city.name} Hourly Weather`;
    case '10-day': return `${city.name} 10-Day Forecast`;
    case 'radar': return `${city.name} Weather Radar`;
    default: return `${city.name} Weather`;
  }
}

function cityTitle(city, section) {
  const where = city.regionCode ? `${city.name}, ${city.regionCode}` : city.name;
  switch (section) {
    case 'hourly':
      return `${where} Hourly Weather — Next 48 Hours | ${site.name}`;
    case '10-day':
      return `${where} 10-Day Weather Forecast | ${site.name}`;
    case 'radar':
      return `${where} Weather Radar — Live Rain & Snow Map | ${site.name}`;
    default:
      return `${where} Weather — Hourly & 10-Day Forecast | ${site.name}`;
  }
}

/**
 * The description, written from the live forecast.
 *
 * A description that carries today's actual numbers earns clicks that a
 * boilerplate one does not, and it stays true because it is regenerated every
 * time the page is.
 */
function cityDescription(city, section, summary) {
  const place = city.label;
  if (!summary) {
    return `${place} weather: current conditions, hourly and 14-day forecast, ` +
      `live radar, air quality, sunrise and sunset, and official alerts. Fast and ad-free.`;
  }

  const now = `${place} weather right now: ${summary.temperature}, ${summary.condition.toLowerCase()}.`;

  switch (section) {
    case 'hourly':
      return `${now} Hour-by-hour forecast for the next 48 hours — temperature, ` +
        `feels-like, chance of rain, wind and humidity. ${summary.rain}`;
    case '10-day':
      return `${now} 14-day outlook with daily highs and lows, precipitation, ` +
        `wind, UV and daylight. Today ${summary.range}.`;
    case 'radar':
      return `${now} Live precipitation radar for ${city.name} with a short-range ` +
        `nowcast. ${summary.rain}`;
    default:
      return `${now} Today ${summary.range}. ${summary.rain} Hourly and 14-day ` +
        `forecast, radar, air quality and alerts — no ads, no popups.`;
  }
}

/* ------------------------------------------------------------ head tags */

function tag(name, content, { property = false } = {}) {
  if (!content) return '';
  const key = property ? 'property' : 'name';
  return `  <meta ${key}="${name}" content="${escapeHtml(content)}">`;
}

/**
 * The document-identity block: title, description, canonical, social cards
 * and any JSON-LD. Everything a search engine or a link preview reads.
 */
function headTags({ title, description, canonical, image, imageAlt, type = 'website', jsonLd = [], alternates = [], robots = null }) {
  const robotsDirective = robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  const lines = [
    `  <title>${escapeHtml(title)}</title>`,
    tag('description', description),
    canonical ? `  <link rel="canonical" href="${escapeHtml(canonical)}">` : '',
    tag('robots', robotsDirective),
    ...alternates.map((alt) => `  <link rel="${escapeHtml(alt.rel)}" href="${escapeHtml(alt.href)}"${alt.title ? ` title="${escapeHtml(alt.title)}"` : ''}>`),
    tag('og:type', type, { property: true }),
    tag('og:site_name', site.name, { property: true }),
    tag('og:title', title, { property: true }),
    tag('og:description', description, { property: true }),
    tag('og:url', canonical, { property: true }),
    tag('og:locale', 'en_CA', { property: true }),
    image ? tag('og:image', image, { property: true }) : '',
    image ? tag('og:image:width', '1200', { property: true }) : '',
    image ? tag('og:image:height', '630', { property: true }) : '',
    image && imageAlt ? tag('og:image:alt', imageAlt, { property: true }) : '',
    tag('twitter:card', image ? 'summary_large_image' : 'summary'),
    tag('twitter:title', title),
    tag('twitter:description', description),
    image ? tag('twitter:image', image) : '',
  ].filter(Boolean);

  for (const block of jsonLd) {
    lines.push(
      '  <script type="application/ld+json">' +
      JSON.stringify(block).replace(/</g, '\\u003c') +
      '</script>'
    );
  }

  return lines.join('\n');
}

/* --------------------------------------------------------- structured data */

function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.url('/'),
    description: site.description,
    publisher: organizationJsonLd({ context: false }),
  };
}

function organizationJsonLd({ context = true } = {}) {
  return {
    ...(context ? { '@context': 'https://schema.org' } : {}),
    '@type': 'Organization',
    name: site.name,
    url: site.url('/'),
    logo: site.url('/icons/icon-512.png'),
    description: site.description,
  };
}

/** Page identity and freshness, tied to the same content the visitor sees. */
function webPageJsonLd({ name, description, path, datePublished, dateModified, about = [] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: site.url(path),
    isPartOf: { '@type': 'WebSite', name: site.name, url: site.url('/') },
    publisher: organizationJsonLd({ context: false }),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    ...(about.length ? { about } : {}),
  };
}

function breadcrumbJsonLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: site.url(crumb.path),
    })),
  };
}

/** The city itself as a place entity, so the page is unambiguous about where. */
function placeJsonLd(city) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: city.name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: city.name,
      addressRegion: city.region || undefined,
      addressCountry: city.countryCode,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: city.latitude,
      longitude: city.longitude,
    },
    url: site.url(cityPath(city)),
  };
}

/** The same questions the page answers in prose, as data. */
function faqJsonLd(questions) {
  if (!questions.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((qa) => ({
      '@type': 'Question',
      name: qa.question,
      acceptedAnswer: { '@type': 'Answer', text: qa.answer },
    })),
  };
}

module.exports = {
  SECTIONS,
  SECTION_ORDER,
  isSection,
  cityPath,
  cityHeading,
  cityTitle,
  cityDescription,
  headTags,
  websiteJsonLd,
  organizationJsonLd,
  webPageJsonLd,
  breadcrumbJsonLd,
  placeJsonLd,
  faqJsonLd,
};
