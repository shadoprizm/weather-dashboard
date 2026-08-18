'use strict';

/**
 * Environment and Climate Change Canada alerts.
 *
 * ECCC has no point-queryable alert API. Warnings are distributed two ways:
 * as CAP XML on the MSC Datamart (a date/office/hour directory tree that
 * would need crawling and per-file polygon tests), and inside the citypage
 * weather XML for each of ~880 named sites.
 *
 * We use the citypage route. It costs two cacheable requests instead of a
 * directory crawl:
 *
 *   1. `site_list_en.csv` -> every site with coordinates (cached for a week;
 *      the list changes a few times a year)
 *   2. `citypage_weather/xml/<PROV>/<code>_e.xml` for the nearest site,
 *      whose <warnings> block carries the active events
 *
 * Trade-off worth knowing: this reports the warnings for the nearest named
 * site rather than for your exact coordinates. In practice ECCC issues
 * warnings by forecast region and the named site is the region's anchor, so
 * they agree — but a point far from any site can be misleading, which is why
 * `nearestSite` refuses beyond MAX_SITE_DISTANCE_KM.
 */

const { fetchTextSoft, probeUrl } = require('../upstream');
const { findTags, findTag, textOf } = require('../xml');
const cache = require('../cache');

const SITE_LIST = 'https://dd.weather.gc.ca/citypage_weather/docs/site_list_en.csv';
const CITYPAGE = (province, code) =>
  `https://dd.weather.gc.ca/citypage_weather/xml/${province}/${code}_e.xml`;

const BOUNDS = { minLat: 41, maxLat: 84, minLon: -142, maxLon: -52 };
const MAX_SITE_DISTANCE_KM = 150;

function covers(lat, lon) {
  return lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat
    && lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon;
}

/* ------------------------------------------------------------- site list */

/** Split one CSV row, honouring quoted fields. */
function splitRow(row) {
  const fields = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (char === '"') {
      if (quoted && row[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(current); current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

const CODE_PATTERN = /^s\d{7}$/i;
const LAT_PATTERN = /^(\d+(?:\.\d+)?)\s*([NS])$/i;
const LON_PATTERN = /^(\d+(?:\.\d+)?)\s*([EW])$/i;
const PROVINCE_PATTERN = /^(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/i;

/**
 * Parse the site list by matching each field's SHAPE rather than by column
 * index, so a reordered or extra column does not silently break the lookup.
 */
function parseSiteList(csv) {
  if (!csv) return [];
  const sites = [];

  for (const line of csv.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = splitRow(line);
    if (fields.length < 4) continue;

    const code = fields.find((f) => CODE_PATTERN.test(f));
    if (!code) continue;                        // header and junk rows

    const latField = fields.find((f) => LAT_PATTERN.test(f));
    const lonField = fields.find((f) => LON_PATTERN.test(f));
    const province = fields.find((f) => PROVINCE_PATTERN.test(f));
    if (!latField || !lonField || !province) continue;

    const [, latValue, latHemi] = latField.match(LAT_PATTERN);
    const [, lonValue, lonHemi] = lonField.match(LON_PATTERN);

    // The name is the first field that is none of the structured ones.
    const name = fields.find((f) =>
      f && f !== code && f !== latField && f !== lonField && f !== province);

    sites.push({
      code: code.toLowerCase(),
      name: name || code,
      province: province.toUpperCase(),
      latitude: Number(latValue) * (latHemi.toUpperCase() === 'S' ? -1 : 1),
      longitude: Number(lonValue) * (lonHemi.toUpperCase() === 'W' ? -1 : 1),
    });
  }

  return sites;
}

const SITES_TTL_OK = 7 * 86400;   // the list is near-static
const SITES_TTL_FAIL = 60;        // do not let one bad fetch blind us for a week

/**
 * The site list, cached.
 *
 * Success is cached for a week. Failure is cached for a minute: caching an
 * empty list for the success TTL would mean a single transient outage
 * silently disabled Canadian alerts long after the upstream recovered, while
 * still absorbing a burst of retries.
 */
async function loadSites() {
  const cached = cache.get('eccc:sites');
  if (cached && cached.length) return cached;
  if (cached) return cached; // a recent failure; the short TTL will expire it

  const csv = await fetchTextSoft(SITE_LIST, null, { timeoutMs: 15000 });
  const sites = parseSiteList(csv);
  cache.set('eccc:sites', sites, sites.length ? SITES_TTL_OK : SITES_TTL_FAIL);
  return sites;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

function distanceKm(aLat, aLon, bLat, bLon) {
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestSite(sites, lat, lon) {
  let best = null;
  let bestDistance = Infinity;

  for (const site of sites) {
    const distance = distanceKm(lat, lon, site.latitude, site.longitude);
    if (distance < bestDistance) { bestDistance = distance; best = site; }
  }

  if (!best || bestDistance > MAX_SITE_DISTANCE_KM) return null;
  return { ...best, distanceKm: bestDistance };
}

/* ---------------------------------------------------------------- events */

/**
 * ECCC event types, loosely. Matching on substrings rather than an exact set
 * means a new type ("special air quality statement") still lands somewhere
 * sensible instead of being dropped.
 */
function severityOf(type, priority, description) {
  const haystack = `${type || ''} ${description || ''}`.toLowerCase();

  if (/\bended\b|\bende[dr]\b|no longer in effect/.test(haystack)) return null; // not an alert
  if (String(priority).toLowerCase() === 'urgent') return 'Extreme';
  if (haystack.includes('warning')) return 'Severe';
  if (haystack.includes('watch')) return 'Moderate';
  if (haystack.includes('advisory')) return 'Moderate';
  if (haystack.includes('statement')) return 'Minor';

  const byPriority = { high: 'Severe', medium: 'Moderate', low: 'Minor' };
  return byPriority[String(priority).toLowerCase()] || 'Unknown';
}

/** ECCC stamps times as YYYYMMDDHHMMSS; the eventIssue block is UTC. */
function timeStampToIso(stamp) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/.exec(String(stamp || '').trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s || '00'}Z`;
}

/** Pull the normalised alert list out of a citypage document. */
function parseWarnings(xml, site) {
  const warnings = findTag(xml, 'warnings');
  if (!warnings) return [];

  const bulletinUrl = warnings.attributes.url || null;
  const area = site ? `${site.name}, ${site.province}` : null;
  const alerts = [];

  for (const event of findTags(warnings.inner, 'event')) {
    const { type, priority, description } = event.attributes;
    const title = description || type;
    if (!title) continue;

    const severity = severityOf(type, priority, description);
    if (!severity) continue;                    // "ended" entries are history

    // Several dateTime blocks appear per event; eventIssue is the one we want.
    const issued = findTags(event.inner, 'dateTime')
      .find((node) => node.attributes.name === 'eventIssue');
    const onset = issued ? timeStampToIso(textOf(issued.inner, 'timeStamp')) : null;

    alerts.push({
      id: `eccc:${site ? site.code : 'unknown'}:${title}`,
      event: title,
      // Citypage carries the headline only; the full bulletin lives behind
      // `url`, which the UI links to instead of showing empty body text.
      headline: null,
      description: null,
      instruction: null,
      severity,
      urgency: null,
      certainty: null,
      area,
      sender: 'Environment and Climate Change Canada',
      onset,
      expires: null,
      url: bulletinUrl,
      source: 'ECCC',
    });
  }

  return alerts;
}

/**
 * Report what this provider can actually see right now.
 *
 * "No alerts" and "the feed broke" look identical from the outside, which is
 * exactly the failure a silent provider produces. This distinguishes them.
 * It reuses the cached site list rather than refetching, so it reports the
 * state the app is really operating on and cannot be used to amplify traffic
 * at the upstream.
 */
async function diagnose(lat, lon) {
  const started = Date.now();
  const inBounds = covers(lat, lon);
  const sites = await loadSites();
  const site = sites && sites.length ? nearestSite(sites, lat, lon) : null;

  // When the list is empty, go straight at the URL to find out why.
  const siteListProbe = (!sites || !sites.length) ? await probeUrl(SITE_LIST) : null;

  let citypage = null;
  let parsed = null;

  if (site) {
    const xml = await fetchTextSoft(CITYPAGE(site.province, site.code), null, { timeoutMs: 12000 });
    citypage = xml
      ? {
          ok: true,
          bytes: xml.length,
          hasWarningsElement: /<warnings/i.test(xml),
          eventElements: (xml.match(/<event\b/gi) || []).length,
        }
      : { ok: false };
    if (xml) parsed = parseWarnings(xml, site);
  }

  return {
    provider: 'ECCC',
    inBounds,
    siteList: {
      ok: Boolean(sites && sites.length),
      parsedSites: sites ? sites.length : 0,
      url: SITE_LIST,
      probe: siteListProbe || undefined,
    },
    nearestSite: site
      ? { name: site.name, province: site.province, code: site.code, distanceKm: Number(site.distanceKm.toFixed(1)) }
      : null,
    citypage,
    activeAlerts: parsed ? parsed.length : 0,
    ms: Date.now() - started,
  };
}

/* ---------------------------------------------------------------- public */

async function fetchAlerts(lat, lon) {
  const sites = await loadSites();
  if (!sites || !sites.length) return [];

  const site = nearestSite(sites, lat, lon);
  if (!site) return [];

  const xml = await fetchTextSoft(CITYPAGE(site.province, site.code), null, { timeoutMs: 12000 });
  if (!xml) return [];

  return parseWarnings(xml, site);
}

module.exports = {
  id: 'ECCC',
  label: 'Environment and Climate Change Canada',
  covers,
  fetchAlerts,
  diagnose,
  // Exported for the test suite and the live verification script.
  _internals: { parseSiteList, parseWarnings, nearestSite, severityOf, timeStampToIso, distanceKm, SITE_LIST, CITYPAGE },
};
