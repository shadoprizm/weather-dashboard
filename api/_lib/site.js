'use strict';

/**
 * Everything about *this deployment* that the brand-facing surfaces need.
 *
 * City pages, the sitemap, share cards, the widget and the manifest all put
 * the site's name and absolute origin into their output, and search engines
 * are unforgiving about those disagreeing with each other. Keeping them in one
 * place means a fork only edits this file.
 *
 * `SITE_ORIGIN` overrides the origin at runtime so preview deployments do not
 * emit canonicals pointing at production.
 */

const NAME = process.env.SITE_NAME || 'WeatherView';

function normalizeOrigin(value) {
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
}

const ORIGIN =
  normalizeOrigin(process.env.SITE_ORIGIN) ||
  normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
  // The canonical host is the one the apex redirects *to*. Getting this wrong
  // puts a few hundred redirecting URLs in the sitemap and points every
  // canonical and share card at a hop rather than at the page.
  'https://www.weatherview.cloud';

const site = {
  name: NAME,
  origin: ORIGIN,
  host: ORIGIN.replace(/^https?:\/\//, ''),
  // What to *print* — on a share card, in the widget credit. Nobody reads the
  // "www." and it costs a tenth of the card's width.
  displayHost: ORIGIN.replace(/^https?:\/\//, '').replace(/^www\./, ''),

  tagline: 'Fast, ad-free weather',
  description:
    'Fast, ad-free weather. Current conditions, hourly and 14-day forecasts, ' +
    'live radar, air quality, sunrise and sunset, official alerts and 20-year ' +
    'normals — with a plain-English read on what the day actually holds.',

  locale: 'en',
  themeColor: '#0b1220',

  /** Absolute URL for a site-relative path. */
  url(path = '/') {
    if (/^https?:\/\//i.test(path)) return path;
    return `${ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
  },
};

module.exports = site;
